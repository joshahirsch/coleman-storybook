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

1. **A real media storage adapter must be written.** Only a local-filesystem adapter exists (`src/lib/storage/local-adapter.ts`). It implements the same `MediaStorageAdapter` interface a Supabase Storage / S3 / R2 adapter would, so this is additive work (one new file + one line in `src/lib/storage/index.ts`), not a rearchitecture — but it does not exist yet. See `docs/deployment.md`.
2. **A real transcription provider must be chosen and integrated.** Only the deterministic `fake-local` provider exists. Same story: `TranscriptionProvider` interface exists, no real implementation does.
3. **A real AI story-analysis provider must be chosen and integrated.** Same as above for `StoryAnalysisProvider`.
4. **Drizzle's migration workflow should switch from `push` to versioned migrations** (`drizzle-kit generate` + `drizzle-kit migrate`) before a production database exists, so schema changes are reviewable and reversible. See `docs/deployment.md`.
5. **A real first-admin creation procedure.** `src/db/seed.ts` creates a dev-only admin with a hardcoded password and must never touch production (now enforced by the `assertNotProduction()` guard added in the Phase 12 review — but that guard prevents accidental seeding, it does not create a real admin account). A production first-admin needs to be created deliberately (e.g. a one-off script or manual `INSERT` with a freshly-generated bcrypt hash of a real, unique password, communicated to that person out of band, never committed to the repo).

## 3. Environment variable inventory

See `.env.example` for the authoritative source. Every variable below needs a **real, unique-to-production value** before Phase 14 — none of the local dev values in `.env.local` may be reused:

| Variable | Notes for production |
|---|---|
| `DATABASE_URL` | Real managed Postgres connection string. Confirm it enforces TLS. |
| `SESSION_SECRET` | Fresh random secret (`openssl rand -base64 32`), never reused from dev. Losing/rotating this invalidates all admin sessions at once — a useful emergency "log everyone out" lever, not just a downside. |
| `STORAGE_DRIVER` | Set to whatever the new real adapter registers itself as, once written. |
| `STORAGE_SIGNING_SECRET` | Fresh random secret, independent from `SESSION_SECRET`. |
| `TRANSCRIPTION_PROVIDER` + its API key | Once a vendor is chosen and integrated. |
| `AI_ANALYSIS_PROVIDER` + its API key | Once a vendor is chosen and integrated. |
| `CRON_SECRET` | Fresh random secret; must match whatever the production scheduler is configured to send. |
| `APP_BASE_URL` | The real production domain, `https://`. |
| `NODE_ENV` | Must be `production` in the deployed environment — this is also what now activates the `assertNotProduction()` seed-script guard, so getting this right matters for safety, not just convention. |

## 4. Infrastructure checklist

- [ ] Hosting platform account/project created (e.g. Vercel project linked to this repository).
- [ ] Managed Postgres instance provisioned; confirm backup/point-in-time-recovery is enabled by the provider.
- [ ] Object storage bucket provisioned, confirmed **private by default** (no public read), with the real adapter's credentials scoped to only what it needs (not a full-account key if a scoped one is available).
- [ ] Scheduled job runner configured to call `POST /api/jobs/process` with `x-cron-secret` on an interval (Vercel Cron or equivalent) — pick an interval appropriate to expected submission volume (e.g. every few minutes is more than sufficient for a single-camp pilot).
- [ ] Domain/DNS: decide on and configure the production domain (or use the hosting platform's default subdomain for the pilot and add a custom domain later — either is fine for Phase 15's bounded pilot).
- [ ] All environment variables from Section 3 set in the hosting platform's secret store (never committed to the repo).
- [ ] `npm run db:push` (or, if migrations have been switched to versioned by then, `drizzle-kit migrate`) run once against the real production database to create the schema.
- [ ] Real first-admin account created per Section 2, item 5.
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
2. Start a campaign submission as a real test — using a clearly-fake test identity, not a real staff member's real story — through to completion, confirming a real recording uploads and the submission reaches `SUBMITTED`.
3. Confirm the job runner picks it up and it reaches `READY_FOR_REVIEW` (or fails cleanly and visibly if a real transcription/AI vendor call errors — confirm the failure path doesn't silently lose the submission).
4. Log in as the real first-admin account; confirm the test submission is visible, searchable, and its media plays back via a signed URL (confirm the raw storage URL is NOT directly accessible without a token).
5. Approve/reject/favorite the test submission; confirm it persists.
6. Log out; confirm `/admin/dashboard` redirects to login when unauthenticated.
7. Delete or clearly mark the test submission so it doesn't linger as noise in the real story library.

## 9. Unresolved decisions requiring owner input before Phase 14

These are genuine decisions, not defaults an engineer should pick alone:

1. **Storage vendor** (Supabase Storage / S3 / R2 / other) — cost profile differs meaningfully by egress pricing (see `docs/cost-model.md`); needs a budget-aware choice.
2. **Transcription vendor** — needs a choice and a funded API budget.
3. **AI analysis vendor** — needs a choice and a funded API budget.
4. **Hosting budget approval** — even likely-free-tier-sufficient services should be explicitly approved, since usage can grow past free tiers.
5. **Production domain** — use the hosting platform's default subdomain for the Phase 15 pilot, or set up a real Camp Coleman domain/subdomain now?
6. **Consent language legal review** — counsel must review and approve the actual text in `src/lib/consent.ts` before any real contributor sees it. This blocks real use regardless of infrastructure readiness.
7. **Data retention policy** — how long is contributor media/transcript data kept, and what does "withdrawal" concretely do to already-processed AI artifacts vs. the original recording? See `docs/privacy-and-consent.md`.
8. **Who is the real first admin(s)?** Names/emails needed to create real production admin accounts per Section 2, item 5.
9. **Recording-consent law jurisdiction check** — confirm applicability given contributors may record from anywhere (one-party vs. two-party consent states/countries), per `docs/legal-review-required.md`.
10. **Pilot scope and timeline** — how many contributors, which campaigns, over what window, for the Phase 15 bounded pilot this launch is presumably in service of.

---

## Summary for the owner

The application itself — the actual product experience for both contributors and admin staff — is built, tested, and reviewed. What stands between here and a real production launch is: (a) a bounded, well-scoped set of engineering tasks (real storage/transcription/AI adapters, versioned migrations, a real admin-creation procedure — none of which require a redesign, all of which require credentials/budget this environment doesn't have), and (b) a set of decisions only Camp Coleman/the owner can make (vendor choices, budget, legal sign-off on consent language, retention policy, who the real admins are). Per the standing instruction to stop here rather than proceed into Phase 14 production provisioning, this is the hand-off point — awaiting direction on the items in Section 9 before any production credentials are requested or any production infrastructure is touched.
