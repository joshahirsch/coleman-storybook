# Decision Log (ADR-style)

Concise records of significant architectural/product choices. Each entry: Decision, Why, Alternatives, Tradeoffs, Revisit When.

---

## DL-001: Working product name stays configurable, not hard-coded

**Decision:** Use "Coleman Storybook" only as a default configuration value (organization/brand config), never hard-coded into application logic, database constraints, or non-config UI strings.

**Why:** The name is explicitly called a "working name" in the source spec and is an owner decision, not an engineering one. Hard-coding it would create rework risk and undermine the multi-org-ready architecture goal.

**Alternatives:** Hard-code now, rename later via find/replace.

**Tradeoffs:** Slightly more indirection (a config lookup instead of a literal string) for near-zero cost.

**Revisit When:** Owner confirms a final product name.

---

## DL-002: Project workspace initialized as a fresh git repository at `coleman-storybook/`

**Decision:** Treat this session's workspace as empty and scaffold a new repository named `coleman-storybook` rather than assuming any pre-existing code.

**Why:** Phase 0 inspection confirmed the workspace contained no prior project files.

**Alternatives:** None — this was a factual starting condition, not a choice.

**Tradeoffs:** N/A.

**Revisit When:** N/A.

---

## DL-003: Brand tokens treated as placeholder/configurable pending real Camp Coleman brand materials — superseded by DL-013

**Superseded 2026-08-08 — see DL-013.** This decision's own "Revisit When" condition (Coleman supplies a brand guide, logo, or explicit color confirmation) has been met; real, owner-approved brand tokens are now in use. Left below unedited as the historical record of why placeholders were the correct starting choice.

**Decision:** No specific colors, fonts, or logo files are treated as "official Camp Coleman brand" until Coleman supplies them or a stakeholder explicitly confirms values sampled from the live site.

**Why:** Automated inspection of campcoleman.org could not reliably extract computed CSS (colors/fonts); an unrelated prior deliverable in this project (the "GET A HOLD" fundraising deck) used an explicitly-labeled placeholder palette that must not be mistaken for Coleman's real brand.

**Alternatives:** Guess colors from screenshots and present them as "the brand"; reuse the GET A HOLD placeholder palette as if authoritative.

**Tradeoffs:** V1 UI will look intentionally generic/placeholder until real brand input arrives — acceptable since Phase 2 mock UI is allowed to use placeholders.

**Revisit When:** Camp Coleman supplies a brand guide, logo package, or explicit color confirmation.

---

## DL-004: Adult-only contributor eligibility by default in V1

**Decision:** V1 restricts the standard contributor submission pathway to adults; no guardian-consent workflow is built.

**Why:** Per source spec Section 20, minors require either adult-only restriction or an owner-approved guardian-consent workflow, and no such workflow requirements have been supplied. Defaulting to adult-only is the explicit fallback.

**Alternatives:** Build a guardian-consent workflow speculatively.

**Tradeoffs:** Excludes camper-age contributors from V1 (acceptable — alumni/staff/parent/volunteer audiences are the initial focus per the sample campaigns in the spec).

**Revisit When:** Owner supplies minor/guardian-consent requirements and legal sign-off.

---

## DL-005: Quick Answers recording mode implemented first; Guided Story deferred but schema-compatible

**Decision:** V1 implements Mode A (Quick Answers — one recording per question). Mode B (Guided Story — one continuous recording across prompts) is designed for in the data model but not built in V1.

**Why:** Source spec explicitly permits this sequencing if implementing both modes would jeopardize V1 reliability, provided the schema avoids migration trauma later.

**Alternatives:** Build both modes in V1; build Guided Story only.

**Tradeoffs:** Slightly less "natural conversational" feel in V1; faster, more reliable delivery of the core loop.

**Revisit When:** Phase 1 data model design (must confirm schema supports both modes without migration pain) and post-pilot (Phase 15) feedback.

---

## DL-006: Drizzle ORM instead of Prisma

**Decision:** Use `drizzle-orm` (with the `postgres` driver) instead of Prisma for all database access and schema management.

**Why:** Prisma's CLI (`prisma generate`, `prisma migrate`, `prisma db push`) requires downloading a native "schema-engine" binary from `binaries.prisma.sh` at install/build time. This sandbox's network allowlist blocks that host (`403 Forbidden`), so Prisma could not be used to develop this project at all — not a preference, a hard constraint discovered when scaffolding the DB layer. Drizzle is pure TypeScript with no native binary dependency; `drizzle-kit push` and all query code work entirely over the standard `postgres` npm driver.

