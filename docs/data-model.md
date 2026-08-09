# Data Model

This is the narrative companion to `src/db/schema.ts`, which is the actual source of truth (Drizzle ORM, PostgreSQL). If this document and the schema ever disagree, the schema is correct and this document is stale — please file that as a bug.

See also `docs/architecture.md` Section 5 for the one-paragraph summary and the dual-state-machine rationale, and `docs/security.md` / `docs/privacy-and-consent.md` for why certain fields exist (hashed IPs, consent traceability, synthetic-data flags).

## Entity overview

**Organization / brand / admin**

- `organizations` — the tenant boundary. V1 ships with exactly one row (Camp Coleman) but every other table hangs off an `organization_id` so a second organization is a data-insert away, not a schema migration. See `docs/architecture.md` "Tenancy Strategy."
- `organization_brands` — one-to-one with `organizations`. Visual tokens (colors, fonts, logo URL) are all nullable, with an explicit `is_placeholder` boolean so the app can render safely even before real values are set. As of DL-013, the row is populated with the real, owner-approved Camp Coleman tokens (`is_placeholder: false`) via `npm run brand:update` — see `docs/brand-audit.md` for the audit and provenance, and `src/scripts/update-brand.ts` for the idempotent script that applies them.
- `admin_users` — staff accounts. `password_hash` is bcrypt (never plaintext, never reversible). `active` allows disabling an account without deleting its audit trail.

**Campaigns / questions**

- `campaigns` — a themed invitation to contribute (e.g. "Alumni Stories," "Staff Stories"). Holds all landing-page copy, `recording_mode` (`quick_answers` or `guided_story`), `max_duration_seconds`, and the `consent_version` that applies to submissions started under it. `(organization_id, slug)` is unique.
- `campaign_questions` — the prompts shown for a campaign in Quick Answers mode. `audience` is nullable and, when set, restricts a question to one `relationship` value (e.g. only camper_staff sees a staff-specific prompt). This is a flat per-question filter, deliberately not a rules engine — see `docs/architecture.md` "Audience Branching."

**Contributors / submissions**

- `contributors` — the person telling a story. `relationship` is the audience/relationship-to-camp enum (`camper`, `staff`, `camper_staff`, `parent`, `alumni_parent`, `volunteer`, `other`). `is_synthetic` marks dev/test fixtures so they are never mistaken for real contributors (visible as a badge in the admin UI).
- `submissions` — one attempt at contributing to one campaign. Carries the **processing state machine** (`state`, see below) — never the editorial approval state, which lives separately in `admin_reviews`.
- `submission_answers` — one row per question answered (Quick Answers mode) or one row for the whole recording (Guided Story mode, where `campaign_question_id` is null). `order` preserves display sequence.
- `media_assets` — the actual recorded file's metadata. `storage_key` is the only pointer to the private object; there is no public URL anywhere in this table or model. `status` (`pending` → `confirmed` / `failed`) reflects whether the object's existence has actually been verified server-side — see "Never trust the client" in `docs/architecture.md`.

**Consent**

- `consent_records` — one row per acceptance. `consent_version` + `consent_text_reference` together let the exact text a contributor agreed to be reconstructed later even if the live copy has since changed. `acceptance_ip_hash` is a salted hash, never a raw IP (see `docs/security.md`). `revoked_at` supports withdrawal without deleting the historical consent trace itself. See `docs/privacy-and-consent.md` for the full lifecycle.

**Transcripts / AI story intelligence**

- `transcripts` — one row per transcribed media asset. `provider` and `model` record which transcription vendor produced it (`fake-local` for synthetic/dev data, clearly labeled in the admin UI). `raw_response` retains the provider's full response for debugging/reprocessing without needing to re-call the vendor.
- `story_analyses` — AI-derived `summary`, `themes[]`, `pull_quotes` (JSON array of `{text, ...}` sourced verbatim from the transcript, never fabricated), and `marketing_use_suggestions[]`. `superseded_by` supports re-running analysis without losing the prior version's audit trail. **This table has no influence on editorial approval** — it is assistive metadata only, per the spec's explicit "AI never auto-publishes" requirement.

