# Deployment

**Status: no environment beyond local development currently exists.** This document describes the target topology and the concrete steps to get there. It is written so that Phase 13/14 (see `docs/phase-status.md`) has an accurate, actionable starting point — not a description of something already running.

## Target topology (V1)

- **Application:** Vercel (owner-approved, `docs/decision-log.md` DL-008).
- **Database:** Supabase Postgres (owner-approved, DL-008).
- **Object storage:** Supabase Storage (owner-approved, DL-008 — chosen over Cloudflare R2/S3 for single-vendor simplicity; the cost difference is immaterial at pilot scale, see `docs/cost-model.md`).
- **Scheduled job runner:** Vercel Cron calling `POST /api/jobs/process` with the `x-cron-secret` header.
- **Domain:** the hosting platform's default subdomain for the Phase 15 pilot (owner-approved, DL-008) — a real Camp Coleman domain is deferred, not rejected, and is a one-variable (`APP_BASE_URL`) change whenever it's wanted.
- **Transcription / AI analysis vendors:** not yet chosen — see "Vendor recommendation" below and `docs/cost-model.md`.

## Provider abstraction status — what's actually implemented vs. designed-for

| Provider | Interface | Local/dev implementation | Production implementation |
|---|---|---|---|
| Media storage | `MediaStorageAdapter` (`src/lib/storage/types.ts`) | `local-adapter.ts` — filesystem + HMAC-signed URLs | `supabase-adapter.ts` — **written, but NOT yet verified against a live Supabase project** (no credentials exist in this dev environment). Its file header flags a specific open question: Supabase's raw-HTTP upload contract for a signed-upload token isn't fully documented publicly, and the officially supported path is their JS SDK's `uploadToSignedUrl()` — the current generic XHR-PUT client code (`src/lib/upload-client.ts`) may need a Supabase-specific branch. **Must be exercised end-to-end against a real bucket before Phase 14 launch.** |
| Transcription | `TranscriptionProvider` (`src/lib/providers/transcription/types.ts`) | `fake.ts` — deterministic canned synthetic transcripts | Not written yet — vendor not chosen. See the AssemblyAI/Deepgram comparison in `docs/cost-model.md`; owner asked for a recommendation with current pricing rather than a pre-made choice. |
| AI story analysis | `StoryAnalysisProvider` (`src/lib/providers/analysis/types.ts`) | `fake.ts` — keyword-based themes, first-two-sentences summary, transcript-sourced quotes | Not written yet — vendor not chosen. See the Claude API pricing note in `docs/cost-model.md`. |
| Admin auth | N/A — hand-rolled | bcrypt + JWT session, fully implemented | No change needed for launch — see `docs/decision-log.md` DL-007 |

Writing the transcription and AI-analysis adapters (once a vendor is picked) and provisioning real Vercel/Supabase infrastructure are Phase 14 (owner-authorized production work) — not something to do speculatively without credentials or budget approval. The storage adapter is written but unverified; it should be smoke-tested against a real bucket as close to the start of Phase 14 as possible, since it's the one piece of "production" code that's existed the longest without ever running against a live target.

## Environment variables

See `.env.example` for the authoritative, commented list. Summary:

| Variable | Purpose | Required for local dev | Required for production |
|---|---|---|---|
| `DATABASE_URL` | Postgres connection string | Yes (local default provided) | Yes (real managed Postgres) |
| `SESSION_SECRET` | Signs admin session JWTs | Yes | Yes — must be a real random secret, rotated if ever suspected leaked |
| `STORAGE_DRIVER` | `local` for dev, `supabase` for production | Yes (`local`) | `supabase` — see verification caveat above |
| `STORAGE_LOCAL_DIR` | Local filesystem path for dev media | Yes | N/A in production |
| `STORAGE_SIGNING_SECRET` | Signs media read/write tokens (local adapter only) | Yes | N/A when `STORAGE_DRIVER=supabase` (Supabase signs its own URLs) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET` | Supabase Storage adapter credentials | No | Yes, once `STORAGE_DRIVER=supabase` |
| `TRANSCRIPTION_PROVIDER` | `fake` (only option today) | Yes (`fake`) | Needs a real provider once written/chosen |
| `AI_ANALYSIS_PROVIDER` | `fake` (only option today) | Yes (`fake`) | Needs a real provider once written/chosen |
| `CRON_SECRET` | Authenticates the job-processing endpoint | Yes | Yes — must be a real random secret |
| `APP_BASE_URL` | Base URL used in generated links | Yes | Yes — the real production domain |

## Vendor recommendation — transcription and AI story analysis

Researched with current (August 2026) published pricing, per the owner's request for a recommendation rather than a pre-made choice. See `docs/cost-model.md` for the full cost-category writeup; this section is the specific vendor pick.

**Transcription: AssemblyAI (Universal-2, pre-recorded) or Deepgram (Nova-3)** — both are inexpensive at this project's scale. AssemblyAI's pre-recorded Universal-2 tier is $0.15/hour of audio; Deepgram's Nova-3 pre-recorded tier is in the same range (roughly $0.0048-0.0077/minute, i.e. ~$0.29-$0.46/hour depending on options). At a pilot volume of, say, 100 submissions averaging 3 minutes each (5 hours of audio total), that's under $1-2 total for the entire pilot — cost is not the deciding factor between these two; either is a reasonable default. **Recommendation: AssemblyAI**, slightly simpler pricing tiers and a straightforward REST API; Deepgram is an equally fine alternative if there's an existing preference.

**AI story analysis: Anthropic's Claude API (Haiku model for cost, Sonnet if quality needs are higher)** — this is a natural fit since the whole build already runs on Claude, and Claude Haiku's current published pricing is $1/million input tokens and $5/million output tokens (Sonnet is $2/$10, an introductory rate through August 31, 2026, standard $3/$15 after). A typical submission's transcript (a few hundred to ~2,000 words) plus a themes/summary/quotes generation prompt is roughly 2,000 input + 500 output tokens — well under a cent per submission on Haiku, a bit under two cents on Sonnet. For 100 pilot submissions, total AI-analysis cost is under $1-2 regardless of which model is chosen. **Recommendation: start with Haiku** given the task (extracting themes/summary/quotes from a transcript) doesn't obviously need Sonnet-level reasoning; this is trivially cheap to upgrade later (one env var) if analysis quality disappoints during the pilot.

**Bottom line:** at this project's actual expected pilot volume, transcription + AI analysis together are likely to cost single-digit dollars total, not a meaningful line item next to hosting/storage. This should be re-confirmed with real usage data after the Phase 15 pilot, and this comparison should be refreshed with current pricing before Phase 14 if meaningful time has passed, since API pricing changes.

## Database migrations

**Switched to versioned migrations (DL-011).** `npm run db:generate` (`drizzle-kit generate`) diffs `src/db/schema.ts` against the migration history and writes a new reviewable SQL file under `drizzle/`; `npm run db:migrate` (`drizzle-kit migrate`) applies any not-yet-applied migration files to the target `DATABASE_URL`, tracked in a Drizzle-managed migrations table so it's safe to run repeatedly and consistently across environments (local → staging → production). The initial migration (`drizzle/0000_zippy_cargill.sql`, all 18 tables) is committed and verified — applying it to a fresh empty database and then running `npm run db:seed` against the result works cleanly (checked manually against local Postgres). CI's `e2e` job now runs `npm run db:migrate` instead of `db:push` to set up its database, so every migration file is exercised on every push/PR before it can reach `main`.

`npm run db:push` (`drizzle-kit push`, schema-first, no migration file history) still exists and remains useful for fast local iteration — it's unaffected and nothing about local dev workflow requires switching. **The rule going forward:** any schema change in `src/db/schema.ts` destined for a real deployed environment (staging or production) must go through `npm run db:generate` (review the generated SQL, commit it) before `npm run db:migrate` is run against that environment — `db:push` should never touch production, mirroring the same reasoning as `src/db/seed.ts`'s `assertNotProduction()` guard, just not (yet) enforced in code the same way.

## Rollback

No production deployment exists yet, so no rollback has ever been exercised. Once Phase 14 stands up a real environment, the expected approach is: the hosting platform's built-in deployment rollback (e.g. Vercel's instant rollback to a prior build) for application code, and — now that migrations are versioned (see above) — `npm run db:generate` gives a reviewable diff before any schema change ships, with a `pg_dump` snapshot immediately before applying it in production as the safety net of last resort (Drizzle's migration history doesn't include an automatic "undo," so a bad migration is rolled back via restore, not a generated down-migration).

## Backups

Delegated to the managed Postgres provider's automated backup feature (e.g. Supabase's point-in-time recovery) once one is provisioned — no custom backup tooling exists in this codebase. Object storage backup/versioning similarly depends on whichever bucket provider is chosen.

## Monitoring / observability

See `docs/architecture.md` for the logging approach used throughout development (structured `console.log`/`console.error` plus the `audit_events` table for accountability-relevant actions). No external error-tracking or uptime-monitoring service (e.g. Sentry, a status page) is wired in yet — recommended as part of Phase 13/14 launch prep, listed in `docs/production-launch-checklist.md`.

## First-admin creation

There is no signup flow for admin accounts by design (see `docs/security.md` — single trusted role, hand-rolled auth). `src/db/seed.ts` creates a dev-only admin (`brian@campcoleman.org` / a hardcoded dev password) — **this must never run against a production database** (enforced by its `assertNotProduction()` guard).

The real first-admin account is created with a separate, non-destructive script instead: `src/scripts/create-admin.ts` (`npm run admin:create`). It performs a single targeted insert/update on `admin_users` — never a truncate — generates and prints a strong random password once (or accepts one via `ADMIN_PASSWORD`), and is safe to re-run against an existing email (it updates that row rather than erroring or duplicating). Verified end-to-end against local Postgres. Once a production database exists:

```
ADMIN_EMAIL="josh.hirsch@gmail.com" ADMIN_NAME="Josh Hirsch" npm run admin:create
```

See `docs/production-launch-checklist.md` Section 2, item 5 for the full procedure and rationale.
