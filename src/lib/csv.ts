/**
 * Builds rows for the single running contact/video log CSV appended to on
 * every submission finalize (see `src/lib/contact-card-export.ts` and the
 * "Coleman Storybook — Video Contact Card Export" project doc for the
 * decision to use one running spreadsheet log rather than a per-video
 * companion file — the data is consumed in a spreadsheet, not imported
 * into a Contacts app, so a real vCard was the wrong format).
 */

/** Column order for the log — keep in sync with `buildContactLogRow` below. */
export const CONTACT_LOG_HEADER = [
  "suggested_filename",
  "question_number",
  "first_name",
  "last_name",
  "email",
  "relationship",
  "years_associated",
  "role_info",
  "submission_date",
  "video_storage_key",
  "submission_id",
] as const;

/** Escapes a single CSV field per RFC 4180: quote-wrap and double-up internal quotes whenever the value contains a comma, quote, or newline. */
export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildContactLogHeaderLine(): string {
  return CONTACT_LOG_HEADER.join(",");
}

export interface ContactLogRowFields {
  suggestedFilename: string;
  /** 1-indexed question number within the campaign. */
  questionNumber: number;
  firstName: string;
  lastName: string;
  email?: string | null;
  relationship?: string | null;
  yearsAssociated?: string | null;
  roleInfo?: string | null;
  submissionDate: Date;
  videoStorageKey: string;
  submissionId: string;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Builds one CSV data row (no trailing newline, no header) matching `CONTACT_LOG_HEADER`'s column order. */
export function buildContactLogRow(fields: ContactLogRowFields): string {
  const values = [
    fields.suggestedFilename,
    String(fields.questionNumber),
    fields.firstName,
    fields.lastName,
    fields.email ?? "",
    fields.relationship ?? "",
    fields.yearsAssociated ?? "",
    fields.roleInfo ?? "",
    isoDate(fields.submissionDate),
    fields.videoStorageKey,
    fields.submissionId,
  ];
  return values.map(escapeCsvField).join(",");
}
