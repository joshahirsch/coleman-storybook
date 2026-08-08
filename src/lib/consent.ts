/**
 * Consent copy and versioning.
 *
 * This text has NOT been reviewed or approved by counsel. The owner has
 * explicitly decided to proceed with the current draft for the initial
 * small, alumni-only MVP pilot without waiting for that review first — see
 * docs/decision-log.md DL-010 for exactly what that decision does and does
 * not mean, and docs/consent-legal-review-packet.md (still ready to send to
 * a reviewer whenever the owner wants to circle back) for the full draft
 * language and open legal questions.
 *
 * Earlier revisions of this file rendered a bracketed
 * "[LEGAL REVIEW REQUIRED]" disclaimer and a literal "[Organization Name]"
 * placeholder directly in the text shown to contributors — i.e. an actual
 * contributor would have seen those brackets verbatim on screen, since
 * nothing in the codebase ever substituted the placeholder (see git history
 * / docs/decision-log.md DL-010 commit for the before/after). That was
 * always wrong regardless of the legal-review question — a real user should
 * never see raw placeholder tokens — and is fixed here: buildConsentText()
 * takes the real organization name and interpolates it, and the
 * review-status disclaimer now lives only in this comment and the decision
 * log, not in what a contributor reads.
 */

export const CURRENT_CONSENT_VERSION = "v1-mvp-2026-08-08";

export function buildConsentText(organizationName: string): string {
  return `
By continuing, you agree to let ${organizationName} record, store, and use the video/audio
you provide, along with the answers and information you share, for the following purposes:
sharing your story internally, considering it for use in ${organizationName}'s marketing,
fundraising, recruitment, and archival materials (online, in print, and in social media), and
preserving it as part of ${organizationName}'s ongoing oral history.

You do not have to share anything you are not comfortable sharing. You may stop recording at
any time before you submit. ${organizationName} will not publish your story publicly without
separate, explicit review and approval.
`.trim();
}

export const PERMITTED_USE_CLASSIFICATIONS = [
  { value: "internal_review_only", label: "Internal review only (no external use)" },
  { value: "website_and_social", label: "Website and social media" },
  { value: "fundraising_and_recruitment", label: "Fundraising and recruitment materials" },
  { value: "full_permitted_use", label: "All of the above (full permitted use)" },
] as const;

export type PermittedUseClassification = (typeof PERMITTED_USE_CLASSIFICATIONS)[number]["value"];
