"use server";

import { headers } from "next/headers";
import {
  contributorIdentitySchema,
  consentAcceptanceSchema,
  sendVerificationCodeSchema,
  verifyEmailCodeSchema,
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
import {
  MAX_VERIFY_ATTEMPTS,
  createEmailVerification,
  getLatestEmailVerification,
  incrementVerificationAttempts,
  markEmailVerified,
} from "@/lib/data/email-verification";
import { enqueueTranscriptionJobs } from "@/lib/data/processing";
import { isProcessingPipelineEnabled } from "@/lib/providers/transcription";
import { CURRENT_CONSENT_VERSION, buildConsentText } from "@/lib/consent";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { hashIp } from "@/lib/hash";
import { logAuditEvent, trackAnalyticsEvent } from "@/lib/audit";
import { exportContactCardsForSubmission } from "@/lib/contact-card-export";
import { packageSubmissionVideos } from "@/lib/submission-packaging";
import { generateOtpCode, hashOtpCode, verifyOtpCode } from "@/lib/auth/otp";
import { issueVerificationToken, verifyVerificationToken } from "@/lib/auth/verification-token";
import { getEmailProvider } from "@/lib/email";

export interface SendVerificationCodeResult {
  ok: boolean;
  error?: string;
}

/**
 * Sends a 6-digit one-time code to `email` (see docs/security.md's email
 * OTP section and src/lib/auth/otp.ts). Called when a contributor submits
 * the identity form, before any contributor/submission row exists —
 * verifying the email is real happens BEFORE we act on it, not after.
 *
 * Rate-limited two ways: per-IP (a browser hammering "resend" repeatedly)
 * and per-email (someone using this as a spam relay against a third
 * party's inbox by entering an email they don't own) — same
 * `checkRateLimit` helper other public endpoints use, same documented V1
 * limitation (in-memory, single-process, see src/lib/rate-limit.ts).
 */
export async function sendVerificationCodeAction(email: string): Promise<SendVerificationCodeResult> {
  const parsed = sendVerificationCodeSchema.safeParse({ email });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };
  }
  const normalizedEmail = parsed.data.email.toLowerCase();

  const hdrs = await headers();
  const ip = clientIpFromHeaders(hdrs);

  const ipLimit = checkRateLimit(`send-otp-ip:${ip}`, { maxRequests: 8, windowSeconds: 3600 });
  if (!ipLimit.allowed) {
    return { ok: false, error: "Too many code requests from this network recently. Please try again later." };
  }
  const emailLimit = checkRateLimit(`send-otp-email:${normalizedEmail}`, { maxRequests: 3, windowSeconds: 600 });
  if (!emailLimit.allowed) {
    return { ok: false, error: "Too many codes requested for this email recently. Please wait a few minutes and try again." };
  }

  const code = generateOtpCode();
  const codeHash = hashOtpCode(code, normalizedEmail);
  await createEmailVerification(normalizedEmail, codeHash);

  try {
    await getEmailProvider().sendVerificationCode({ to: normalizedEmail, code });
  } catch (err) {
    console.error(`[sendVerificationCodeAction] failed to send code to ${normalizedEmail}:`, err);
    return { ok: false, error: "Couldn't send the verification email. Please try again in a moment." };
  }

  return { ok: true };
}

export interface VerifyEmailCodeResult {
  ok: boolean;
  error?: string;
  /** Signed proof of verification — pass this straight through to `startSubmissionAction`. */
  verificationToken?: string;
}

/**
 * Checks a code entered by the contributor against the most recently
 * issued one for `email`. On success, returns a signed short-lived
 * `verificationToken` (see src/lib/auth/verification-token.ts) rather than
 * just a boolean — `startSubmissionAction` re-validates that token itself
 * rather than trusting the client's "it was right" claim, matching this
 * codebase's existing "never trust the client alone" posture.
 */
