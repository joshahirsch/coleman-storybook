# Privacy and Consent

**This document is a technical/product description of how consent is captured and traced through the system. It is not legal advice, and the consent language it describes has not been reviewed by Camp Coleman's counsel. The owner has explicitly decided to proceed with the MVP pilot without waiting for that review (see `docs/decision-log.md` DL-010) — this note is not a launch blocker, but the underlying fact (no counsel review yet) is still true and still worth knowing. See `docs/legal-review-required.md` and `docs/consent-legal-review-packet.md` for what a future review should cover.**

## Principles

1. **Consent is captured before recording, not assumed.** The contributor flow's sequence is identity → consent → camera readiness → recording, never the reverse.
2. **Consent is versioned and traceable, not a checkbox that disappears.** Every acceptance is a permanent row (`consent_records`) referencing exactly which text version was shown and which permitted-use classification the contributor chose — reconstructible later even if the live consent copy has since changed.
3. **Consent can be withdrawn.** `consent_records.revoked_at` supports withdrawal without deleting the historical record of what was originally agreed to (deleting it would itself destroy the evidence of the original, now-revoked, agreement).
4. **AI processing never expands what a contributor agreed to.** Transcription and story analysis are assistive tooling for admin review, not a redistribution or publication of the contributor's story — the underlying consent/permitted-use classification governs actual reuse, not the existence of a transcript.
5. **Minors are out of scope for V1.** The contributor identity form requires an explicit adult attestation (`isAdult: true`) before a submission can proceed at all; there is no guardian-consent pathway built. See `docs/decision-log.md` DL-004 and `docs/future-roadmap.md`.

## What data is collected

| Data | Purpose | Retention notes |
|---|---|---|
| First name, last name | Attribution, admin search | Kept as long as the submission exists |
| Email (optional) | Contributor follow-up if needed | Optional; contributor may omit |
| Relationship to camp (audience), years associated (free text), role info | Context for the story, audience-based question branching | Kept as long as the submission exists |
| Recorded video/audio | The testimonial itself | Private storage only; see `docs/security.md` |
| Transcript, AI-derived themes/summary/quotes | Assistive admin tooling (search, review) | Never influences editorial approval; see `docs/data-model.md` "Dual State Machines" |
| Consent acceptance record (version, permitted-use classification, timestamp) | Legal/audit trace of what was agreed to | Retained even after revocation (see above) |
| Hashed IP address (never raw), user agent | Abuse investigation only | Salted one-way hash; original IP is never persisted (`src/lib/hash.ts`) |
| Admin review notes, editorial state, favorite flag | Internal curation workflow | Internal only, never contributor-visible |
| Audit events (who did what, when) | Accountability | Retained indefinitely as an append-only log |

Analytics events (`analytics_events`) deliberately never contain testimonial content or free-text fields — only counters and IDs (e.g. "a submission was completed for campaign X"), so the analytics pipeline itself cannot become an unintended second copy of someone's story.

## Consent text and permitted-use classifications

The current draft consent text lives in `src/lib/consent.ts` (`buildConsentText(organizationName)`), which interpolates the real organization name at render time — an earlier revision of this file had that backwards (a static `CONSENT_TEXT` constant with a literal, never-substituted `[Organization Name]` placeholder and an in-band `[LEGAL REVIEW REQUIRED]` bracket that would have shown verbatim to a real contributor; both were fixed alongside DL-010, see that file's header comment for the full story). It is intentionally plain-language rather than formal legal boilerplate, on the theory that a real release should be both legally sound and something a camper's grandparent can actually understand — but "plain language" is not a substitute for counsel review. The owner has decided to proceed without that review for the initial MVP pilot (DL-010); this text is not yet counsel-reviewed and that fact is tracked there, not hidden.

Contributors additionally choose a **permitted-use classification** at consent time (`src/lib/consent.ts`, `PERMITTED_USE_CLASSIFICATIONS`):

- Internal review only (no external use)
- Website and social media
- Fundraising and recruitment materials
- All of the above (full permitted use)

This lets a contributor agree to be recorded and reviewed internally without necessarily agreeing to public marketing use — a materially different consent scope, tracked per-submission (`consent_records.permitted_use_classification`), not assumed uniform across all contributors.

## Withdrawal

A submission can transition to `WITHDRAWN` in the processing state machine (see `docs/data-model.md`). Product-level withdrawal (a contributor asking, after the fact, "please remove my story") is not yet a self-service flow in V1 — it would currently be handled as an admin-assisted request. Whether "withdrawal" should mean revoking future use only, or actual deletion of the underlying media/transcript, is a legal question (data retention/right-to-deletion), not an engineering one — see `docs/legal-review-required.md` item on retention and deletion.

## Data minimization decisions already made

- No raw IP address is ever stored (only a salted hash) — see `docs/security.md`.
- No public URL for any media asset ever exists.
- No minor-specific data is collected, because minors cannot currently submit at all.
- Analytics events carry no free-text or testimonial content.

## Open items requiring a legal/product decision (not yet resolved)

See `docs/legal-review-required.md` for the authoritative list. The highlights most directly relevant to this document: final review-and-approval of the consent/media-release language itself; a defined data retention period (or explicit "indefinite, with withdrawal available" policy); what "withdrawal" concretely does to already-processed AI artifacts (transcript/analysis) versus the original recording; whether/how a guardian-consent pathway for minors will eventually be built; and confirmation of which jurisdictions' recording-consent laws (e.g. one-party vs. two-party consent states) apply given contributors may record from anywhere.
