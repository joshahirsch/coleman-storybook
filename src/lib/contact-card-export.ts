import { getSubmissionExportInfo } from "@/lib/data/submissions";
import { appendRowToDriveCsvLog } from "@/lib/storage/google-drive-adapter";
import { buildContactLogHeaderLine, buildContactLogRow } from "@/lib/csv";
import { buildSuggestedFilename } from "@/lib/naming";

/**
 * Single running log file every confirmed video appends a row to (see
 * `appendRowToDriveCsvLog`'s doc comment in google-drive-adapter.ts). Lives
 * in the same Drive root folder as the videos themselves.
 */
export const CONTACT_LOG_FILENAME = "contact-log.csv";

/**
 * Appends one row per confirmed video for a submission to the running
 * contact/video log CSV in Drive (`CONTACT_LOG_FILENAME`). Called from
 * `finalizeSubmissionAction` right after a submission's recordings are
 * confirmed — see the "Coleman Storybook — Video Contact Card Export"
 * project doc for the decision behind this (attaching the contributor's
 * info the app already collects to each video, rather than leaving it
 * locked in the database, so it's usable directly in a spreadsheet and
 * feeds the `q#_firstname_lastname_MMDDYYYY` naming convention
 * automatically — originally built as a per-video vCard, switched to a
 * single CSV log once it was clear the data would be consumed in a
 * spreadsheet rather than imported into a Contacts app).
 *
 * Drive-specific by design (per that doc, "going forward only" + Drive as
 * the current production storage adapter) — callers should only invoke
 * this when `STORAGE_DRIVER=drive`; this function does not itself check
 * that, so it can be unit-tested independent of env config.
 *
 * Deliberately does not throw on a per-video row-append failure — one bad
 * row shouldn't block the others, and the caller (finalizeSubmissionAction)
 * treats this whole step as best-effort enrichment, not part of the core
 * submission-completion contract. Returns per-video results so the caller
 * can log failures. Rows within one submission are appended sequentially
 * (not in parallel) specifically to avoid racing against itself — see
 * `appendRowToDriveCsvLog`'s doc comment for the (accepted, low-probability)
 * cross-submission race this does NOT protect against.
 */
export async function exportContactCardsForSubmission(submissionId: string): Promise<{
  attempted: number;
  succeeded: number;
  failures: { storageKey: string; error: string }[];
}> {
  const info = await getSubmissionExportInfo(submissionId);
  if (!info || info.videos.length === 0) {
    return { attempted: 0, succeeded: 0, failures: [] };
  }

  const failures: { storageKey: string; error: string }[] = [];
  let succeeded = 0;
  const headerLine = buildContactLogHeaderLine();

  for (const video of info.videos) {
    try {
      const suggestedFilename = buildSuggestedFilename({
        questionNumber: video.questionNumber,
        firstName: info.contributor.firstName,
        lastName: info.contributor.lastName,
        date: info.submissionDate,
      });

      const rowLine = buildContactLogRow({
        suggestedFilename,
        questionNumber: video.questionNumber,
        firstName: info.contributor.firstName,
        lastName: info.contributor.lastName,
        email: info.contributor.email,
        relationship: info.contributor.relationship,
        yearsAssociated: info.contributor.yearsAssociated,
        roleInfo: info.contributor.roleInfo,
        submissionDate: info.submissionDate,
        videoStorageKey: video.storageKey,
        submissionId: info.submissionId,
      });

      await appendRowToDriveCsvLog(CONTACT_LOG_FILENAME, headerLine, rowLine);
      succeeded += 1;
    } catch (err) {
      failures.push({ storageKey: video.storageKey, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { attempted: info.videos.length, succeeded, failures };
}
