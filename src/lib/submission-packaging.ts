import { getSubmissionExportInfo } from "@/lib/data/submissions";
import { copyVideoIntoFolder, findOrCreateSubmissionFolder } from "@/lib/storage/google-drive-adapter";
import { buildSubmissionFolderName, buildSuggestedFilename } from "@/lib/naming";
import { extensionFromStorageKey } from "@/lib/storage-key";

export interface PackageSubmissionVideoResult {
  storageKey: string;
  filename: string;
  ok: boolean;
  /** True if this exact filename already existed in the folder from a prior run — not re-copied. */
  skipped?: boolean;
  error?: string;
}

export interface PackageSubmissionResult {
  ok: boolean;
  submissionId: string;
  folderName?: string;
  folderId?: string;
  folderCreated?: boolean;
  results: PackageSubmissionVideoResult[];
  error?: string;
}

/**
 * On-demand packaging (owner decision, 2026-08-13 — see the
 * "Coleman Storybook — Build Status" project doc): copies every confirmed
 * video for one submission into its own Drive subfolder, named per
 * `buildSubmissionFolderName` (e.g. "jane_smith_08122026"), renaming each
 * copy to the adopted `q#_firstname_lastname_MMDDYYYY.<ext>` convention in
 * the process (`buildSuggestedFilename`, same helper the contact-log CSV's
 * `suggested_filename` column already uses — see
 * `src/lib/contact-card-export.ts`).
 *
 * Triggered manually per submission via `POST /api/admin/package-submission`
 * — deliberately NOT wired into `finalizeSubmissionAction` the way the
 * contact-log CSV export is; the owner chose on-demand over automatic so
 * nothing about day-to-day finalize behavior changes.
 *
 * Leaves the original videos completely untouched — see
 * `copyVideoIntoFolder`'s doc comment for why (every other adapter
 * operation looks the original up by its opaque key + root-folder
 * location; moving or renaming it would break playback).
 *
 * Best-effort per video, same pattern as `exportContactCardsForSubmission`:
 * one failing copy doesn't stop the others, and the whole operation is
 * idempotent (`findOrCreateSubmissionFolder` / `copyVideoIntoFolder` both
 * skip re-creating work already done), so a partial run is always safe to
 * simply re-trigger.
 */
export async function packageSubmissionVideos(submissionId: string): Promise<PackageSubmissionResult> {
  const info = await getSubmissionExportInfo(submissionId);
  if (!info) {
    return { ok: false, submissionId, results: [], error: `Submission "${submissionId}" not found.` };
  }
  if (info.videos.length === 0) {
    return {
      ok: false,
      submissionId,
      results: [],
      error: `Submission "${submissionId}" has no confirmed videos yet.`,
    };
  }

  const folderName = buildSubmissionFolderName({
    firstName: info.contributor.firstName,
    lastName: info.contributor.lastName,
    date: info.submissionDate,
  });

  const folder = await findOrCreateSubmissionFolder(folderName);

  const results: PackageSubmissionVideoResult[] = [];
  for (const video of info.videos) {
    const suggestedFilename = buildSuggestedFilename({
      questionNumber: video.questionNumber,
      firstName: info.contributor.firstName,
      lastName: info.contributor.lastName,
      date: info.submissionDate,
    });
    const filename = `${suggestedFilename}.${extensionFromStorageKey(video.storageKey)}`;

    try {
      const copied = await copyVideoIntoFolder(video.storageKey, filename, folder.id);
      results.push({ storageKey: video.storageKey, filename, ok: true, skipped: copied.skipped });
    } catch (err) {
      results.push({
        storageKey: video.storageKey,
        filename,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    ok: results.every((r) => r.ok),
    submissionId,
    folderName,
    folderId: folder.id,
    folderCreated: folder.created,
    results,
  };
}
