# Production Launch Checklist (Phase 13)

**This is the Phase 13 deliverable and stop point.** Per the governing build instructions, no production infrastructure has been provisioned, no production credentials requested, and no irreversible production operation performed. This document exists so the owner can make an informed Phase 14 authorization decision with a concrete, accurate picture of what remains — not a reassuring summary that glosses over real gaps.

**Do not proceed to Phase 14 (actual production provisioning) without explicit owner authorization**, per the original build instructions.

---

## 1. What is genuinely ready

- A working, tested application covering the full contributor loop (invite → identity → consent → camera-ready → record → upload → transcribe → analyze → admin review) against local Postgres and local file storage.
- 34 unit tests + 15 E2E tests (including real camera/mic capture via Chromium fake devices and automated WCAG2A/WCAG2AA accessibility scanning), all passing.
- A security/privacy review with one real P0 finding found and fixed (`docs/pre-production-review.md`).
- A provider-abstraction architecture specifically designed so that closing the remaining gaps (below) is contained, scoped engineering work, not a redesign.
- A non-destructive, idempotent script to create the real first admin account (`npm run admin:create`), verified end-to-end against local Postgres — see Section 2, item 5.
- CI (`.github/workflows/ci.yml`) running typecheck, lint, unit tests, `npm audit --audit-level=high`, and the full Playwright E2E suite against a real Postgres service container on every push/PR to `main`.
- Versioned database migrations (`npm run db:generate` / `npm run db:migrate`), initial migration committed and verified, CI exercises it on every push — see Section 2, item 4.
- A clean production build (`npm run build`) — verified locally, compiles and type-checks with no errors.
- A non-destructive, idempotent script to create the real organization and campaigns (`npm run content:bootstrap`), verified end-to-end against a fresh migrated database — see Section 2, item 6.
- A step-by-step provisioning walkthrough for the actual Phase 14 setup, `docs/phase-14-provisioning-runbook.md` — turns this checklist into an ordered set of actions.
- Full documentation set: product vision, brand audit, architecture, data model, security, privacy/consent, decision log, testing, deployment, cost model, this checklist.

## 2. What is NOT ready — concrete engineering work required before Phase 14

These are not "nice to haves" — without them, "deploy to production" is not actually possible, only "deploy something that will error on first real use."

1. **The Supabase Storage media adapter exists but is unverified.** `src/lib/storage/supabase-adapter.ts` is written against Supabase's documented SDK methods, but has never run against a live bucket (no credentials exist in this environment) and has one explicitly flagged open question (the raw-HTTP upload contract for a signed-upload token isn't fully documented by Supabase; the client-side upload code may need a Supabase-specific path using their SDK's `uploadToSignedUrl()` rather than the current generic XHR PUT). **This must be smoke-tested end-to-end against a real bucket early in Phase 14**, before relying on it for real contributor uploads. This is the one item on this list that's still a hard blocker for launch.
2. ~~Transcription provider~~ — **not needed for this launch.** Owner decision (DL-009): hold off on any paid transcription/AI vendor for the initial POC. Set `TRANSCRIPTION_PROVIDER=none` in production (not `fake` — see `.env.example` and DL-009 for why that distinction matters). The vendor recommendation researched earlier (AssemblyAI/Deepgram + Claude Haiku, `docs/deployment.md`) is preserved for when this is revisited post-POC.
3. ~~AI story-analysis provider~~ — same as above, not needed for this launch.
4. ~~Drizzle's migration workflow should switch from `push` to versioned migrations~~ — **done (DL-011).** `npm run db:generate` + `npm run db:migrate` now exist alongside the local-dev-only `db:push`; the initial migration is committed (`drizzle/0000_zippy_cargill.sql`) and verified against a fresh database, and CI's `e2e` job runs `db:migrate` (not `db:push`) so every migration is exercised before merge. See `docs/deployment.md`.
5. ~~Real first-admin creation~~ — **script ready, not yet run.** Identity confirmed: **Josh Hirsch, josh.hirsch@gmail.com**. `src/db/seed.ts` creates a dev-only admin and must never touch production (enforced by the `assertNotProduction()` guard from the Phase 12 review). The real account is created with a separate, non-destructive script: `src/scripts/create-admin.ts` (`npm run admin:create`). It does a single targeted insert/update on `admin_users`, generates and prints a strong random password once (or accepts one via `ADMIN_PASSWORD`), is safe to re-run (updates the existing row by email instead of erroring or duplicating), and refuses to guess which organization to attach the admin to if more than one exists. Verified end-to-end against local Postgres (create, idempotent re-run, explicit `--reset-password`, and the missing-args error path all behave as documented). Once a production database exists:
   ```
   ADMIN_EMAIL="josh.hirsch@gmail.com" ADMIN_NAME="Josh Hirsch" npm run admin:create
   ```
   Copy the printed password immediately into a password manager — it is never stored in plaintext and is not shown again.
