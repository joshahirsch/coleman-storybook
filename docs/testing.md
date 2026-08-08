# Testing

## Philosophy

Tests exist to catch real defects before they reach a real contributor or admin, not to hit a coverage number. Two examples from this build justify the investment: the E2E suite caught a genuine stale-React-closure bug that would have left every contributor stuck forever on the "Uploading your story…" screen after a fully successful upload (see `docs/decision-log.md`-adjacent commit history / "Phase 6" commit message), and the automated accessibility scan caught a real WCAG AA color-contrast failure in the admin UI. Neither would have been caught by `tsc --noEmit` or a linter. "It builds" is not "it works."

## Test layers

### Unit tests (Vitest)

Run with `npm run test` (or `npm run test:watch`). Config: `vitest.config.mts`. Scope: `src/**/*.test.ts` — pure logic with no browser and no live database, fast enough to run on every save.

Current coverage (34 tests across 6 files):

- `src/lib/submission-state.test.ts` — every legal and illegal processing-state transition, and the separate editorial-state transition rules; asserts `InvalidSubmissionTransitionError` is thrown for illegal transitions rather than silently allowed.
- `src/lib/validation.test.ts` — Zod schema boundary cases (empty strings, oversized payloads, invalid enums) for the contributor identity, consent, and upload schemas.
- `src/lib/rate-limit.test.ts` — bucket creation, threshold enforcement, and window-expiry reset behavior of `checkRateLimit`.
- `src/lib/storage/signing.test.ts` — signed-token generation/verification, including tamper detection (mutated signature), expiry, and key/purpose binding (a read token for object A must not verify for object B or as a write token).
- `src/lib/storage/supabase-adapter.test.ts` — `buildKey()` path format/sanitization, and fail-closed behavior when Supabase env vars are missing (does not call the live Supabase API — see `docs/production-launch-checklist.md` Section 2, item 1 for the still-open live-bucket smoke test).
- `src/lib/providers/transcription/index.test.ts` — `isProcessingPipelineEnabled()` returns `true` by default and for `"fake"`, and `false` for `"none"` (DL-009).

### End-to-end tests (Playwright + Chromium)

Run with `npx playwright test --project=chromium` (or `npm run test:e2e`). Config: `playwright.config.ts`. These exercise the real Next.js dev server, a real local Postgres database, and — critically — real `getUserMedia`/`MediaRecorder` browser APIs via Chromium's fake camera/microphone device flags (`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`), so the recording pipeline is genuinely exercised end to end, not mocked out. `webServer.reuseExistingServer: true` lets the suite run against a dev server already running in this environment; in CI it would start its own.

**Database reset:** `e2e/global-setup.ts` runs `npm run db:seed` once before the whole suite. The seed script is idempotent (`TRUNCATE ... RESTART IDENTITY CASCADE`), so every run starts from the same known synthetic baseline regardless of what a previous run left behind. This was added after a real flaky-test investigation (see the "Phase 9-11" commit) traced an intermittent failure to admin-review mutations (approve/favorite) from a prior manual run leaking into the next run's fixture assumptions — a class of bug that's easy to reintroduce if this reset is ever removed or bypassed.

Current suite (15 tests, single Chromium project, `workers: 1` / `fullyParallel: false` — deliberately serial since tests share one dev server and one database):

- `e2e/contributor-happy-path.spec.ts` — a full campaign submission from landing page through identity, consent, camera readiness, recording (real fake-device video capture), upload, and completion.
- `e2e/negative-paths.spec.ts` — disabled campaigns can't be started; unknown campaign slugs 404 (not a raw error page); camera/mic permission denial shows recovery guidance instead of crashing; unauthenticated admin access is redirected rather than shown data; a submission answer can't be spoofed into another submission's upload-init call; a private media object can't be read without a valid signed token; the job-processing endpoint rejects requests without the cron secret.
- `e2e/admin-review.spec.ts` — admin login, name search and full-text transcript search, opening a submission and verifying the consent trace and SYNTHETIC-labeled AI metadata are visible, approve + favorite persisting across a page reload, and logout actually ending the session.
- `e2e/accessibility.spec.ts` — automated `@axe-core/playwright` scans (WCAG2A/WCAG2AA tags) of five representative pages (home, campaign landing, the contributor identity step, admin login, admin dashboard), asserting zero serious/critical violations.

