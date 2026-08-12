/**
 * Shared implementation of the video/contact naming convention adopted
 * 2026-08-12 (see the "Coleman Storybook — Video File Naming Convention"
 * project doc): `q#_firstname_lastname_MMDDYYYY`, 1-indexed question
 * number, lowercase name with no spaces/punctuation, date the submission
 * was recorded (not exported).
 *
 * Used both by the contact-card export (`src/lib/contact-card-export.ts`,
 * feeding `src/lib/csv.ts`'s log rows) and intended to back a future admin
 * download feature, so the two stay in sync automatically rather than
 * drifting apart.
 */

/** Lowercases and strips everything but letters/digits, per the convention's "single lowercase token" rule. */
export function slugifyNamePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents (e.g. "É" -> "E")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Formats a Date as MMDDYYYY in UTC (submission timestamps are stored/compared in UTC throughout this app). */
export function formatDateMMDDYYYY(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear());
  return `${mm}${dd}${yyyy}`;
}

export interface SuggestedFilenameInput {
  /** 1-indexed question number within the campaign (q1, q2, ...). */
  questionNumber: number;
  firstName: string;
  lastName: string;
  /** Submission date — the video's suggested filename uses when it was recorded, not exported. */
  date: Date;
}

/** Builds the extension-less suggested filename, e.g. "q3_jane_smith_08122026". */
export function buildSuggestedFilename(input: SuggestedFilenameInput): string {
  const first = slugifyNamePart(input.firstName) || "unknown";
  const last = slugifyNamePart(input.lastName) || "unknown";
  return `q${input.questionNumber}_${first}_${last}_${formatDateMMDDYYYY(input.date)}`;
}
