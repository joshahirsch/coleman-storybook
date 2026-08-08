import { db } from "@/db/client";
import { mediaAssets, processingJobs, storyAnalyses, submissionAnswers, transcripts } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export async function enqueueTranscriptionJobs(submissionId: string) {
  const answers = await db
    .select({ id: submissionAnswers.id })
    .from(submissionAnswers)
    .where(eq(submissionAnswers.submissionId, submissionId));

  const answerIds = answers.map((a) => a.id);
  if (answerIds.length === 0) return;

  const assets = await db
    .select()
    .from(mediaAssets)
    .where(and(inArray(mediaAssets.submissionAnswerId, answerIds), eq(mediaAssets.status, "confirmed")));

  for (const asset of assets) {
    await db.insert(processingJobs).values({
      submissionId,
      mediaAssetId: asset.id,
      jobType: "transcription",
      status: "queued",
    });
  }
}

export async function enqueueAnalysisJob(submissionId: string) {
  await db.insert(processingJobs).values({
    submissionId,
    jobType: "analysis",
    status: "queued",
  });
}

/** Claims the oldest queued job by atomically flipping it to "running". */
export async function claimNextQueuedJob() {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.status, "queued"))
      .orderBy(processingJobs.createdAt)
      .limit(1)
      .for("update", { skipLocked: true });

    if (!job) return null;

    await tx
      .update(processingJobs)
      .set({ status: "running", attempts: job.attempts + 1, updatedAt: new Date() })
      .where(eq(processingJobs.id, job.id));

    return job;
  });
}

export async function markJobSucceeded(jobId: string) {
  await db.update(processingJobs).set({ status: "succeeded", updatedAt: new Date() }).where(eq(processingJobs.id, jobId));
}

export async function markJobFailed(jobId: string, error: string) {
  await db
    .update(processingJobs)
    .set({ status: "failed", lastError: error.slice(0, 2000), updatedAt: new Date() })
    .where(eq(processingJobs.id, jobId));
}

export async function saveTranscript(input: {
  mediaAssetId: string;
  text: string;
  segments: unknown;
  provider: string;
  model: string;
  raw: unknown;
}) {
  const [row] = await db
    .insert(transcripts)
    .values({
      mediaAssetId: input.mediaAssetId,
      text: input.text,
      segments: input.segments,
      provider: input.provider,
      model: input.model,
      rawResponse: input.raw as object,
    })
    .returning();
  return row;
}

export async function saveStoryAnalysis(input: {
  submissionId: string;
  summary: string;
  themes: string[];
  pullQuotes: unknown;
  marketingUseSuggestions: string[];
  provider: string;
  model: string;
  raw: unknown;
}) {
  const [row] = await db
    .insert(storyAnalyses)
    .values({
      submissionId: input.submissionId,
      summary: input.summary,
      themes: input.themes,
      pullQuotes: input.pullQuotes,
      marketingUseSuggestions: input.marketingUseSuggestions,
      provider: input.provider,
      model: input.model,
      rawResponse: input.raw as object,
    })
    .returning();
  return row;
}

export async function getAllTranscriptTextForSubmission(submissionId: string): Promise<{
  combinedText: string;
  segments: { start: number; end: number; text: string }[];
}> {
  const answers = await db
    .select({ id: submissionAnswers.id })
    .from(submissionAnswers)
    .where(eq(submissionAnswers.submissionId, submissionId));
  const answerIds = answers.map((a) => a.id);
  if (answerIds.length === 0) return { combinedText: "", segments: [] };

  const assets = await db.select().from(mediaAssets).where(inArray(mediaAssets.submissionAnswerId, answerIds));
  const assetIds = assets.map((a) => a.id);
  if (assetIds.length === 0) return { combinedText: "", segments: [] };

  const rows = await db.select().from(transcripts).where(inArray(transcripts.mediaAssetId, assetIds));
  const combinedText = rows.map((r) => r.text).join("\n\n");
  const segments = rows.flatMap((r) => r.segments as { start: number; end: number; text: string }[]);
  return { combinedText, segments };
}

export async function pendingJobCountForSubmission(submissionId: string): Promise<number> {
  const rows = await db
    .select({ id: processingJobs.id })
    .from(processingJobs)
    .where(and(eq(processingJobs.submissionId, submissionId), inArray(processingJobs.status, ["queued", "running"])));
  return rows.length;
}

export async function hasFailedJobs(submissionId: string): Promise<boolean> {
  const rows = await db
    .select({ id: processingJobs.id })
    .from(processingJobs)
    .where(and(eq(processingJobs.submissionId, submissionId), eq(processingJobs.status, "failed")));
  return rows.length > 0;
}

export async function transcriptionJobsAllSucceeded(submissionId: string): Promise<boolean> {
  const rows = await db
    .select({ status: processingJobs.status })
    .from(processingJobs)
    .where(and(eq(processingJobs.submissionId, submissionId), eq(processingJobs.jobType, "transcription")));
  if (rows.length === 0) return false;
  return rows.every((r) => r.status === "succeeded");
}

export async function analysisJobExists(submissionId: string): Promise<boolean> {
  const rows = await db
    .select({ id: processingJobs.id })
    .from(processingJobs)
    .where(and(eq(processingJobs.submissionId, submissionId), eq(processingJobs.jobType, "analysis")));
  return rows.length > 0;
}
