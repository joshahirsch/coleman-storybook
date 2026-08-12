import { db } from "@/db/client";
import {
  campaignQuestions,
  consentRecords,
  contributors,
  mediaAssets,
  submissionAnswers,
  submissions,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { assertTransition, type SubmissionState } from "@/lib/submission-state";
import type { ContributorIdentityInput } from "@/lib/validation";

export async function createContributor(orgId: string, input: ContributorIdentityInput) {
  const [contributor] = await db
    .insert(contributors)
    .values({
      organizationId: orgId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email && input.email.length > 0 ? input.email : null,
      relationship: input.relationship,
      yearsAssociated: input.yearsAssociated || null,
      roleInfo: input.roleInfo || null,
      isSynthetic: false,
    })
    .returning();
  return contributor;
}

export async function createSubmission(input: {
  campaignId: string;
  contributorId: string;
  recordingMode: "quick_answers" | "guided_story";
  questionIds: string[];
}) {
  const [submission] = await db
    .insert(submissions)
    .values({
      campaignId: input.campaignId,
      contributorId: input.contributorId,
      recordingMode: input.recordingMode,
      state: "STARTED",
    })
    .returning();

  const answerRows = input.questionIds.length > 0
    ? input.questionIds.map((questionId, index) => ({
        submissionId: submission.id,
        campaignQuestionId: questionId,
        order: index,
      }))
    : [{ submissionId: submission.id, campaignQuestionId: null, order: 0 }]; // guided story: single answer slot

  const answers = await db.insert(submissionAnswers).values(answerRows).returning();

  return { submission, answers };
}

export async function getSubmissionState(submissionId: string): Promise<SubmissionState | null> {
  const [row] = await db
    .select({ state: submissions.state })
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1);
  return (row?.state as SubmissionState) ?? null;
}

export async function transitionSubmission(submissionId: string, to: SubmissionState) {
  const current = await getSubmissionState(submissionId);
  if (!current) throw new Error(`Submission ${submissionId} not found`);
  assertTransition(current, to);

  const patch: Partial<typeof submissions.$inferInsert> = { state: to };
  if (to === "SUBMITTED") patch.submittedAt = new Date();
  if (to === "WITHDRAWN") patch.withdrawnAt = new Date();

  await db.update(submissions).set(patch).where(eq(submissions.id, submissionId));
}

export async function recordConsent(input: {
  submissionId: string;
  consentVersion: string;
  consentTextReference: string;
  permittedUseClassification: string;
  acceptanceIpHash: string | null;
  userAgent: string | null;
}) {
  const [record] = await db.insert(consentRecords).values(input).returning();
  return record;
}

export async function hasActiveConsent(submissionId: string): Promise<boolean> {
  const rows = await db
    .select({ id: consentRecords.id })
    .from(consentRecords)
    .where(and(eq(consentRecords.submissionId, submissionId)));
  return rows.length > 0;
}

export async function getSubmissionAnswersWithMedia(submissionId: string) {
  const answers = await db
    .select()
    .from(submissionAnswers)
    .where(eq(submissionAnswers.submissionId, submissionId));

  const results = [];
  for (const answer of answers) {
    const media = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.submissionAnswerId, answer.id));
    results.push({ ...answer, mediaAssets: media });
  }
  return results;
}

/** True once every answer for the submission has at least one confirmed media asset. */
export async function allAnswersHaveConfirmedMedia(submissionId: string): Promise<boolean> {
  const answers = await getSubmissionAnswersWithMedia(submissionId);
  if (answers.length === 0) return false;
  return answers.every((a) => a.mediaAssets.some((m) => m.status === "confirmed"));
}

export interface SubmissionExportVideo {
  /** The confirmed media asset's Drive/storage key — what the contact-card companion file sits next to. */
  storageKey: string;
  /** 1-indexed question number within the campaign (answer.order + 1 as a fallback for guided-story mode, which has no per-question campaignQuestionId). */
  questionNumber: number;
}

export interface SubmissionExportInfo {
  submissionId: string;
  /** Recorded/submitted date — submittedAt once set, falling back to createdAt for the (should-be-unreachable-by-finalize-time) case it's still null. */
  submissionDate: Date;
  contributor: {
    firstName: string;
    lastName: string;
    email: string | null;
    relationship: string;
    yearsAssociated: string | null;
    roleInfo: string | null;
  };
  videos: SubmissionExportVideo[];
}

/**
 * Gathers everything the contact-card export (`finalizeSubmissionAction` ->
 * `exportContactCardsForSubmission`, see `src/lib/contact-card-export.ts`)
 * needs for a submission: the contributor's identity fields exactly as
 * they entered them at recording time, the submission date, and each
 * confirmed video's storage key + 1-indexed question number. Only confirmed
 * media assets are included — an in-progress or failed upload has nothing
 * to log a row for yet.
 */
export async function getSubmissionExportInfo(submissionId: string): Promise<SubmissionExportInfo | null> {
  const [row] = await db
    .select({
      submissionId: submissions.id,
      submittedAt: submissions.submittedAt,
      createdAt: submissions.createdAt,
      firstName: contributors.firstName,
      lastName: contributors.lastName,
      email: contributors.email,
      relationship: contributors.relationship,
      yearsAssociated: contributors.yearsAssociated,
      roleInfo: contributors.roleInfo,
    })
    .from(submissions)
    .innerJoin(contributors, eq(submissions.contributorId, contributors.id))
    .where(eq(submissions.id, submissionId))
    .limit(1);

  if (!row) return null;

  const answers = await db
    .select({
      answerOrder: submissionAnswers.order,
      questionOrder: campaignQuestions.order,
      storageKey: mediaAssets.storageKey,
      status: mediaAssets.status,
    })
    .from(submissionAnswers)
    .innerJoin(mediaAssets, eq(mediaAssets.submissionAnswerId, submissionAnswers.id))
    .leftJoin(campaignQuestions, eq(submissionAnswers.campaignQuestionId, campaignQuestions.id))
    .where(eq(submissionAnswers.submissionId, submissionId));

  const videos: SubmissionExportVideo[] = answers
    .filter((a) => a.status === "confirmed")
    .map((a) => ({
      storageKey: a.storageKey,
      // campaignQuestions.order is 0-indexed (see src/scripts/bootstrap-content.ts);
      // guided-story answers have no campaignQuestionId at all, so fall back to
      // the answer's own 0-indexed order instead. Either way, +1 for the
      // 1-indexed q# the naming convention uses.
      questionNumber: (a.questionOrder ?? a.answerOrder) + 1,
    }));

  return {
    submissionId: row.submissionId,
    submissionDate: row.submittedAt ?? row.createdAt,
    contributor: {
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      relationship: row.relationship,
      yearsAssociated: row.yearsAssociated,
      roleInfo: row.roleInfo,
    },
    videos,
  };
}
