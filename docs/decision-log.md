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

## DL-003: Brand tokens treated as placeholder/configurable pending real Camp Coleman brand materials

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

*(Further entries will be added as significant decisions arise in later phases.)*