**Alternatives:** Prisma (blocked, see above); a raw SQL query builder (e.g. Kysely) with hand-written migrations; the `pg` driver with no ORM at all.

**Tradeoffs:** Drizzle's migration tooling is less mature than Prisma's and its relational query API is more verbose in places (see the manual per-row loops in `src/lib/data/admin.ts`'s `getSubmissionDetailForAdmin`). Schema-as-TypeScript (`src/db/schema.ts`) is the source of truth either way, so this is a low-risk substitution. If a production environment turns out to allow `binaries.prisma.sh`, switching back is possible but not planned — Drizzle has been reliable throughout the build and there's no concrete reason to revisit.

**Revisit When:** Never, absent a specific pain point Drizzle can't solve. Not blocked on network access resuming.

---

## DL-007: Hand-rolled admin authentication (bcrypt + JWT session cookie) instead of a managed auth provider

**Decision:** Admin login uses a first-party `admin_users` table (bcrypt-hashed passwords via `bcryptjs`) and a `jose`-signed HS256 JWT stored in an httpOnly session cookie, gated at the edge in `src/proxy.ts`. No third-party auth provider (Supabase Auth, Clerk, Auth0, NextAuth/Auth.js with an OAuth provider, Google Workspace SSO) is wired in.

**Why:** The spec's preferred stack names Supabase as an option but does not mandate Supabase Auth specifically, and no Supabase project, Google Workspace tenant, or other identity-provider credentials exist in this environment to configure real OAuth/SSO against. Building against credentials that don't exist would mean shipping untestable code. A small, self-contained admin user table with industry-standard primitives (bcrypt for password storage, signed JWT for session state, httpOnly + secure cookie flags, fail-closed edge middleware) is fully testable now and is a well-understood, defensible pattern for a single-role admin surface with a handful of Camp Coleman staff users — this is not a case that needs enterprise SSO (see `docs/future-roadmap.md`).

**Alternatives:** Supabase Auth (needs a real Supabase project + env credentials this environment doesn't have); NextAuth/Auth.js (adds a dependency and still needs a real OAuth provider or its own credentials store to be meaningfully different from what was built); a shared static password (rejected — no per-admin accountability, fails the audit-log requirement that events be attributable to a specific admin user).

**Tradeoffs:** No password-reset flow, no MFA, no SSO, no session revocation list (a stolen/leaked JWT is valid until its 8-hour expiry) — all reasonable V1 gaps for a small internal admin surface but real limitations. In-memory rate limiting on the login action (see `docs/security.md` residual risks) is also a consequence of not having a managed provider's built-in throttling. If Camp Coleman later wants staff to log in with their existing Google Workspace accounts, or the admin user count grows past a handful of trusted staff, this should be revisited.

**Revisit When:** A real Supabase/Google Workspace/other IdP credential set becomes available and is explicitly authorized for use, or before onboarding a second organization with its own admin staff (multi-org admin identity is out of scope for this decision).

---

## DL-008: Owner-approved production infrastructure — Vercel + Supabase (Postgres + Storage), default subdomain for the pilot

**Decision:** Production hosting is Vercel, the database is Supabase Postgres, and media storage is Supabase Storage (not Cloudflare R2 or S3). The Phase 15 pilot launches on the hosting platform's default subdomain rather than a dedicated Camp Coleman domain.

**Why:** Owner-approved during the Phase 13/14 hand-off conversation. Single-vendor simplicity (Postgres + Storage on the same Supabase project) was chosen over the lower-egress-cost Cloudflare R2 alternative; at this project's actual scale (`docs/cost-model.md` — a single-camp pilot, likely dozens to low hundreds of short recordings) the egress-cost difference between Supabase Storage and R2 is not material, so simplicity won over marginal cost optimization. A dedicated production domain was deliberately deferred — not needed for a bounded pilot and easy to add later without any code change (`APP_BASE_URL` is already the only place a domain is referenced).

**Alternatives:** Cloudflare R2 for storage (no egress fees — the better choice at larger scale, revisit if usage grows well past pilot volume); AWS S3 (more mature ecosystem, more setup overhead, no clear advantage here); a real Camp Coleman domain from day one (deferred, not rejected).

**Tradeoffs:** Supabase Storage's cached-egress pricing is worse than R2's zero-egress model, so if the admin review workflow turns out to be very re-watch-heavy at real scale, this should be revisited. Using the platform's default subdomain means the pilot URL isn't Camp Coleman-branded, which is a minor UX cost acceptable for an invitation-only pilot.

**Revisit When:** Before scaling past a single-camp pilot, or if actual Supabase Storage egress costs turn out higher than the `docs/cost-model.md` estimate once real usage data exists.

**Related, still open (not yet decided):** the specific transcription and AI-analysis vendors — the owner asked for a researched recommendation with current pricing rather than picking one now; see the vendor comparison delivered alongside this entry (search "vendor comparison" or ask for it if not readily found) and `docs/production-launch-checklist.md`. Data retention policy and legal review of the consent language were both deliberately deferred to run together — see `docs/privacy-and-consent.md` and the legal-review packet in `docs/legal-review-required.md`.

---

## DL-009: Defer paid transcription/AI vendors until after POC; run the pipeline in "none" mode for the initial pilot

**Decision:** For the initial POC (a small, alumni-only pilot), `TRANSCRIPTION_PROVIDER` is set to `"none"` in production, not `"fake"`. This fully disables the transcription/AI-analysis processing pipeline for real submissions — no processing job is ever enqueued, and the submission goes straight from `PROCESSING` to `READY_FOR_REVIEW`. Admins review the raw recording directly; no transcript or AI-derived themes/summary exist for real POC submissions.

**Why:** The owner explicitly asked to hold off on transcription/AI to keep the POC at as close to zero marginal cost as possible, and to validate the core concept (will alumni actually record stories, will admins find reviewing them valuable) before spending anywhere. Critically, this is NOT the same as simply leaving `TRANSCRIPTION_PROVIDER` on its dev default of `"fake"`: doing that in production would run the deterministic synthetic provider against real contributor recordings, generating a fabricated, unrelated canned "story" transcript next to a real alumnus's real video. Even with the existing "SYNTHETIC" badge, that's a bad experience for a real pilot — the admin review UI would show made-up text ostensibly describing what a real person said. Adding an explicit `"none"` mode (rather than reusing `"fake"`) avoids ever letting synthetic content near real submission data, and costs nothing to build since editorial review (approve/reject/favorite/notes) already works entirely independently of whether a transcript exists, by design (see `docs/data-model.md` "Dual State Machines").

**Alternatives:** Run `"fake"` in production and rely on the SYNTHETIC badge alone (rejected — confusing and low-integrity for a real pilot); build a real transcription/AI integration now (rejected — costs money and engineering time before the core concept is validated, and the owner explicitly said to hold off); leave the pipeline pointed at `"fake"` but hide the analysis panel in the admin UI for non-synthetic contributors (more code than just skipping the pipeline entirely, for the same outcome).

**Tradeoffs:** During the POC, admins lose the searchable-transcript and AI-theme-filter conveniences for real submissions (video review is manual, one story at a time) — an acceptable cost for a "handful of alumni" pilot. Full-text search and theme filtering still work correctly for any synthetic/dev fixtures, unaffected.

**Related:** the first real production admin is Josh Hirsch (josh.hirsch@gmail.com) — see `docs/production-launch-checklist.md` Section 2, item 5. The pilot scope is intentionally small (a handful of alumni contributors) with expansion only after proof-of-concept validation, not a fixed timeline.

**Revisit When:** After the POC validates the core concept and the owner decides to fund a real transcription/AI vendor (recommendation already researched — see `docs/deployment.md` "Vendor recommendation") — at that point, switch `TRANSCRIPTION_PROVIDER` back to a real provider name; no other code changes needed since existing submissions simply have no transcript until the vendor is added (nothing needs to be reprocessed retroactively unless desired).

---

## DL-010: Owner accepts the risk of launching the MVP pilot without formal legal review of consent language

**Decision:** The owner has explicitly decided to proceed with the current draft consent language (`docs/consent-legal-review-packet.md`) for the initial small, alumni-only MVP pilot, without waiting for a lawyer's sign-off first. Recording-consent jurisdiction analysis, which was riding along with the legal review, is deferred the same way.

**Why:** Owner instruction: "pass on the legal review for now. this is just an MVP version." Given the pilot's actual shape — a handful of alumni the organization already has a relationship with, invited individually, not a public open call — the owner judged the exposure acceptable to start validating the product concept now rather than wait on an external reviewer's timeline.

**What this does NOT change:** every consent mechanism already built stays exactly as-is — a real, explicit consent step is still required before any recording begins, the exact consent text and version are still stored per-submission (`consent_records`, see `docs/data-model.md`), the acceptance IP is still hashed and timestamped, and no submission can proceed without recorded consent. This decision only removes "an external lawyer has reviewed this specific language" as a precondition of launch — it does not weaken, skip, or stub out the consent flow itself.

**What is explicitly NOT resolved by this decision, and remains true:** the draft consent language and permitted-use classifications in `docs/consent-legal-review-packet.md` have still not been reviewed by counsel, and no jurisdiction-specific recording-consent law analysis has been done. Claude is not a lawyer and this project log is not legal advice — this is a record of the owner's own risk-acceptance decision, not a claim that the current consent language is legally sufficient. The packet remains ready to send to a reviewer whenever the owner wants to revisit this.

**Alternatives:** Wait for legal review before any real pilot submission (rejected by the owner — see above); have Claude assess legal sufficiency directly (not something Claude is positioned to do — see `docs/consent-legal-review-packet.md`'s own framing, which was written to be handed to an actual lawyer, not to substitute for one).

**Tradeoffs:** Real, unquantified legal risk during the pilot window — the draft consent text was written to be thorough and directionally sound, but "thorough and directionally sound" is not the same as "reviewed by counsel for this specific jurisdiction and use case." This is a deliberate, informed tradeoff the owner made explicitly, not an oversight.

**Revisit When:** Before expanding beyond the initial small alumni pilot (see DL-009's pilot-scope decision) — the same "no fixed timeline, expand after POC validation" logic that governs scope expansion should also govern when legal review actually happens. Strongly recommended before any public-facing or larger-scale launch, and before recording testimonials from anyone the organization doesn't already have a direct, trusted relationship with.

---

## DL-011: Switch database schema management from `drizzle-kit push` to versioned migrations

**Decision:** Added `npm run db:generate` (`drizzle-kit generate`) and `npm run db:migrate` (`drizzle-kit migrate`) alongside the existing `npm run db:push`. The initial migration (`drizzle/0000_zippy_cargill.sql`, all 18 tables) is generated from the current `src/db/schema.ts` and committed. CI's `e2e` job now runs `db:migrate` instead of `db:push` to set up its test database.

**Why:** This was flagged as required-before-Phase-14 work in `docs/production-launch-checklist.md` Section 2 item 4 from the Phase 12 review onward: `db:push` applies the current schema state directly with no reviewable diff and no history, which is fine for solo local iteration but not for a real deployed environment where a schema change should be a reviewable, revertible artifact (a committed SQL file), not something computed fresh against whatever the live database happens to look like at deploy time. This is pure engineering work with no dependency on production credentials, so it was done proactively rather than left for Phase 14.

**Alternatives:** Keep using `db:push` all the way through production (rejected — the exact risk this decision avoids, already documented as a known gap since the Phase 12 review); switch immediately and remove `db:push` entirely (rejected — `db:push` is still genuinely useful for fast local schema iteration during ongoing development, and removing it doesn't reduce production risk since production was never going to use it once migrations exist).

**Tradeoffs:** One extra step in the schema-change workflow going forward — a schema change destined for a real environment now needs `db:generate` (review the SQL, commit it) before `db:migrate` applies it, rather than `db:push` doing both in one step. Verified end-to-end against local Postgres: generating the initial migration, applying it to a fresh empty database, and seeding the result all worked cleanly with no manual intervention.

**Revisit When:** Not expected to be revisited — this is the intended steady-state workflow. If `db:push` is ever run against a real deployed database by mistake, that's an operator error to guard against procedurally (see `docs/production-launch-checklist.md`), not a reason to reconsider this decision.

---

## DL-012: Add `bootstrap-content.ts` — production had no path to create the real organization/campaigns

**Decision:** Added `src/scripts/bootstrap-content.ts` (`npm run content:bootstrap`), a third non-destructive, idempotent script alongside `create-admin.ts`. It creates the real "URJ Camp Coleman" organization and the three already-designed campaigns (Alumni Stories, Staff Stories, Parent Stories — with their real questions) if they don't already exist, matched by slug so it's safe to re-run. Only the "alumni" campaign is activated by default, matching DL-009's small-alumni-pilot scope; `ACTIVATE_ALL_CAMPAIGNS=true` overrides that.

**Why:** Discovered while writing `docs/phase-14-provisioning-runbook.md` — walking through what Phase 14 would actually require step by step surfaced that `src/db/seed.ts` was the *only* code anywhere that ever inserted an `organizations` or `campaigns` row, and it's dev-only, destructive, and refuses to run in production (`assertNotProduction()`). Without this fix, someone following every other step correctly — provision infra, run `db:migrate`, run `admin:create` — would still reach a fully-configured production deployment that 404s on every campaign URL, because no organization or campaign exists to serve. This is exactly the kind of gap that's cheap to fix now and expensive to discover during an actual launch attempt.

**What the campaign content is, and isn't:** the campaign titles, hero copy, and questions in this script are not new or invented content — they're the same real copy `src/db/seed.ts` has created since Phase 3 (real, usable questions like "What Coleman memory still makes you smile?", not synthetic-contributor-specific text), simply extracted out from under the destructive `TRUNCATE` so they can be created safely in production. The "friendships" campaign from `seed.ts` was deliberately left out — that one is a disabled-campaign test fixture for the Section 30 negative-path test, not real designed content.

**Alternatives:** Have the owner create the organization/campaign rows via a manual `INSERT` (rejected — error-prone for something with an obvious, testable, idempotent script alternative, and the real content already exists in `seed.ts`, so hand-copying it risks transcription errors); build a full admin UI for campaign creation now (rejected — that's explicitly Phase 16, "Self-Service Campaign Management," out of scope for getting the MVP pilot launched); activate all three campaigns by default (rejected — DL-009 explicitly scoped the initial pilot to alumni only; defaulting to a narrower activation and providing an explicit override is safer than silently expanding scope).

**Tradeoffs:** None significant — this is a straightforward extraction of already-approved content into a safe, reusable form. The one real constraint: there's still no way to *edit* campaign copy after this script creates it, short of a direct database edit — that gap is Phase 16's job, not this script's.

**Revisit When:** Phase 16 (Self-Service Campaign Management) ships an admin UI for campaign creation/editing — at that point this script becomes a convenience for initial setup rather than the only path to create a campaign, but doesn't need to be removed.

---

## DL-013: Adopt observed Camp Coleman brand tokens; supersedes DL-003's placeholder palette

**Decision:** Coleman Storybook's working brand tokens are now the navy/teal/blue palette and Montserrat/Open Sans typefaces observed on the live campcoleman.org site (navy `#003F69`, teal `#74CCD3`, blue `#0C71C3`), plus the real Camp Coleman logo the owner supplied directly. `OrganizationBrand.isPlaceholder` is `false` for these values. This work was done in a separate, parallel Cowork session focused on branding/UX while this session worked backend/infra — both are now unified into this single workstream going forward, per the owner's instruction.

**Why:** DL-003 deliberately left brand tokens as placeholder/configurable specifically until "Coleman supplies [a brand guide/logo/materials] or a stakeholder explicitly confirms values sampled from the live site" — that condition is now met: a direct browser-based visual/computed-style audit of the live site (screenshot + `getComputedStyle` inspection, not a guess) was owner-reviewed and approved the same day, and the owner separately supplied the actual logo file. See `docs/brand-audit.md` Section 7 for the full audit and provenance.

**What changed, mechanically:** `src/app/globals.css`'s CSS custom properties, `src/app/layout.tsx` (self-hosted Montserrat/Open Sans via `next/font/local` from committed `.woff2` files — no Google Fonts CDN dependency at build or runtime), the home page and campaign landing pages (real logo via `next/image`, heading font applied), and `src/components/public/contributor-flow.tsx` (heading font on step titles). `src/db/seed.ts` seeds these as the dev database's brand row; the non-destructive, idempotent `src/scripts/update-brand.ts` (`npm run brand:update`) applies the same values to an existing (e.g. production) database without touching anything else — same pattern as `create-admin.ts` and `bootstrap-content.ts`.

**Merge note:** while assimilating this into the unified workstream, one line in `src/db/seed.ts` (the synthetic consent records' `consentTextReference` value) had reverted to a stale value because the branding session's local copy of that file predated this session's DL-010 consent-text fix — a working-tree-only conflict from two sessions editing the same file, never a git history issue. Restored to the correct DL-010 value (`src/lib/consent.ts (buildConsentText) — see docs/decision-log.md DL-010`) as part of this merge; everything else in the branding session's work was taken as-is after review (typecheck, lint, unit tests, full E2E suite including the accessibility scan, and a production build all verified clean afterward).

**Alternatives:** Keep waiting for an official Camp Coleman brand guide before adopting any real values (rejected — DL-003's own stated revisit condition, "explicit color confirmation," is satisfied, and waiting indefinitely for a document that may never arrive isn't better than owner-approved observed values that are clearly documented as such).

**Tradeoffs:** Still not a formal Camp Coleman brand guide — if Coleman later supplies one and it differs from what's observed on the live site, these values should be superseded again, per `docs/brand-audit.md`'s own framing.

**Revisit When:** Camp Coleman supplies an official brand guide that differs from the observed live-site values.

---

## DL-014: Fail fast on invalid environment config at server startup; stop mislabeling server errors as "Network error"

**Decision:** Add `src/lib/env.ts` (`validateRequiredEnv()`) and `src/instrumentation.ts`, which calls it once via Next.js's `register()` hook when the server starts. A missing or too-short `SESSION_SECRET` (or missing `DATABASE_URL`) now stops the server immediately with a clear terminal message, instead of the app starting normally and only failing later, deep inside a request handler. Also fixed `src/components/public/contributor-flow.tsx`'s identity/consent submit handlers, which previously caught *any* error from a Server Action call and unconditionally showed "Network error — please check your connection and try again." — now `describeSubmitError()` only shows that message for an actual `TypeError` (what `fetch()` throws for genuine network failures); any other error shows an honest "something went wrong on our end" message instead.

**Why:** Found via a real bug report — the owner hit "Network error" on the consent step (Step 2) while testing locally on 2026-08-09. Root cause: their local `.env.local` had `SESSION_SECRET="chalutzim"` (9 characters), below the 16-character minimum that `src/lib/hash.ts`'s `hashIp()` (called from `submitConsentAction`) and `src/lib/auth/session.ts`'s `getSecretKey()` (called from admin login) both already enforced — correctly, as fail-closed security checks (a short/guessable salt would make the IP hash reversible; see `docs/pre-production-review.md`). The bug wasn't the validation itself, which was working as designed — it was that (a) the check only ran the first time a request actually reached that code path, so the server appeared to start fine and only broke when a real contributor hit consent, and (b) the client-side catch-all discarded whatever the real thrown error was and always blamed "the network," actively misleading anyone trying to diagnose it (including this session, initially).

**What changed, mechanically:** `getRequiredSessionSecret()` in the new `src/lib/env.ts` is now the single place the 16-character minimum is defined; `hash.ts` and `session.ts` both call it instead of duplicating the check inline. `src/instrumentation.ts`'s `register()` calls `validateRequiredEnv()` once at boot, gated to `NEXT_RUNTIME === "nodejs"` (not the Edge runtime `src/proxy.ts` runs under). Verified by deliberately setting a 9-character `SESSION_SECRET` locally: `npm run dev` now crashes immediately with `SESSION_SECRET is not set (or shorter than 16 characters) — see .env.example. Generate a real one with: openssl rand -base64 32`, rather than starting cleanly and failing later. With a valid secret restored, ran the full check suite (typecheck, lint, 34 unit tests, all 15 E2E specs including admin login and the full contributor happy path, and a production build) — all clean.

**Alternatives:** Leave the check where it was (rejected — correct security behavior, wrong failure timing: a misconfigured secret should be a boot-time error, not something a contributor discovers for you in production). Make the client-side error message more detailed/technical (rejected for real contributors — showing internal error text to the public isn't appropriate; the fix is to stop being *wrong* about the cause, not to overshare).

**Tradeoffs:** None significant. `validateRequiredEnv()` is deliberately conservative about what counts as "required" — only variables whose absence causes a hard failure somewhere (not every optional/defaulted variable) — so it won't nag about legitimately-unset optional config.

**Revisit When:** Additional environment variables are added whose absence should also fail the server at boot rather than at first use — add them to `validateRequiredEnv()` following the same pattern.

---

*(Further entries will be added as significant decisions arise in later phases.)*
