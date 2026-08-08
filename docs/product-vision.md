# Coleman Storybook — Product Vision (V1 / MVP)

Status: DRAFT — Phase 0
Working product name: **Coleman Storybook** (must remain configurable; not a final brand decision)
Customer zero: URJ Camp Coleman (https://campcoleman.org/)

## 1. Product Thesis

Core loop: **Invite → Story → Consent → Record → Upload → Transcribe → Analyze → Review → Search → Reuse**

Contributors (alumni, staff, parents, volunteers, community members) should feel invited to tell a meaningful Coleman story — an experience that feels like Camp Coleman, not like filling out a form. Administrators (Camp Coleman staff) should end up with a searchable library of human stories, not a folder of anonymous video files.

One recording should eventually be able to generate many derivative assets (testimonial videos, social clips, website quotes, alumni spotlights, recruitment/fundraising content, oral-history archive entries). V1 does not need to automate every derivative asset, but the data and processing architecture must make those later capabilities possible without a rebuild.

## 2. Core User Types

1. **Contributor** — an alumnus, former/current staff member, parent, alumni-parent, volunteer, or other community member sharing a story. No account required. Primarily on a phone.
2. **Camp Coleman Administrator** (e.g., Brian or designated staff) — authenticated internal user who reviews submissions, manages campaigns, searches the library, and approves content for reuse.
3. **(Future) Organization Owner** — a lightweight concept representing "which camp/org does this campaign belong to," enabling future reuse beyond Coleman without a rebuild. Not a full multi-tenant SaaS admin role in V1.
4. **(Future) Public Storybook Visitor** — someone browsing a curated, explicitly-approved public story archive. Out of scope for V1 (Phase 18+).

## 3. Primary Jobs-to-Be-Done

- As a Coleman alum/staff/parent, I want to easily record and share a meaningful memory in a few minutes on my phone, without creating an account or feeling like I'm using enterprise software.
- As a Camp Coleman administrator, I want to browse, search, and filter submitted stories by theme, campaign, audience, and consent/approval status, so I can find usable content for marketing, fundraising, and archival purposes far faster than manually reviewing a folder of videos.
- As a Camp Coleman administrator, I want confidence that every piece of usable content has a clear, traceable consent record before it's ever reused publicly.
- As a future Coleman Storybook operator (Camp Coleman today, potentially other camps/nonprofits later), I want the platform's org/brand/campaign/consent configuration to not be hard-coded to one organization, without over-building multi-tenant SaaS infrastructure before there's evidence anyone but Coleman wants it.

## 4. MVP Scope Boundaries

**In scope for V1 (through Phase 13 / owner production authorization):**
- Configurable campaigns (title, slug, audience, questions, consent version, hero/intro/completion copy, active state).
- Contributor identity capture (name, email, relationship to Coleman, years associated) — no account required.
- Versioned, traceable consent capture (not legally-approved language — see legal review doc).
- Browser-based camera/mic recording (Quick Answers mode first; schema supports future Guided Story mode).
- Local review/retake before upload.
- Durable, resumable-feeling upload to private object storage; no false "success" before persistence is confirmed.
- Admin authentication + protected story library: list, detail, playback, transcript, consent view, notes, favorite, approve/reject, filter, text search.
- Transcription pipeline (provider-abstracted).
- AI story intelligence: summary, themes, pull quotes, marketing-use suggestions — assistive only, never auto-publishing.
- Postgres-backed text search sufficient for V1; data model leaves room for future semantic/vector search.
- Adult-only contributor eligibility by default; minors/guardian-consent flow documented but not built.
- Deployment preparation documentation; no production provisioning without explicit owner authorization.

**Explicitly out of scope for V1** (see `docs/future-roadmap.md`): native mobile apps, full video editor, full DAM, automated public publishing, CRM integrations, marketing automation, social scheduling, billing, enterprise SSO, complex RBAC, the public-facing "Coleman Storybook" curated archive, minors/guardian workflow, automated montage generation, multilingual transcription, elaborate semantic search, recommendation engine, white-label onboarding.

## 5. Measurable Success Criteria (V1 "Definition of Done")

A story-level, end-to-end demonstration must show:
1. A branded campaign loads correctly.
2. A contributor can complete identity details.
3. Consent is durably recorded with version, timestamp, and technical evidence.
4. Camera/mic flow works (grant, preview, deny/error recovery).
5. Contributor can record, replay, and retake before submitting.
6. Media uploads durably to private object storage; a submission is only marked successful after backend persistence is confirmed.
7. Admin access is authenticated and authorized; no public access to raw submissions/media.
8. Admin can review a story: playback, transcript, consent, metadata.
9. Transcript is generated via the abstracted transcription pipeline.
10. AI story metadata (summary/themes/quotes) is generated and clearly marked as AI-assistive, not human-approved.
11. Stories are searchable by transcript text and filterable (campaign, audience, theme, status, favorite).
12. Processing failures (transcription/analysis) are visible and actionable to admins, not silently swallowed.
13. Mobile experience (iPhone/Android widths) is verified usable, not merely "should work."
14. Automated tests cover the critical happy-path and key negative paths (permission denied, upload failure, disabled campaign, double submission, unauthenticated admin access).
15. A deployment path is documented (`docs/production-launch-checklist.md`) without any production infrastructure having actually been provisioned.

Success is evaluated by whether these are **demonstrated**, not merely coded — per the project's "no false claims" and "verify" principles.

## 6. Legal / Privacy Unknowns (see `docs/legal-review-required.md` for full detail)

- Media release / testimonial consent language has not been drafted or approved by counsel; Coleman Storybook will draft placeholder language clearly labeled as requiring legal review.
- Data retention, withdrawal, and deletion rights policy are undefined.
- Minors' participation pathway is deferred; V1 defaults to adult-only contribution.
- Recording-consent law varies by state/jurisdiction (contributor self-attestation is the intended mitigation, not a substitute for legal guidance).
- Accessibility compliance target (WCAG level) should be confirmed with Coleman/counsel if this becomes public-facing at scale.
- Ownership/licensing terms for contributor-submitted media (marketing use rights, revocation) need explicit, lawyer-approved language.

## 7. Technical Unknowns (to resolve in Phase 1 / progressively)

- No official Camp Coleman brand guide, logo, or approved photo library has been supplied yet (see `docs/brand-audit.md`).
- Camp Coleman's DNS/hosting setup and willingness to add a subdomain (e.g., `stories.campcoleman.org`) is unknown.
- Whether Coleman has an existing relationship with a transcription/AI vendor, an email provider, or an analytics tool that should be preferred over a green-field choice.
- Budget/cost tolerance for hosting, storage, transcription, and AI analysis at expected submission volume (unknown volume — no historical baseline).
- Whether Coleman wants admin accounts to be Coleman-managed (e.g., Google Workspace SSO) or platform-managed credentials — affects the "mature managed authentication" choice in Phase 1.
- Real submission volume/concurrency expectations (affects whether direct-to-storage uploads are necessary for V1 or a "nice to have").

## 8. Product Risks

- **Emotional-experience risk:** if the recording flow feels like generic SaaS, the product fails its core differentiator regardless of technical quality.
- **Consent risk:** any gap in consent traceability could expose Coleman to reputational or legal risk if content is later reused publicly.
- **Minors risk:** camp populations skew toward families; strict adult-only gating for V1 is a deliberate risk-reduction choice, not an oversight.
- **Media privacy risk:** testimonial video is sensitive; a storage/access misconfiguration would be a serious incident, not a cosmetic bug.
- **Scope-creep risk:** the source specification is intentionally expansive (multi-org "readiness," semantic search, marketing asset generation, public curated Storybook). The architecture must leave room for these without building them prematurely.
- **Single-organization lock-in risk (the inverse of scope creep):** naming things "Coleman" instead of "Organization" throughout the codebase would make future reuse costly. Mitigated via the lightweight `Organization`/`OrganizationBrand` concept from day one (see `docs/architecture.md`), without building full multi-tenant SaaS infrastructure.

## 9. Working Product Name Note

"Coleman Storybook" is used throughout code and docs as a configurable working name (e.g., an `APP_NAME` / organization-brand config value), not a hard-coded string baked into UI copy or the data model. Final naming is an owner decision, not a Phase 0 blocker.
