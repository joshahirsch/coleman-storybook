import { getStorageAdapter } from "@/lib/storage";
import { getTranscriptionProvider } from "@/lib/providers/transcription";
import { getAnalysisProvider } from "@/lib/providers/analysis";
import { getMediaAssetById } from "@/lib/data/media";
import {
  analysisJobExists,
  claimNextQueuedJob,
  enqueueAnalysisJob,
  getAllTranscriptTextForSubmission,
  markJobFailed,
  markJobSucceeded,
  saveStoryAnalysis,
  saveTranscript,
  transcriptionJobsAllSucceeded,
} from "@/lib/data/processing";
import { getSubmissionState, transitionSubmission } from "@/lib/data/submissions";
import { logAuditEvent } from "@/lib/audit";

const MAX_JOBS_PER_CYCLE = 25;

export async function runJobProcessingCycle(): Promise<{ processed: number; succeeded: number; failed: number }> {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < MAX_JOBS_PER_CYCLE; i++) {
    const job = await claimNextQueuedJob();
    if (!job) break;
    processed += 1;

    try {
      if (job.jobType === "transcription") {
        await processTranscriptionJob(job);
      } else {
        await processAnalysisJob(job);
      }
      await markJobSucceeded(job.id);
      succeeded += 1;

      if (job.jobType === "transcription") {
        const allDone = await transcriptionJobsAllSucceeded(job.submissionId);
        const analysisAlreadyQueued = await analysisJobExists(job.submissionId);
        if (allDone && !analysisAlreadyQueued) {
          await enqueueAnalysisJob(job.submissionId);
        }
      }

      if (job.jobType === "analysis") {
        const state = await getSubmissionState(job.submissionId);
        if (state === "PROCESSING") {
          await transitionSubmission(job.submissionId, "READY_FOR_REVIEW");
        }
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      await markJobFailed(job.id, message);

      const state = await getSubmissionState(job.submissionId);
      if (state === "PROCESSING") {
        await transitionSubmission(job.submissionId, "PROCESSING_FAILED");
      }

      await logAuditEvent({
        organizationId: null,
        actorType: "system",
        eventType: "processing_job_failed",
        subjectType: "processing_job",
        subjectId: job.id,
        metadata: { jobType: job.jobType, submissionId: job.submissionId, error: message },
      });
    }
  }

  return { processed, succeeded, failed };
}

async function processTranscriptionJob(job: { id: string; submissionId: string; mediaAssetId: string | null }) {
  if (!job.mediaAssetId) throw new Error("Transcription job missing mediaAssetId");
  const asset = await getMediaAssetById(job.mediaAssetId);
  if (!asset) throw new Error(`MediaAsset ${job.mediaAssetId} not found`);

  const storage = getStorageAdapter();
  const mediaUrl = await storage.getSignedReadUrl(asset.storageKey, 300);

  const provider = getTranscriptionProvider();
  const result = await provider.transcribe({ mediaUrl, mediaKey: asset.storageKey });

  await saveTranscript({
    mediaAssetId: asset.id,
    text: result.text,
    segments: result.segments,
    provider: result.provider,
    model: result.model,
    raw: result.raw,
  });
}

async function processAnalysisJob(job: { id: string; submissionId: string }) {
  const { combinedText, segments } = await getAllTranscriptTextForSubmission(job.submissionId);
  if (!combinedText) throw new Error("No transcript text available to analyze");

  const provider = getAnalysisProvider();
  const result = await provider.analyze({ transcriptText: combinedText, segments });

  await saveStoryAnalysis({
    submissionId: job.submissionId,
    summary: result.summary,
    themes: result.themes,
    pullQuotes: result.pullQuotes,
    marketingUseSuggestions: result.marketingUseSuggestions,
    provider: result.provider,
    model: result.model,
    raw: result.raw,
  });
}
