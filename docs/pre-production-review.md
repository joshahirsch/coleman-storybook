# Pre-Production Security/Privacy Review (Phase 12)

A review of the actual built code (not a generic checklist) performed before the Phase 13 deployment-prep phase, per the project's "no phase is complete with unmet material acceptance criteria" rule. Findings are classified P0 (must fix before any real contributor/admin uses the system) through P3 (worth doing, not blocking). All P0 findings below were fixed as part of this review, in the same session, before Phase 13 began.

## P0 — Fixed

### P0-1: `npm run db:seed` had no safeguard against running against a production database

**Finding:** `src/db/seed.ts` runs `TRUNCATE TABLE ... RESTART IDENTITY CASCADE` across every application table (organizations, campaigns, contributors, submissions, media assets, consent records, everything) as its first action, with no check on which database `DATABASE_URL` pointed at. If this script were ever run — by accident, by a copy-pasted command, by a CI job misconfigured to point at the wrong environment — against a real Camp Coleman production database, it would destroy every real contributor's story, consent record, and admin account irreversibly, with no confirmation prompt.

**Fix:** Added `assertNotProduction()`, called at the start of `resetDatabase()`. It throws immediately if `NODE_ENV === "production"` unless `ALLOW_SEED_IN_PRODUCTION=true` is also explicitly set — an intentional, hard-to-fat-finger opt-in rather than a silent default. See `src/db/seed.ts`.

**Verification:** Confirmed the seed script still runs normally in local dev (`NODE_ENV` unset/`development`); code-reviewed the guard logic; this is exactly the kind of check that's cheap to write and expensive to have skipped.

## P1 — None found

No findings met the P1 bar (serious, but not "this could destroy production data") in this review pass.

## P2 — Carried forward, not blocking

### P2-1: In-memory, single-process rate limiting

Already documented as a known, deliberate V1 tradeoff in `docs/security.md` and `docs/decision-log.md`. Resets on deploy/restart, doesn't coordinate across instances. Acceptable for V1's expected low-volume, invitation-based traffic; flagged again here so it's visible from the review document too, not just buried in code comments. Upgrade path: a shared store (e.g. Upstash Redis), a contained change limited to `src/lib/rate-limit.ts`.

### P2-2: Only local/fake provider implementations exist for storage, transcription, and AI analysis

Not a code defect — the interfaces are correctly designed to make this a contained addition — but it means Phase 14 cannot simply "set environment variables and deploy." Real adapters must be written first. Fully detailed in `docs/deployment.md` "Provider abstraction status." Repeating it here because a security/privacy review should flag that **no real vendor has been evaluated for its own data-handling/privacy practices yet** — choosing a transcription or AI vendor is itself a privacy-relevant decision (whose servers process contributor recordings, under what data-processing agreement) and should be evaluated as such when the time comes, not chosen purely on price/quality.

### P2-3: Consent language and privacy practices have not been reviewed by counsel

Tracked in detail in `docs/legal-review-required.md` and `docs/privacy-and-consent.md`. Restated here because it was, until the owner's DL-010 decision, the single largest open item standing between this system and real contributor use — everything else in this review is a code-level concern, this one was never resolvable by engineering at all. The owner has since explicitly decided to proceed with the MVP pilot without waiting for this review (DL-010) — noted here for completeness, not because the underlying gap (no counsel review yet) has actually closed.

## P3 — Minor, worth doing eventually

### P3-1: `src/lib/hash.ts` previously fell back to a fixed default salt if `SESSION_SECRET` was unset

**Finding:** `hashIp()` used `process.env.SESSION_SECRET ?? "unsalted-dev-only"` — if `SESSION_SECRET` were ever unset in an environment where `hashIp` is reachable but `createAdminSession`'s own stricter check hadn't already caused a hard failure elsewhere, IP hashes would silently use a fixed, publicly-known salt (from this very document/the source code), making the "hash" reversible via a rainbow table over the IP address space and defeating its purpose.

**Fix:** Changed to throw the same way `getSecretKey()` in `src/lib/auth/session.ts` already does (missing or under-16-char secret → hard failure) rather than silently degrading. See `src/lib/hash.ts`. Fixed in this review pass since it was a one-line, low-risk change; verified via the full test suite (28/28 unit, 15/15 E2E) passing unchanged afterward.

### P3-2: No automated dependency vulnerability scanning in CI — fixed

**Original finding:** There was no CI pipeline defined in this repository at all (no `.github/workflows/`), so this was really "no CI exists yet" rather than "CI exists but skips a scan step." `npm audit` had to be run manually before each deploy.

**Fix:** Added `.github/workflows/ci.yml` (two jobs: `checks` — typecheck, lint, unit tests, `npm audit --audit-level=high` — and `e2e` — Playwright against a real Postgres service container), running on every push/PR to `main`. The audit step gates on high/critical only; the 4 pre-existing moderate `esbuild`/`drizzle-kit` findings (see the project's `npm audit` output) are a known, deliberately-not-fixed dev-dependency issue (the only fix is a breaking `drizzle-kit` downgrade) and shouldn't fail every build — but a *new* high/critical finding now will, instead of going unnoticed until someone thinks to run `npm audit` by hand. See `docs/testing.md` for what each CI job actually runs.

### P3-3: `objectPath()`'s path-traversal comment is more reassuring than precise — fixed

**Original finding:** `src/lib/storage/local-adapter.ts`'s `objectPath()` had a comment stating "key is always generated by buildKey() — never taken verbatim from a client request." In fact `/api/uploads/put` and `/api/media/read` both read `key` directly from a client-supplied query parameter. This was not exploitable — the HMAC-signed token embeds and verifies the exact key server-side (see `src/lib/storage/signing.ts`), so an attacker cannot substitute an arbitrary path without a valid signature they cannot forge — but the comment overstated what actually prevents path traversal, which is signature verification, not "we never take it from the client." A future edit that trusted this comment at face value and, say, added an unsigned convenience endpoint using the same `objectPath()` helper could have reintroduced real traversal risk.

**Fix:** Rewrote the comment to state what actually enforces safety (HMAC signature binding via `src/lib/storage/signing.ts`) rather than a false claim about key origin, and to explicitly flag the risk for a future edit that reuses this helper without going through the signed-token routes. No behavior change — the underlying security property (signature verification) already held.

## What this review did not cover

- No third-party penetration test was performed (would require a live, deployed environment, which does not exist yet).
- No load/DoS testing beyond the application-level rate limiting already described.
- No review of a specific cloud provider's configuration (Supabase/S3/R2/Vercel), since none is provisioned yet — this should be repeated once Phase 14 infrastructure exists, against the real configuration.

## Sign-off

All P0 findings are fixed and verified (typecheck, lint, unit tests, and the full E2E suite all pass after the fixes). No P1 findings exist. P2/P3 items are carried forward into `docs/production-launch-checklist.md` and `docs/future-roadmap.md` as appropriate, not silently dropped. This satisfies the Phase 12 acceptance bar to proceed to Phase 13.
