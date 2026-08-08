# Legal Review Required

**This document is not legal advice and nothing in this repository should be treated as lawyer-approved language until Camp Coleman's counsel (or the owner's designated legal reviewer) has reviewed and signed off.** Engineering will implement technical support for whatever consent/privacy model is approved, but will not draft or claim final legal language.

**Update, DL-010:** the owner has explicitly decided to proceed with the initial small, alumni-only MVP pilot without waiting for this review ("pass on the legal review for now, this is just an MVP version") — see `docs/decision-log.md` DL-010 for exactly what that decision does and doesn't mean. None of the items below have actually been resolved by that decision; the owner made an informed choice to accept the risk for a bounded pilot rather than wait. This list, and the packet in `docs/consent-legal-review-packet.md`, remain accurate and ready whenever review is revisited (recommended before expanding past the initial pilot — see DL-009/DL-010).

## Items Worth Legal Review (owner has deferred, not resolved — see DL-010)

1. **Testimonial / media release language.** Coleman Storybook ships with clearly-labeled DRAFT consent copy (`docs/privacy-and-consent.md`) for the MVP pilot. It has not been reviewed or approved by counsel; the owner has decided to use it anyway for the initial small pilot (DL-010).
2. **Privacy policy.** No privacy policy currently exists for this product. One is required before any real-user pilot (Phase 15).
3. **Data retention policy.** How long submitted video, transcripts, and AI-derived metadata are retained, and under what conditions they are deleted, is undefined.
4. **Withdrawal / revocation rights.** Whether and how a contributor can withdraw consent after submission, and what happens to already-published derivative content if they do, is undefined.
5. **Deletion rights.** Whether contributors have a right to request deletion of their submission (and how that intersects with already-created marketing assets) is undefined.
6. **Marketing usage scope.** What "permitted use" actually means (website only? social? print? paid advertising? fundraising appeals?) needs explicit, plain-language definition and a matching consent checkbox/classification model.
7. **Third-party processors.** Any transcription provider, AI analysis provider, storage provider, or email provider used will process contributor data. A data processing/subprocessor disclosure may be required depending on Coleman's privacy commitments.
8. **Recording consent laws.** Two-party/all-party consent recording laws vary by U.S. state and country. The product's mitigation (contributor self-attestation, since the contributor is recording themselves) should be reviewed by counsel, especially if Guided Story mode or any future interviewer-present mode is added.
9. **Accessibility (ADA/WCAG) compliance.** Target conformance level should be confirmed, particularly if/when a public-facing curated Storybook (Phase 18) is authorized.
10. **Minors.** V1 defaults to adult-only contribution (see Decision Log DL-004). Any future guardian-consent workflow for minors requires its own dedicated legal review before implementation, not just a UI toggle.

## Process

Engineering flags every place in the product where legally-reviewed copy is required with a review-status note in source comments (`src/lib/consent.ts`) and this document — never as a bracketed disclaimer rendered to contributors themselves, since a real user should never see raw placeholder/review-status text on screen.

## Status

No items on this list have been reviewed or approved as of 2026-08-08. This is expected at Phase 0 and is not a blocker to continued engineering work through Phase 13 (all pre-production phases). It was originally treated as a hard blocker to Phase 14/15 as well, until the owner explicitly decided otherwise for the initial MVP pilot (DL-010, 2026-08-08) — see that entry for the exact scope of what's deferred versus what still stands (the consent *mechanism* is unchanged and still required; only "reviewed by counsel" is deferred). Still strongly recommended before expanding beyond the initial small alumni pilot.