6. ~~No production organization/campaign data would exist even after a fully-migrated database~~ — **done (DL-012).** Discovered while writing `docs/phase-14-provisioning-runbook.md`: `src/db/seed.ts` is the only code that ever created the `organizations`/`campaigns` rows, and it's dev-only and destructive. Without a fix, a fully-migrated, fully-admin-configured production database would still 404 on every campaign URL. Fixed with a third non-destructive, idempotent script — `src/scripts/bootstrap-content.ts` (`npm run content:bootstrap`) — that creates the real organization and the three already-designed campaigns (Alumni Stories, Staff Stories, Parent Stories, with their real questions — not placeholder content, extracted from `seed.ts`). Only the "alumni" campaign is activated by default, matching DL-009's small-alumni-pilot scope. Verified end-to-end against a fresh migrated database: creation, idempotent re-run (no duplicates), and confirmed the app's real data layer (`getActiveCampaignBySlug`, `getQuestionsForAudience`) correctly serves the result.

## 3. Environment variable inventory

See `.env.example` for the authoritative source. Every variable below needs a **real, unique-to-production value** before Phase 14 — none of the local dev values in `.env.local` may be reused:

| Variable | Notes for production |
|---|---|
| `DATABASE_URL` | Real managed Postgres connection string. Confirm it enforces TLS. |
| `SESSION_SECRET` | Fresh random secret (`openssl rand -base64 32`), never reused from dev. Losing/rotating this invalidates all admin sessions at once — a useful emergency "log everyone out" lever, not just a downside. |
| `STORAGE_DRIVER` | `supabase` — adapter is written, unverified against a live bucket (see Section 2, item 1). |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET` | Real Supabase project credentials once provisioned. |
| `TRANSCRIPTION_PROVIDER` | `none` for this launch (DL-009) — no API key needed. |
| `AI_ANALYSIS_PROVIDER` | Irrelevant while `TRANSCRIPTION_PROVIDER=none` (analysis is never reached) — leave as `fake`, no API key needed. |
| `CRON_SECRET` | Fresh random secret; must match whatever the production scheduler is configured to send. |
| `APP_BASE_URL` | The real production domain, `https://`. |
| `NODE_ENV` | Must be `production` in the deployed environment — this is also what now activates the `assertNotProduction()` seed-script guard, so getting this right matters for safety, not just convention. |

## 4. Infrastructure checklist

- [ ] Hosting platform account/project created (Vercel project linked to this repository).
- [ ] Managed Postgres instance provisioned (Supabase); confirm backup/point-in-time-recovery is enabled by the provider.
- [ ] Supabase Storage bucket provisioned, confirmed **private by default** (no public read); `SUPABASE_SERVICE_ROLE_KEY` scoped/handled as a real secret (server-side only, never in client code).
- [ ] **Smoke-test the Supabase storage adapter** against the real bucket (upload, confirm, signed read, delete) before trusting it with a real contributor upload — see Section 2, item 1.
- [ ] Scheduled job runner: **not needed for this launch** with `TRANSCRIPTION_PROVIDER=none` — no processing jobs are ever enqueued, so there's nothing for `/api/jobs/process` to do. Skip setting up Vercel Cron until transcription/AI is revisited post-POC.
- [ ] Domain/DNS: hosting platform's default subdomain (decided, DL-008) — no action needed beyond noting the resulting URL.
- [ ] All environment variables from Section 3 set in the hosting platform's secret store (never committed to the repo) — note `TRANSCRIPTION_PROVIDER=none`, not `fake`.
- [ ] `npm run db:migrate` run once against the real production database to create the schema (versioned migrations — see Section 2, item 4. Do not use `db:push` against production).
- [ ] `npm run content:bootstrap` run once to create the real organization and campaigns — see Section 2, item 6. Without this, the site has no campaign to serve even though the schema exists.
- [ ] Real first-admin account created for Josh Hirsch (josh.hirsch@gmail.com) — run `npm run admin:create` per Section 2, item 5.
- [x] `npm audit --audit-level=high` now runs automatically on every push/PR to `main` via `.github/workflows/ci.yml` (see `docs/pre-production-review.md` P3-2 — fixed). No action needed here beyond keeping CI green; a new high/critical finding will fail the build.

## 5. Monitoring plan

No external error-tracking or uptime-monitoring service is wired into the codebase today. Before or shortly after launch, recommend: an error-tracking service (e.g. Sentry) for unhandled exceptions in both Server Actions and route handlers, and a basic uptime check against the production URL. The `audit_events` table already provides an internal accountability log for admin actions and should be spot-checked periodically during the pilot.

## 6. Backup plan

Delegated to the managed Postgres provider's automated backups — confirm they're actually enabled (not just "available") before considering any real contributor data safe. Object storage backup/versioning depends on the chosen bucket provider's own settings. No custom backup tooling exists in this codebase.

