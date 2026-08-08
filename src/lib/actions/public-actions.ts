"use server";

import { headers } from "next/headers";
import {
  contributorIdentitySchema,
  consentAcceptanceSchema,
  type ContributorIdentityInput,
} from "@/lib/validation";
import { getActiveCampaignBySlug, getQuestionsForAudience } from "@/lib/data/campaigns";
import { getDefaultOrganization } from "@/lib/data/organization";
import {
  allAnswersHaveConfirmedMedia,
  createContributor,
  createSubmission,
  getSubmissionState,
  hasActiveConsent,
  recordConsent,
  transitionSubmission,
} from "@/lib/data/submissions";
import { enqueueTranscriptionJobs } from "@/lib/data/processing";
import { isProcessingPipelineEnabled } from "@/lib/providers/transcription";
import { CURRENT_CONSENT_VERSION, buildConsentText } from "@/lib/consent";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { hashIp } from "@/lib/hash";
import { logAuditEvent, trackAnalyticsEvent } from "@/lib/audit";

export interface StartSubmissionResult {
  ok: boolean;
  error?: string;
  submissionId?: string;
  recordingMode?: "quick_answers" | "guided_story";
  maxDurationSeconds?: number;
  consentVersion?: string;
  consentText?: string;
  answers?: { id: string; prompt: string; helpText: string | null; order: number }[];
}

export async function startSubmissionAction(
  campaignSlug: string,
  identity: ContributorIdentityInput,
): Promise<StartSubmissionResult> {
  const hdrs = await headers();
  const ip = clientIpFromHeaders(hdrs);
  const rl = checkRateLimit(`start-submission:${ip}`, { maxRequests: 10, windowSeconds: 3600 });
  if (!rl.allowed) {
    return { ok: false, error: "Too many submissions from this network recently. Please try again later." };
  }

  const parsed = contributorIdentitySchema.safeParse(identity);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid identity information." };
  }

  const campaign = await getActiveCampaignBySlug(campaignSlug);
  if (!campaign) {
    return { ok: false, error: "This campaign is not currently accepting stories." };
  }

  const org = await getDefaultOrganization();
  if (!org) {
    return { ok: false, error: "Configuration error: no organization found." };
  }

  const contributor = await createContributor(org.id, parsed.data);
  const questions = await getQuestionsForAudience(campaign.id, parsed.data.relationship);

  const { submission, answers } = await createSubmission({
    campaignId: campaign.id,
    contributorId: contributor.id,
    recordingMode: campaign.recordingMode,
    questionIds: campaign.recordingMode === "quick_answers" ? questions.map((q) => q.id) : [],
  });

  await logAuditEvent({
    organizationId: org.id,
    actorType: "contributor",
    actorId: contributor.id,
    eventType: "submission_started",
    subjectType: "submission",
    subjectId: submission.id,
  });
  await trackAnalyticsEvent({
    organizationId: org.id,
    eventType: "story_started",
    campaignId: campaign.id,
    submissionId: submission.id,
  });

  const answerPrompts = answers.map((a) => {
    const q = questions.find((q) => q.id === a.campaignQuestionId);
    return { id: a.id, prompt: q?.promptText ?? "Tell us your story.", helpText: q?.helpText ?? null, order: a.order };
  });

  return {
    ok: true,
    submissionId: submission.id,
    recordingMode: campaign.recordingMode,
    maxDurationSeconds: campaign.maxDurationSeconds,
    consentVersion: campaign.consentVersion,
    consentText: buildConsentText(org.name),
    answers: answerPrompts,
  };
}

export interface SubmitConsentResult {
  ok: boolean;
  error?: string;
}

export async function submitConsentAction(input: {
  submissionId: string;
  consentVersion: string;
  permittedUseClassification: string;
  accepted: boolean;
}): Promise<SubmitConsentResult> {
  const parsed = consentAcceptanceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Consent is required to continue." };
  }

  const state = await getSubmissionState(parsed.data.submissionId);
  if (!state) return { ok: false, error: "Submission not found." };
  if (state !== "STARTED") {
    return { ok: false, error: "This step has already been completed or the submission is no longer editable." };
  }
  if (parsed.data.consentVersion !== CURRENT_CONSENT_VERSION) {
    return { ok: false, error: "Consent version mismatch — please reload and try again." };
  }

  const hdrs = await headers();
  const ip = clientIpFromHeaders(hdrs);

  await recordConsent({
    submissionId: parsed.data.submissionId,
    consentVersion: parsed.data.consentVersion,
    consentTextReference: "src/lib/consent.ts (buildConsentText) — see docs/decision-log.md DL-010",
    permittedUseClassification: parsed.data.permittedUseClassification,
    acceptanceIpHash: hashIp(ip),
    userAgent: hdrs.get("user-agent"),
  });

  await transitionSubmission(parsed.data.submissionId, "RECORDING");
  await trackAnalyticsEvent({ eventType: "consent_completed", submissionId: parsed.data.submissionId });

  return { ok: true };
}

export async function beginUploadAction(submissionId: string): Promise<{ ok: boolean; error?: string }> {
  const state = await getSubmissionState(submissionId);
  if (!state) return { ok: false, error: "Submission not found." };
  if (state === "UPLOADING") return { ok: true }; // idempotent if client retries
  if (state !== "RECORDING") {
    return { ok: false, error: `Cannot begin upload from state ${state}.` };
  }
  await transitionSubmission(submissionId, "UPLOADING");
  await trackAnalyticsEvent({ eventType: "upload_started", submissionId });
  return { ok: true };
}

export interface FinalizeResult {
  ok: boolean;
  error?: string;
}

/**
 * Only marks the submission durably successful once EVERY answer has at
 * least one server-confirmed media asset — never based on the client's
 * claim alone. See docs/architecture.md Section 7.
 */
export async function finalizeSubmissionAction(submissionId: string): Promise<FinalizeResult> {
  const state = await getSubmissionState(submissionId);
  if (!state) return { ok: false, error: "Submission not found." };
  if (state === "SUBMITTED" || state === "PROCESSING" || state === "READY_FOR_REVIEW") {
    return { ok: true }; // idempotent
  }
  if (state !== "UPLOADING") {
    return { ok: false, error: `Cannot finalize from state ${state}.` };
  }

  const allConfirmed = await allAnswersHaveConfirmedMedia(submissionId);
  if (!allConfirmed) {
    return { ok: false, error: "Not all recordings finished uploading yet. Please wait and try again." };
  }

  await transitionSubmission(submissionId, "SUBMITTED");
  await transitionSubmission(submissionId, "PROCESSING");

  if (isProcessingPipelineEnabled()) {
    await enqueueTranscriptionJobs(submissionId);
  } else {
    // No transcription/AI vendor configured (owner decision, DL-009) — skip
    // straight to READY_FOR_REVIEW. Admins review the raw recording
    // directly; no transcript/analysis is fabricated. See
    // src/lib/providers/transcription/index.ts.
    await transitionSubmission(submissionId, "READY_FOR_REVIEW");
  }

  await trackAnalyticsEvent({ eventType: "submission_completed", submissionId });
  await logAuditEvent({
    organizationId: null,
    actorType: "contributor",
    eventType: "submission_completed",
    subjectType: "submission",
    subjectId: submissionId,
  });

  return { ok: true };
}

export async function hasConsentAction(submissionId: string): Promise<boolean> {
  return hasActiveConsent(submissionId);
}
