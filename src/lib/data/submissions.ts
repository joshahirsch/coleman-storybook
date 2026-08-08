import { db } from "@/db/client";
import {
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