**Tags / editorial review**

- `tags` — org-scoped labels, either `ai_theme` (mirrors a `story_analyses.themes[]` entry, kept as a first-class row so it can be browsed/managed) or `manual` (admin-created).
- `submission_tags` — many-to-many join.
- `admin_reviews` — the **editorial approval state machine** (`editorial_state`: `PENDING` / `APPROVED` / `REJECTED`), one row per submission (unique on `submission_id`), plus `favorite` and free-text `notes`. Deliberately a separate table from `submissions`, not a column on it — see "Dual State Machines" below.

**Processing / audit / analytics**

- `processing_jobs` — the DB-backed work queue for transcription and analysis jobs. `status` (`queued` → `running` → `succeeded`/`failed`), `attempts`, `last_error`. Claimed via `SELECT ... FOR UPDATE SKIP LOCKED` so multiple job-runner invocations never double-process the same job.
- `audit_events` — who (actor type/id) did what (event type) to what (subject type/id), when. Powers accountability for admin actions (login, review changes) and consent-relevant contributor actions.
- `analytics_events` — product usage counters (campaign started, submission completed, etc.) with a `metadata` JSON blob that **never contains testimonial content** — see `docs/architecture.md` Section 10 and `docs/privacy-and-consent.md`.

## Dual state machines (why they're separate tables)

A submission's **processing state** (did the upload and AI pipeline complete) and its **editorial state** (did a human decide this story is approved for reuse) are tracked in two different tables (`submissions.state` and `admin_reviews.editorial_state`) with two independent, explicitly-enforced transition graphs (`src/lib/submission-state.ts`). This is a deliberate, spec-mandated separation, not an oversight: AI output (transcripts, themes, quotes) must never be able to move a story into an "approved for marketing use" state. A submission can be fully `READY_FOR_REVIEW` and sit at `PENDING` editorial state indefinitely; conversely a `PROCESSING_FAILED` submission can still, in principle, be manually reviewed from whatever content did make it through. Keeping these as separate tables with separate transition functions makes it structurally impossible for a code path to accidentally conflate "the pipeline finished" with "a human approved this."

### Processing state transitions (`submissions.state`)

`STARTED → RECORDING → UPLOADING → SUBMITTED → PROCESSING → READY_FOR_REVIEW`, with `PROCESSING_FAILED` reachable from `PROCESSING` and `WITHDRAWN` reachable from most pre-`READY_FOR_REVIEW` states. Enforced by `assertTransition`/`canTransition` in `src/lib/submission-state.ts`, which throws `InvalidSubmissionTransitionError` on any attempted illegal transition rather than silently allowing it.

### Editorial state transitions (`admin_reviews.editorial_state`)

`PENDING ⇄ APPROVED ⇄ REJECTED` — admin-only, freely reversible in either direction (an admin can un-approve or un-reject), because editorial judgment is allowed to change. Enforced by `canTransitionEditorial` in the same file.

## Fields intentionally absent

- **No public URL column anywhere.** Every media reference is a private `storage_key`; the only way to view a recording is a server-issued, time-limited signed URL. See `docs/security.md`.
- **No raw IP address column.** Only `acceptance_ip_hash` (salted SHA-256) exists; the plaintext IP is never persisted.
- **No minor/guardian fields.** V1 is adult-only by explicit decision (`docs/decision-log.md` DL-004); a guardian-consent data model is deferred until requirements and legal review exist.
- **No structured "years associated" field.** `contributors.years_associated` is free text the contributor types. A real year-range filter would need a structured field (or a deliberate parsing strategy) — noted in `docs/future-roadmap.md`, not built speculatively.
