# Security

This document describes the security posture of the system as actually built, not an aspirational target. Where a control is a known gap rather than a deliberate non-goal, it's listed under "Residual Risks" — not hidden.

## Threat model summary

| Threat | Mitigation | Where |
|---|---|---|
| Unauthenticated access to admin story library / recordings | Edge-level fail-closed auth gate on every `/admin/*` and `/api/admin/*` route, before any handler runs | `src/proxy.ts` |
| Stolen/forged admin session | Signed (HS256), time-limited (8h) JWT in an httpOnly, `secure` (prod), `sameSite=lax` cookie; `jose` verifies signature + expiry on every request | `src/lib/auth/session.ts` |
| Admin password compromise via DB leak | bcrypt hashing (never plaintext, never reversible) | `src/lib/auth/password.ts` |
| Admin login brute-forcing / account enumeration | Per-key rate limiting (10 attempts / 15 min) before any DB lookup; identical generic error ("Incorrect email or password.") whether the account exists or the password is wrong | `src/lib/actions/admin-actions.ts`, `src/lib/rate-limit.ts` |
| Public exposure of contributor media (video/audio testimonials) | No public URL ever exists for a media object. All storage is private; every read goes through a server-issued, HMAC-signed, time-limited token | `src/lib/storage/`, `src/app/api/media/read/route.ts` |
| Forged/guessed signed media URLs | HMAC-SHA256 signature over `{key, purpose, exp}`, verified with `timingSafeEqual` (constant-time comparison, not `===`), key+purpose bound into the signature so a read token can't be replayed as a write token or against a different object | `src/lib/storage/signing.ts` |
| Client claiming an upload succeeded when it didn't | `/api/uploads/confirm` re-verifies the object actually exists in storage via the adapter before marking anything durable — a client can never talk the server into a false "confirmed" state | `src/app/api/uploads/confirm/route.ts` |
| Cross-submission spoofing (uploading into someone else's answer slot) | Every upload-init/confirm call is validated against the actual `submission_answer_id` ownership chain server-side | `src/app/api/uploads/*`, covered by `e2e/negative-paths.spec.ts` |
| CSRF on state-changing requests | Next.js Server Actions verify the request's `Origin`/`Host` automatically (framework-level, not custom code) | Next.js 16 built-in |
| Unauthenticated triggering of the AI/transcription processing pipeline (cost/abuse) | `x-cron-secret` header required and checked before `/api/jobs/process` does anything | `src/app/api/jobs/process/route.ts` |
| IP address retention beyond what's needed | Never store a raw IP; only a salted SHA-256 hash, sufficient for abuse pattern investigation without retaining directly identifying network data | `src/lib/hash.ts` |
| Accidental presentation of fake/dev data as real | Every synthetic entity is explicitly flagged in the DB (`contributors.is_synthetic`, `provider: "fake-local"` on transcripts/analyses) and rendered with a visible "SYNTHETIC" badge in the admin UI — never silently indistinguishable from a real testimonial | `src/db/seed.ts`, admin UI components |
| Injection (SQL) | Drizzle ORM's query builder parameterizes all values; the one raw `sql` usage for full-text search (`plainto_tsquery`) and theme-array containment (`= ANY(...)`) uses Drizzle's tagged-template `sql` helper, which parameterizes interpolated values rather than string-concatenating them | `src/lib/data/admin.ts` |
| XSS via contributor-submitted text (names, notes) | React's default JSX escaping renders all contributor/admin text as text, not HTML; no `dangerouslySetInnerHTML` anywhere in the codebase | throughout |

## Authentication and authorization

- **Admin surface only.** There is no contributor-facing login — contributors are identified by name/relationship at submission time (not authenticated accounts), consistent with the spec's "no contributor account system" scope. Anyone with a campaign link can start a submission; nothing about starting one exposes any other contributor's data.
- **Fail-closed by design.** `src/proxy.ts` runs at the edge, before any page or API route handler executes, and defaults to redirect/deny unless a valid session is present. Route handlers and Server Actions additionally call `requireAdminSession()` themselves (`src/lib/auth/session.ts`) — this is intentional defense in depth, not redundancy to be "cleaned up": an edge-gate bug should not be the only thing standing between a request and admin data.
- **Single role in V1.** There is one admin role; no reviewer/super-admin/read-only tiers. This matches the spec's "simple admin role in V1, no complex RBAC" scope (see `docs/future-roadmap.md`).

## Data protection

- **Encryption in transit:** enforced by the hosting platform's TLS termination in production (see `docs/deployment.md`); local dev is plain HTTP by necessity.
- **Encryption at rest:** delegated to the managed Postgres and object-storage providers chosen at deployment time (e.g. Supabase's disk-level encryption) — this application does not implement its own at-rest encryption layer.
- **Secrets:** loaded from environment variables only (`.env.local` locally, the hosting platform's secret store in production). `.gitignore` excludes all `.env*` files except `.env.example`, which contains no real values. No secret is ever logged, and `docs/deployment.md` documents secret rotation.
- **Least-privilege media access:** signed URLs are scoped to one object key, one purpose (read or write), and a short expiry (600s for admin playback, similarly short for direct-upload write targets) — not a long-lived or account-wide credential.

## Residual risks (known V1 limitations, not hidden)

- **In-memory, single-process rate limiting** (`src/lib/rate-limit.ts`). Resets on every deploy/restart and does not coordinate across multiple server instances. Acceptable for V1 given expected personal-invitation-based traffic (not public ad-driven volume), documented as a contained, single-file upgrade to a shared store (e.g. Upstash Redis) if abuse is observed during the Phase 15 pilot.
- **No MFA, password reset, or session revocation list for admin accounts.** A stolen JWT is valid until its 8-hour natural expiry; there is no way to force-invalidate a specific session early. First-admin credentials must be rotated out of band if ever suspected compromised (kill the session secret to invalidate all sessions at once, as a blunt instrument). See `docs/decision-log.md` DL-007.
- **No Web Application Firewall / DDoS layer is implemented by this codebase** — relies on whatever the hosting platform provides (e.g. Vercel's edge network).
- **No automated dependency vulnerability scanning is wired into CI yet** — `npm audit` should be run manually before each deploy until this is automated (tracked in `docs/production-launch-checklist.md`).
- **Consent language has not been reviewed by counsel.** This is a legal/product risk, not a security one per se, but is flagged here because it affects what "authorized use" of contributor media actually means — see `docs/legal-review-required.md` and `docs/privacy-and-consent.md`.

## Reporting

There is no live production deployment yet (see `docs/deployment.md` and the Phase 13 launch checklist), so there is no public security-reporting channel to publish. This should be added before Phase 14 production provisioning.