## 7. Rollback procedure

- **Application code:** the hosting platform's built-in deployment rollback (e.g. Vercel's instant rollback to the previous build).
- **Database schema:** versioned migrations are now in place (Section 2, item 4) — `npm run db:generate` gives a reviewable diff before any schema change ships. A `pg_dump` snapshot immediately before applying a migration in production remains the safety net of last resort, since Drizzle doesn't generate an automatic down-migration.

## 8. Production smoke test (run once, immediately after deploy, before announcing to anyone)

1. Load the production home page over HTTPS; confirm the correct (non-placeholder, if brand assets have arrived by then) branding renders.
2. Start a campaign submission as a real test — using a clearly-fake test identity, not a real alumnus's real story — through to completion, confirming a real recording uploads via the Supabase adapter and the submission reaches `SUBMITTED`.
3. With `TRANSCRIPTION_PROVIDER=none`, confirm the submission transitions straight `PROCESSING → READY_FOR_REVIEW` with no processing job created (query `processing_jobs` for that submission and confirm it's empty) and no transcript/analysis fabricated.
4. Log in as the real first-admin account (Josh Hirsch); confirm the test submission is visible, searchable by name, and its media plays back via a signed URL (confirm the raw storage URL is NOT directly accessible without a token).
5. Approve/reject/favorite the test submission; confirm it persists.
6. Log out; confirm `/admin/dashboard` redirects to login when unauthenticated.
7. Delete or clearly mark the test submission so it doesn't linger as noise in the real story library.

## 9. Unresolved decisions requiring owner input before Phase 14

### Decided (owner-approved)

1. ~~**Storage vendor**~~ — Supabase Storage (paired with Supabase Postgres). DL-008.
2. ~~**Hosting platform**~~ — Vercel. DL-008.
3. ~~**Production domain**~~ — hosting platform's default subdomain for the Phase 15 pilot; a real domain is deferred, not rejected. DL-008.
4. ~~**Legal review path**~~ — owner has a reviewer; the packet (`docs/consent-legal-review-packet.md`) is prepared and ready to forward. DL-008.
5. ~~**Data retention policy**~~ — deferred to be decided alongside consent language, with the same reviewer. DL-008.
6. ~~**Transcription + AI analysis vendor**~~ — explicitly deferred until after the POC, to keep initial cost at zero. `TRANSCRIPTION_PROVIDER=none` in production. DL-009.
7. ~~**Who is the real first admin?**~~ — Josh Hirsch, josh.hirsch@gmail.com. DL-009.
8. ~~**Pilot scope**~~ — small, alumni-only, "a handful of contributors" to prove the concept before expanding scope. No fixed timeline attached; expansion happens after POC validation, not on a calendar date. DL-009.
9. ~~**Legal reviewer's sign-off & recording-consent jurisdiction check**~~ — owner explicitly decided to proceed with the MVP pilot without waiting for these ("pass on the legal review for now, this is just an MVP version"). The consent flow itself is fully built and unchanged; what's deferred is external counsel review of the specific draft language. Real, accepted risk — see DL-010 for exactly what this does and doesn't mean, and when to revisit it (before expanding past the initial small pilot). The packet (`docs/consent-legal-review-packet.md`) stays ready to send whenever the owner wants to circle back.
10. ~~**Database migration workflow**~~ — switched from `db:push` to versioned migrations (`db:generate`/`db:migrate`), initial migration committed and verified, CI now exercises it. DL-011.
11. ~~**Production organization/campaign bootstrap**~~ — a fully-migrated production database would have had no organization or campaign to serve; fixed with `npm run content:bootstrap`. DL-012.

### Still open

12. **Supabase storage adapter smoke test** — genuinely can't be done without a real bucket; first thing to do once Supabase is provisioned (Section 2, item 1).

Item 12 — the storage adapter smoke test — is now the only thing standing between here and Phase 14, and it requires a real Supabase bucket to exist first. `docs/phase-14-provisioning-runbook.md` has the full ordered walkthrough, including this step.

---

## Summary for the owner

The application itself is built, tested, and reviewed — CI now runs the full check suite automatically on every push, database migrations are versioned and committed, and a production build compiles cleanly. With transcription/AI explicitly deferred, the infra stack decided (Vercel + Supabase, no dedicated domain yet), and legal review consciously deferred for the MVP pilot (DL-010), the remaining path to a real POC launch is now just: provision Vercel + Supabase, run `npm run db:migrate` and `npm run content:bootstrap` against the real database, smoke-test the (already-written) storage adapter against the real bucket, and run `npm run admin:create` for Josh Hirsch's real account. `docs/phase-14-provisioning-runbook.md` walks through all of this in order. No further product or process decisions are blocking — this is now purely execution, pending your go-ahead to actually provision production infrastructure (Phase 14).
