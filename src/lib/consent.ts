/**
 * Consent copy and versioning.
 *
 * [LEGAL REVIEW REQUIRED] — the text below is DRAFT product-direction
 * language only, written by engineering to make the technical consent-
 * traceability system demonstrable. It has NOT been reviewed or approved by
 * Camp Coleman's counsel and must not be used with real contributors until
 * it is. See docs/legal-review-required.md.
 */

export const CURRENT_CONSENT_VERSION = "v1-draft-2026-08-08";

export const CONSENT_TEXT = `
By continuing, you agree to let [Organization Name] record, store, and use the video/audio
you provide, along with the answers and information you share, for the following purposes:
sharing your story internally, considering it for use in [Organization Name]'s marketing,
fundraising, recruitment, and archival materials (online, in print, and in social media), and
preserving it as part of [Organization Name]'s ongoing oral history.

You do not have to share anything you are not comfortable sharing. You may stop recording at
any time before you submit. [Organization Name] will not publish your story publicly without
separate, explicit review and approval.

[LEGAL REVIEW REQUIRED — draft only, not lawyer-approved. Placeholder pending counsel review;
see docs/legal-review-required.md.]
`.trim();

export const PERMITTED_USE_CLASSIFICATIONS = [
  { value: "internal_review_only", label: "Internal review only (no external use)" },
  { value: "website_and_social", label: "Website and social media" },
  { value: "fundraising_and_recruitment", label: "Fundraising and recruitment materials" },
  { value: "full_permitted_use", label: "All of the above (full permitted use)" },
] as const;

export type PermittedUseClassification = (typeof PERMITTED_USE_CLASSIFICATIONS)[number]["value"];
