# Production Launch Checklist (Phase 13)

**This is the Phase 13 deliverable and stop point.** Per the governing build instructions, no production infrastructure has been provisioned, no production credentials requested, and no irreversible production operation performed. This document exists so the owner can make an informed Phase 14 authorization decision with a concrete, accurate picture of what remains — not a reassuring summary that glosses over real gaps.

**Do not proceed to Phase 14 (actual production provisioning) without explicit owner authorization**, per the original build instructions.

---

## 1. What is genuinely ready

- A working, tested application covering the full contributor loop (invite → identity → consent → camera-ready → record → upload → transcribe → analyze → admin review) against local Postgres and local file storage.
- 28 unit tests + 15 E2E tests (including real camera/mic capture via Chromium fake devices and automated WCAG2A/WCAG2AA accessibility scanning), all passing.
- A security/privacy review with one real P0 finding found and fixed (`docs/pre-production-review.md`).
- A provider-abstraction architecture specifically designed so that closing the remaining gaps (below) is contained, scoped engineering work, not a redesign.
- Full documentation set: product vision, brand audit, architecture, data model, security, privacy/consent, decision log, testing, deployment, cost model, this checklist.

## 2. What is NOT ready — concrete engineering work required before Phase 14

These are not "nice to haves" — without them, "deploy to production" is not actually possible, only "deploy something that will error on first real use."

1. **The Supabase Storage media adapter exists but is unverified.** `src/lib/storage/supabase-adapter.ts` is written against Supabase's documented SDK methods, but has never run against a live bucket (no credentials exist in this environment) and has one explicitly flagged open question (the raw-HTTP upload contract for a signed-upload token isn't fully documented by Supabase; the client-side upload code may need a Supabase-specific path using their SDK's `uploadToSignedUrl()` rather than the current generic XHR PUT). **This must be smoke-tested end-to-end against a real bucket early in Phase 14**, before relying on it for real contributor uploads. This is the one item on this list that's still a hard blocker for launch.
2. ~~Transcription provider~~ — **not needed for this launch.** Owner decision (DL-009): hold off on any paid transcription/AI vendor for the initial POC. Set `TRANSCRIPTION_PROVIDER=none` in production (not `fake` — see `.env.example` and DL-009 for why that distinction matters). The vendor recommendation researched earlier (AssemblyAI/Deepgram + Claude Haiku, `docs/deployment.md`) is preserved for when this is revisited post-POC.
3. ~~AI story-analysis provider~~ — same as above, not needed for this launch.
4. **Drizzle's migration workflow should switch from `push` to versioned migrations** (`drizzle-kit generate` + `drizzle-kit migrate`) before a production database exists, so schema changes are reviewable and reversible. See `docs/deployment.md`.
5. **Real first-admin creation.** Identity confirmed: **Josh Hirsch, josh.hirsch@gmail.com**. `src/db/seed.ts` creates a dev-only admin and must never touch production (enforced by the `assertNotProduction()` guard from the Phase 12 review) — the real account still needs to be created deliberately once a production database exists (e.g. a one-off script or manual `INSERT` with a freshly-generated bcrypt hash of a real, unique password communicated out of band — never committed to the repo).

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
- [ ] `npm run db:push` (or, if migrations have been switched to versioned by then, `drizzle-kit migrate`) run once against the real production database to create the schema.
- [ ] Real first-admin account created for Josh Hirsch (josh.hirsch@gmail.com) per Section 2, item 5.
- [ ] `npm audit` run and any high/critical findings resolved (no CI is configured yet to do this automatically — see `docs/pre-production-review.md` P3-2).

## 5. Monitoring plan

No external error-tracking or uptime-monitoring service is wired into the codebase today. Before or shortly after launch, recommend: an error-tracking service (e.g. Sentry) for unhandled exceptions in both Server Actions and route handlers, and a basic uptime check against the production URL. The `audit_events` table already provides an internal accountability log for admin actions and should be spot-checked periodically during the pilot.

## 6. Backup plan

Delegated to the managed Postgres provider's automated backups — confirm they're actually enabled (not just "available") before considering any real contributor data safe. Object storage backup/versioning depends on the chosen bucket provider's own settings. No custom backup tooling exists in this codebase.

## 7. Rollback procedure

- **Application code:** the hosting platform's built-in deployment rollback (e.g. Vercel's instant rollback to the previous build).
- **Database schema:** until migrations are switched to the versioned workflow (Section 2, item 4), a `pg_dump` snapshot immediately before any production schema change is the safety net. After the switch, `drizzle-kit migrate` provides a reviewable, revertible migration history.

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

### Still open

9. **Recording-consent law jurisdiction check** — will be handled as part of the legal review (item 4) rather than separately, since it's the same reviewer and the same underlying consent-language question.
10. **Legal reviewer's actual sign-off** — packet delivered; awaiting the review itself.
11. **Supabase storage adapter smoke test** — genuinely can't be done without a real bucket; first thing to do once Supabase is provisioned (Section 2, item 1).

Only items 9-11 remain before Phase 14 is fully clear to start — and 9 rides along with 10, so realistically it's the legal review landing and the storage adapter getting smoke-tested against a real bucket.

---

## Summary for the owner

The application itself is built, tested, and reviewed. With transcription/AI explicitly deferred and the infra stack decided (Vercel + Supabase, no dedicated domain yet), the remaining path to a real POC launch is now short: provision Vercel + Supabase, smoke-test the (already-written) storage adapter against the real bucket, create Josh Hirsch's real admin account, and get the consent-language packet back from your legal reviewer. No further product decisions are blocking — this is now primarily execution, pending your go-ahead to actually provision production infrastructure (Phase 14).