export async function verifyEmailCodeAction(email: string, code: string): Promise<VerifyEmailCodeResult> {
  const parsed = verifyEmailCodeSchema.safeParse({ email, code });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter the 6-digit code." };
  }
  const normalizedEmail = parsed.data.email.toLowerCase();

  const hdrs = await headers();
  const ip = clientIpFromHeaders(hdrs);
  const ipLimit = checkRateLimit(`verify-otp-ip:${ip}`, { maxRequests: 30, windowSeconds: 3600 });
  if (!ipLimit.allowed) {
    return { ok: false, error: "Too many attempts from this network recently. Please try again later." };
  }

  const verification = await getLatestEmailVerification(normalizedEmail);
  if (!verification) {
    return { ok: false, error: "No verification code found for this email. Please request a new code." };
  }
  if (verification.verifiedAt) {
    // Already verified by an earlier call (e.g. a duplicate click) — idempotent success.
    return { ok: true, verificationToken: issueVerificationToken(normalizedEmail) };
  }
  if (verification.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "This code has expired. Please request a new one." };
  }
  if (verification.attempts >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, error: "Too many incorrect attempts. Please request a new code." };
  }

  const matches = verifyOtpCode(parsed.data.code, normalizedEmail, verification.codeHash);
  if (!matches) {
    const attempts = await incrementVerificationAttempts(verification.id);
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      return { ok: false, error: "Too many incorrect attempts. Please request a new code." };
    }
    return { ok: false, error: "That code isn't right. Please check and try again." };
  }

  await markEmailVerified(verification.id);
  return { ok: true, verificationToken: issueVerificationToken(normalizedEmail) };
}

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
  verificationToken: string,
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

  // Re-validates the OTP-verification token itself rather than trusting
  // that the client only reaches this action after a real
  // `verifyEmailCodeAction` success — see verification-token.ts's header
  // comment for why (the same "never trust the client's claim alone"
  // principle as upload confirmation elsewhere in this codebase). Bound to
  // this exact email, so a token minted for one address can't be replayed
  // to start a submission under a different one.
  if (!verifyVerificationToken(verificationToken, parsed.data.email)) {
    return { ok: false, error: "Your email verification has expired or is invalid. Please verify your email again." };
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

  // Best-effort: attach a contact-card companion file (contributor name,
  // email, relationship, years/role — all already collected above) next to
  // each video in Drive, per the adopted naming-convention + contact-card
  // project docs. Drive-only (see that doc's "going forward only" scope);
  // never blocks/fails the submission itself — a contributor's finalize
  // must succeed even if this enrichment step has trouble (e.g. a Drive API
  // hiccup), since the actual video uploads are already confirmed durable
  // at this point.
  if (process.env.STORAGE_DRIVER === "drive") {
    try {
      const result = await exportContactCardsForSubmission(submissionId);
      if (result.failures.length > 0) {
        console.error(
          `[finalizeSubmissionAction] contact-card export: ${result.succeeded}/${result.attempted} succeeded for submission ${submissionId}; failures:`,
          result.failures,
        );
      }
    } catch (err) {
      console.error(`[finalizeSubmissionAction] contact-card export threw for submission ${submissionId}:`, err);
    }
  }

  // Best-effort: package this submission's videos into their own
  // human-readable Drive subfolder, renamed per the adopted naming
  // convention (see the "Coleman Storybook — Video File Naming Convention"
  // project doc). Originally shipped as an on-demand-only admin action
  // (`POST /api/admin/package-submission`, still available for backfilling
  // older submissions); the owner then asked for it to also run
  // automatically here — every new submission gets packaged with zero
  // manual steps, same as the contact-card export above. Same
  // never-blocks-the-submission reasoning as that export: a Drive hiccup in
  // this enrichment step must never undo an already-confirmed set of
  // uploads.
  if (process.env.STORAGE_DRIVER === "drive") {
    try {
      const result = await packageSubmissionVideos(submissionId);
      if (!result.ok) {
        console.error(
          `[finalizeSubmissionAction] video packaging did not fully succeed for submission ${submissionId}:`,
          result.error ?? result.results.filter((r) => !r.ok),
        );
      }
    } catch (err) {
      console.error(`[finalizeSubmissionAction] video packaging threw for submission ${submissionId}:`, err);
    }
  }

  return { ok: true };
}

export async function hasConsentAction(submissionId: string): Promise<boolean> {
  return hasActiveConsent(submissionId);
}