### What is deliberately not automated in V1

- **Cross-browser testing** (Firefox/Safari/WebKit engines) — Chromium only, since the sandbox's pre-installed browser is Chromium and downloading additional browser binaries is blocked by the network allowlist (see "Environment constraints" below). Real cross-browser QA should happen manually before Phase 14 production launch, particularly Safari on iOS given the mobile-first requirement.
- **Load/performance testing** — no load-testing tooling is wired in; V1 traffic is expected to be low-volume, invitation-based.
- **Visual regression testing** — no screenshot-diffing tool is configured.

## Environment constraints that shaped this test setup

- **Playwright's own browser download is blocked** by this sandbox's network allowlist (`403` fetching a pinned Chromium revision from Playwright's CDN). `playwright.config.ts` instead points `launchOptions.executablePath` at the sandbox's pre-installed Chromium (`/opt/pw-browsers/chromium`, overridable via `PLAYWRIGHT_CHROMIUM_PATH`). A CI environment with unrestricted network access can either keep this override (fastest, no download) or remove it and let Playwright manage its own browser binary.
- **Real camera/mic hardware doesn't exist in this sandbox**, so tests rely on Chromium's built-in fake-device flags rather than a real webcam — these produce genuine synthetic video/audio frames that flow through the real `MediaRecorder` API, so the app's handling of that data is still tested for real; only the *source* of the frames is synthetic.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request to `main` (GitHub Actions, so unlike this sandbox it has normal network access — no download restrictions apply there). Two jobs:

- **`checks`** — `npm run typecheck`, `npm run lint`, `npm run test` (unit tests, no database needed), then `npm audit --audit-level=high`. The audit step gates on high/critical only; the known moderate `esbuild`/`drizzle-kit` dev-dependency findings (see `docs/pre-production-review.md` P3-2) don't fail the build, but a new high/critical finding will.
- **`e2e`** — spins up a real `postgres:16` service container, installs a Playwright-managed Chromium (`npx playwright install --with-deps chromium` — this sandbox's pre-installed-browser workaround in `playwright.config.ts` only applies when that sandbox path actually exists, so it's a no-op on a normal runner), writes a throwaway `.env.local` from the job's own non-secret env values (needed because `npm run db:seed` — called by `e2e/global-setup.ts` — is hardcoded to `tsx --env-file=.env.local` for local-dev convenience, and `.env.local` is gitignored so it doesn't exist in a fresh checkout), runs `npm run db:push` against the fresh database, then `npm run test:e2e`. The Playwright HTML report uploads as a build artifact on failure (or success) for debugging.

No production secrets are used anywhere in CI — every value in the workflow's `env:` block is a throwaway, clearly-labeled placeholder scoped to the ephemeral CI database and local-disk storage.

## Running the full verification battery before a commit

```
npm run typecheck   # tsc --noEmit
npm run lint         # eslint
npm run test         # vitest — unit tests
npx playwright test --project=chromium   # E2E (auto-reseeds the DB first)
```

All four are expected to pass cleanly before any commit that touches application code. After a full E2E run, `npm run db:seed` can be run once more to leave the local database in the same clean synthetic-baseline state as a fresh checkout, if a demo or handoff is imminent (the E2E suite's own `global-setup.ts` already does this at the *start* of the next run, but leaving it clean afterward too avoids surprising anyone who queries the DB directly between runs).

## Synthetic test data

All fixtures are explicitly synthetic and explicitly labeled as such — never presented as if real. See `src/db/seed.ts` for the canonical set (Sarah Cohen, David Miller, Rachel Stein, Jordan Weiss, plus Playwright-generated fixtures created live during E2E runs). `contributors.is_synthetic`, `transcripts.provider = "fake-local"`, and `story_analyses.provider = "fake-local"` are all queryable flags, and the admin UI renders a visible "SYNTHETIC" badge wherever any of this data is shown, per the project's explicit prohibition on fabricated data ever looking real.
