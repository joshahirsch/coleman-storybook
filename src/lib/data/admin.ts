import { db } from "@/db/client";
import {
  adminReviews,
  campaigns,
  consentRecords,
  contributors,
  mediaAssets,
  processingJobs,
  storyAnalyses,
  submissionAnswers,
  submissions,
  transcripts,
} from "@/db/schema";
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

export interface SubmissionListFilters {
  campaignId?: string;
  editorialState?: "PENDING" | "APPROVED" | "REJECTED";
  favoriteOnly?: boolean;
  searchText?: string;
}

export interface SubmissionListRow {
  submissionId: string;
  state: string;
  createdAt: Date;
  submittedAt: Date | null;
  contributorName: string;
  relationship: string;
  campaignTitle: string;
  campaignSlug: string;
  editorialState: string;
  favorite: boolean;
  hasFailedProcessing: boolean;
}

export async function listSubmissionsForAdmin(filters: SubmissionListFilters): Promise<SubmissionListRow[]> {
  const conditions: SQL[] = [];
  if (filters.campaignId) conditions.push(eq(submissions.campaignId, filters.campaignId));

  let searchSubmissionIds: string[] | null = null;
  if (filters.searchText && filters.searchText.trim().length > 0) {
    const q = `%${filters.searchText.trim()}%`;
    const matchingTranscripts = await db
      .select({ mediaAssetId: transcripts.mediaAssetId })
      .from(transcripts)
      .where(
        or(
          ilike(transcripts.text, q),
          sql`to_tsvector('english', ${transcripts.text}) @@ plainto_tsquery('english', ${filters.searchText})`,
        ),
      );
    const mediaAssetIds = matchingTranscripts.map((t) => t.mediaAssetId);

    let answerSubmissionIds: string[] = [];
    if (mediaAssetIds.length > 0) {
      const matchingAssets = await db
        .select({ submissionAnswerId: mediaAssets.submissionAnswerId })
        .from(mediaAssets)
        .where(inArray(mediaAssets.id, mediaAssetIds));
      const answerIds = matchingAssets.map((a) => a.submissionAnswerId);
      if (answerIds.length > 0) {
        const matchingAnswers = await db
          .select({ submissionId: submissionAnswers.submissionId })
          .from(submissionAnswers)
          .where(inArray(submissionAnswers.id, answerIds));
        answerSubmissionIds = matchingAnswers.map((a) => a.submissionId);
      }
    }

    const matchingContributors = await db
      .select({ id: contributors.id })
      .from(contributors)
      .where(or(ilike(contributors.firstName, q), ilike(contributors.lastName, q)));
    const contributorIds = matchingContributors.map((c) => c.id);
    let contributorSubmissionIds: string[] = [];
    if (contributorIds.length > 0) {
      const rows = await db
        .select({ id: submissions.id })
        .from(submissions)
        .where(inArray(submissions.contributorId, contributorIds));
      contributorSubmissionIds = rows.map((r) => r.id);
    }

    searchSubmissionIds = Array.from(new Set([...answerSubmissionIds, ...contributorSubmissionIds]));
    if (searchSubmissionIds.length === 0) return [];
    conditions.push(inArray(submissions.id, searchSubmissionIds));
  }

  const rows = await db
    .select({
      submissionId: submissions.id,
      state: submissions.state,
      createdAt: submissions.createdAt,
      submittedAt: submissions.submittedAt,
      firstName: contributors.firstName,
      lastName: contributors.lastName,
      relationship: contributors.relationship,
      campaignTitle: campaigns.title,
      campaignSlug: campaigns.slug,
      editorialState: adminReviews.editorialState,
      favorite: adminReviews.favorite,
    })
    .from(submissions)
    .innerJoin(contributors, eq(submissions.contributorId, contributors.id))
    .innerJoin(campaigns, eq(submissions.campaignId, campaigns.id))
    .leftJoin(adminReviews, eq(adminReviews.submissionId, submissions.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(submissions.createdAt));

  let filtered = rows;
  if (filters.editorialState) {
    filtered = filtered.filter((r) => (r.editorialState ?? "PENDING") === filters.editorialState);
  }
  if (filters.favoriteOnly) {
    filtered = filtered.filter((r) => r.favorite === true);
  }

  const failedJobSubmissionIds = new Set(
    (
      await db
        .select({ submissionId: processingJobs.submissionId })
        .from(processingJobs)
        .where(eq(processingJobs.status, "failed"))
    ).map((r) => r.submissionId),
  );

  return filtered.map((r) => ({
    submissionId: r.submissionId,
    state: r.state,
    createdAt: r.createdAt,
    submittedAt: r.submittedAt,
    contributorName: `${r.firstName} ${r.lastName}`,
    relationship: r.relationship,
    campaignTitle: r.campaignTitle,
    campaignSlug: r.campaignSlug,
    editorialState: r.editorialState ?? "PENDING",
    favorite: r.favorite ?? false,
    hasFailedProcessing: failedJobSubmissionIds.has(r.submissionId),
  }));
}

export async function getSubmissionDetailForAdmin(submissionId: string) {
  const [submission] = await db.select().from(submissions).where(eq(submissions.id, submissionId)).limit(1);
  if (!submission) return null;

  const [contributor] = await db
    .select()
    .from(contributors)
    .where(eq(contributors.id, submission.contributorId))
    .limit(1);
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, submission.campaignId)).limit(1);
  const [review] = await db.select().from(adminReviews).where(eq(adminReviews.submissionId, submissionId)).limit(1);
  const consents = await db.select().from(consentRecords).where(eq(consentRecords.submissionId, submissionId));
  const [analysis] = await db
    .select()
    .from(storyAnalyses)
    .where(eq(storyAnalyses.submissionId, submissionId))
    .orderBy(desc(storyAnalyses.generatedAt))
    .limit(1);

  const answers = await db
    .select()
    .from(submissionAnswers)
    .where(eq(submissionAnswers.submissionId, submissionId));

  const answersWithMedia = [];
  for (const answer of answers) {
    const media = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.submissionAnswerId, answer.id));
    const mediaWithTranscripts = [];
    for (const m of media) {
      const t = await db.select().from(transcripts).where(eq(transcripts.mediaAssetId, m.id));
      mediaWithTranscripts.push({ ...m, transcripts: t });
    }
    answersWithMedia.push({ ...answer, mediaAssets: mediaWithTranscripts });
  }

  const jobs = await db.select().from(processingJobs).where(eq(processingJobs.submissionId, submissionId));

  return { submission, contributor, campaign, review, consents, analysis, answers: answersWithMedia, jobs };
}

export async function upsertAdminReview(input: {
  submissionId: string;
  adminUserId: string;
  editorialState?: "PENDING" | "APPROVED" | "REJECTED";
  notes?: string;
  favorite?: boolean;
}) {
  const [existing] = await db
    .select()
    .from(adminReviews)
    .where(eq(adminReviews.submissionId, input.submissionId))
    .limit(1);

  if (existing) {
    const patch: Partial<typeof adminReviews.$inferInsert> = { adminUserId: input.adminUserId };
    if (input.editorialState !== undefined) {
      patch.editorialState = input.editorialState;
      patch.reviewedAt = new Date();
    }
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.favorite !== undefined) patch.favorite = input.favorite;
    await db.update(adminReviews).set(patch).where(eq(adminReviews.submissionId, input.submissionId));
    return;
  }

  await db.insert(adminReviews).values({
    submissionId: input.submissionId,
    adminUserId: input.adminUserId,
    editorialState: input.editorialState ?? "PENDING",
    notes: input.notes ?? null,
    favorite: input.favorite ?? false,
    reviewedAt: input.editorialState ? new Date() : null,
  });
}
