# Phase 14 Provisioning Runbook

A step-by-step walkthrough for the owner to actually stand up production, once ready. `docs/production-launch-checklist.md` is the reference checklist (what needs to be true); this document is the ordered set of actions to get there. Nothing in this runbook has been executed — it requires real Vercel/Supabase accounts and credentials that don't exist in the engineering environment, so every step below is written but unverified against a live account. Vercel's and Supabase's own dashboards are the source of truth if a specific button/label below doesn't match what's on screen — both products iterate their UI; the underlying steps (create project, set env vars, create a bucket) are stable even when the exact click path shifts.

**Do this from a machine where you're logged into (or ready to create) accounts for Vercel and Supabase** — this is owner action, not something Claude can do without those credentials.

---

## Step 1 — Supabase project (database + storage)

1. Create a new Supabase project (or use an existing org/project if you already have one you want to use). Note the **database password** you set — Supabase only shows it once.
2. Once the project is provisioned, go to **Project Settings → Database** and copy the connection string (the "connection pooling" URI is usually the right one for a serverless host like Vercel — Supabase's own docs will confirm which variant to use for your plan). This becomes `DATABASE_URL`. Confirm it requires TLS (Supabase's managed connection strings do by default).
3. Go to **Storage** and create a new bucket (suggested name: `coleman-storybook-media`, matching `.env.example`'s default — or pick your own and use that value consistently below). **Confirm the bucket is private** (no public read) — this is the default for a new bucket, but verify it explicitly; a public bucket would defeat the signed-URL access control this app relies on (see `docs/security.md`).
4. Go to **Project Settings → API** and copy the **Project URL** (`SUPABASE_URL`) and the **`service_role` key** (`SUPABASE_SERVICE_ROLE_KEY` — NOT the `anon` key; the service role key is required for server-side signed-upload/signed-read generation and must never be exposed to the browser). Treat this key as a real secret from the moment you copy it.

## Step 2 — Generate fresh secrets

Run these locally (or in any shell) and save the output somewhere safe (password manager, not a text file that gets committed):

```
openssl rand -base64 32   # -> SESSION_SECRET
openssl rand -base64 32   # -> CRON_SECRET (not actually used while TRANSCRIPTION_PROVIDER=none — Vercel Cron is skipped, see production-launch-checklist.md Section 4 — but set a real value anyway rather than leaving it unset, in case something is added later that expects it)
```

Do not reuse any value from `.env.local` — those are dev-only and (per `.gitignore`) never meant to be real secrets, but production still deserves genuinely fresh ones on principle.

## Step 3 — Vercel project

1. Import `https://github.com/joshahirsch/coleman-storybook` as a new Vercel project (Vercel's GitHub integration — connect your GitHub account if you haven't, then pick this repo). Vercel auto-detects Next.js; no custom build command should be needed.
2. Before the first deploy (or immediately after, then redeploy), go to **Project Settings → Environment Variables** and set every variable from `docs/production-launch-checklist.md` Section 3, using the real values from Steps 1–2 above:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | From Step 1.2 |
   | `SESSION_SECRET` | From Step 2 |
   | `STORAGE_DRIVER` | `supabase` |
   | `SUPABASE_URL` | From Step 1.4 |
   | `SUPABASE_SERVICE_ROLE_KEY` | From Step 1.4 |
   | `SUPABASE_STORAGE_BUCKET` | Bucket name from Step 1.3 |
   | `TRANSCRIPTION_PROVIDER` | `none` |
   | `AI_ANALYSIS_PROVIDER` | `fake` (unreachable while `TRANSCRIPTION_PROVIDER=none` — see DL-009) |
   | `CRON_SECRET` | From Step 2 |
   | `APP_BASE_URL` | The Vercel-assigned production URL (you may not know this until after the first deploy — set it once, then update and redeploy if it doesn't match) |
   | `NODE_ENV` | `production` (Vercel sets this automatically for production deploys — confirm it's actually `production` and not left as `development`, since this also gates `src/db/seed.ts`'s safety check) |

3. Deploy. Confirm the build succeeds (this was verified locally with `npm run build` — see `docs/production-launch-checklist.md` Section 1 — so a failure at this stage most likely means an env var is missing/wrong, not a code problem).

## Step 4 — Create the database schema

From a machine with `DATABASE_URL` pointed at the real production database (e.g. export it locally, or run this as a one-off Vercel/CI job — whatever's easiest for you):

```
DATABASE_URL="<production connection string>" npm run db:migrate
```

This applies the committed migration (`drizzle/0000_zippy_cargill.sql`) — **not** `db:push`, which should never touch production (see `docs/decision-log.md` DL-011). Confirm all 18 tables exist afterward (any Postgres client, or Supabase's own Table Editor).

## Step 5 — Create the real admin account

```
DATABASE_URL="<production connection string>" ADMIN_EMAIL="josh.hirsch@gmail.com" ADMIN_NAME="Josh Hirsch" npm run admin:create
```

Copy the printed password into a password manager immediately — it's shown once and never stored in plaintext (see `docs/production-launch-checklist.md` Section 2, item 5).

## Step 6 — Create the organization + campaign data

Nothing in Steps 1–5 creates an `organizations`/`campaigns` row — `db:seed` (which does that) is dev-only and destructive, and deliberately refuses to run against `NODE_ENV=production` (see `assertNotProduction()` in `src/db/seed.ts`). This gap (a fully-migrated, fully-configured production database that still 404s on every campaign URL, because no organization or campaign exists to serve) was found while writing this runbook and closed the same session — see `docs/decision-log.md` DL-012.

```
DATABASE_URL="<production connection string>" npm run content:bootstrap
```

Non-destructive, idempotent (safe to re-run — skips anything that already exists rather than duplicating). Creates the real "URJ Camp Coleman" organization and the three already-designed campaigns (Alumni Stories, Staff Stories, Parent Stories) with their real questions — not placeholder content, the same copy `src/db/seed.ts` has used since Phase 3, just extracted out from under the destructive `TRUNCATE`. Per DL-009's small-alumni-pilot scope, only the **alumni** campaign is activated by default; staff/parents are created but left inactive. If that scope has since changed, re-run with `ACTIVATE_ALL_CAMPAIGNS=true`, or activate individual campaigns directly (there's no admin UI for this yet — Phase 16, "Self-Service Campaign Management").

## Step 7 — Smoke-test the storage adapter

This is `docs/production-launch-checklist.md` Section 2, item 1 — the one item that has always required a real bucket to exist. With the bucket from Step 1.3 live:

1. Log in as the real admin (Step 5).
2. Start a test submission using a clearly-fake test identity (not a real alumnus).
3. Record and upload a short test clip; confirm it reaches `SUBMITTED` and (with `TRANSCRIPTION_PROVIDER=none`) transitions straight to `READY_FOR_REVIEW` with zero rows in `processing_jobs` for that submission.
4. In the admin dashboard, confirm the test submission's media plays back via a signed URL, and confirm the raw Supabase Storage URL is NOT directly accessible without going through the app (i.e. the bucket really is private).
5. Delete or clearly mark the test submission afterward so it doesn't linger in the real story library — see `docs/production-launch-checklist.md` Section 8 for the full smoke-test script this overlaps with.

If anything fails here, the most likely culprit is `src/lib/storage/supabase-adapter.ts`'s flagged open question — the raw-HTTP signed-upload contract — see that file's header comment and `docs/production-launch-checklist.md` Section 2, item 1 for what to check first.

## Step 8 — Go

At this point every item in `docs/production-launch-checklist.md` Section 4 should be checked off. Send the pilot invitation to the first handful of alumni (DL-009 — small, bounded pilot). Recommended: watch the `audit_events` table for the first few real submissions, since no external error-tracking/uptime monitoring is wired in yet (see `docs/production-launch-checklist.md` Section 5).
