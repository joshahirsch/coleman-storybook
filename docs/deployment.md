# Deployment

**Status: no environment beyond local development currently exists.** This document describes the target topology and the concrete steps to get there. It is written so that Phase 13/14 (see `docs/phase-status.md`) has an accurate, actionable starting point — not a description of something already running.

## Target topology (V1)

- **Application:** Next.js 16 (App Router), deployed to a platform with first-class Next.js support (Vercel is the reference target given the `webServer`/Server Actions/edge-`proxy.ts` patterns used throughout; any Node.js-compatible host that supports Next.js's standard build output would also work).
- **Database:** Managed PostgreSQL 16+ (Supabase Postgres is the reference target per the spec's stack preference; any standard Postgres works since the app uses `drizzle-orm/postgres-js` over a plain connection string, not a Supabase-specific client).
- **Object storage:** Private, non-public bucket for recorded media (Supabase Storage, S3, or R2 — see "Storage adapter gap" below).
- **Scheduled job runner:** something that periodically calls `POST /api/jobs/process` with the `x-cron-secret` header (Vercel Cron is the reference target; any scheduler that can make an authenticated HTTPS POST works).
- **Transcription / AI analysis vendors:** none selected yet — see "Provider gap" below and `docs/cost-model.md`.

## Provider abstraction status — what's actually implemented vs. designed-for

This is the most important thing to understand before attempting a real deploy: **the provider-abstraction interfaces exist and are exercised end-to-end in tests, but only the local/fake implementations exist.** Swapping in real vendors is a contained, well-scoped engineering task (implement one interface per provider, register it in one `index.ts` switch statement) — but it is *not done yet*, and no amount of environment-variable configuration alone will make production storage, transcription, or AI analysis work.

| Provider | Interface | Local/dev implementation (exists) | Production implementation (does NOT exist yet) |
|---|---|---|---|
| Media storage | `MediaStorageAdapter` (`src/lib/storage/types.ts`) | `local-adapter.ts` — filesystem + HMAC-signed URLs | A Supabase Storage / S3 / R2 adapter — **needs to be written** |
| Transcription | `TranscriptionProvider` (`src/lib/providers/transcription/types.ts`) | `fake.ts` — deterministic canned synthetic transcripts | A real vendor integration (e.g. a speech-to-text API) — **needs to be written**, and a vendor needs to be chosen (see `docs/cost-model.md`) |
| AI story analysis | `StoryAnalysisProvider` (`src/lib/providers/analysis/types.ts`) | `fake.ts` — keyword-based themes, first-two-sentences summary, transcript-sourced quotes | A real LLM/AI integration — **needs to be written**, and a vendor needs to be chosen |
| Admin auth | N/A — hand-rolled | bcrypt + JWT session, fully implemented | No change needed for launch; a managed IdP (Supabase Auth / Google Workspace SSO) remains an optional future upgrade, not a blocker — see `docs/decision-log.md` DL-007 |

Writing these three adapters, choosing and funding the transcription/AI vendors, and provisioning real infrastructure are Phase 14 (owner-authorized production work), not something to do speculatively without credentials or budget approval — consistent with the project's "do not request credentials until actually needed" principle. They are called out here so the Phase 13 launch checklist can present them as concrete, scoped remaining work rather than a surprise.

## Environment variables

See `.env.example` for the authoritative, commented list. Summary:

| Variable | Purpose | Required for local dev | Required for production |
|---|---|---|---|
| `DATABASE_URL` | Postgres connection string | Yes (local default provided) | Yes (real managed Postgres) |
| `SESSION_SECRET` | Signs admin session JWTs | Yes | Yes — must be a real random secret, rotated if ever suspected leaked |
| `STORAGE_DRIVER` | `local` (only option today) | Yes (`local`) | Needs a new adapter + driver value once written |
| `STORAGE_LOCAL_DIR` | Local filesystem path for dev media | Yes | N/A in production |
| `STORAGE_SIGNING_SECRET` | Signs media read/write tokens | Yes | Yes |
| `TRANSCRIPTION_PROVIDER` | `fake` (only option today) | Yes (`fake`) | Needs a real provider once written/chosen |
| `AI_ANALYSIS_PROVIDER` | `fake` (only option today) | Yes (`fake`) | Needs a real provider once written/chosen |
| `CRON_SECRET` | Authenticates the job-processing endpoint | Yes | Yes — must be a real random secret |
| `APP_BASE_URL` | Base URL used in generated links | Yes | Yes — the real production domain |

## Database migrations

`npm run db:push` (`drizzle-kit push`) applies `src/db/schema.ts` directly to the target `DATABASE_URL`. This is the "push" workflow (schema-first, no migration file history) rather than `drizzle-kit generate` + `drizzle-kit migrate` (versioned migration files). Push is appropriate for the current single-environment development stage; **before a production database exists, this should be reconsidered** — a real production deployment should use versioned migration files (`drizzle-kit generate`) so schema changes are reviewable, reversible, and repeatable across environments (local → staging → production) rather than applied ad hoc. This switch is cheap to make (Drizzle supports both workflows from the same schema file) and is called out explicitly in `docs/production-launch-checklist.md`.

## Rollback

No production deployment exists yet, so no rollback has ever been exercised. Once Phase 14 stands up a real environment, the expected approach is: the hosting platform's built-in deployment rollback (e.g. Vercel's instant rollback to a prior build) for application code, and — because Drizzle push is not currently versioned — a captured `pg_dump` snapshot immediately before any schema change in production, until migrations are switched to the versioned workflow described above.

## Backups

Delegated to the managed Postgres provider's automated backup feature (e.g. Supabase's point-in-time recovery) once one is provisioned — no custom backup tooling exists in this codebase. Object storage backup/versioning similarly depends on whichever bucket provider is chosen.

## Monitoring / observability

See `docs/architecture.md` for the logging approach used throughout development (structured `console.log`/`console.error` plus the `audit_events` table for accountability-relevant actions). No external error-tracking or uptime-monitoring service (e.g. Sentry, a status page) is wired in yet — recommended as part of Phase 13/14 launch prep, listed in `docs/production-launch-checklist.md`.

## First-admin creation

There is no signup flow for admin accounts by design (see `docs/security.md` — single trusted role, hand-rolled auth). `src/db/seed.ts` creates a dev-only admin (`brian@campcoleman.org` / a hardcoded dev password) — **this must never run against a production database.** The real first-admin creation procedure for production is one of the concrete open items tracked in `docs/production-launch-checklist.md`.
