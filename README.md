# Coleman Storybook

A testimonial / oral-history / story-intelligence platform built for URJ Camp Coleman. "Coleman Storybook" is the working product name only — see `docs/decision-log.md` DL-001; it stays configurable, never hard-coded.

Contributors (alumni, staff, parents, volunteers) are invited via campaign links, record short video/audio answers to guided questions from their own device, and give versioned, traceable consent before anything is stored. Admins review, search, and curate submissions in a private story library, assisted (never auto-decided) by AI-generated transcripts, themes, and pull quotes. See `docs/product-vision.md` for the full product thesis.

## Status

Application code exists and is functional through the core contributor and admin loops (campaign landing → identity → consent → camera-ready → record → upload → transcribe → analyze → admin review/search). See `docs/phase-status.md` for the authoritative phase-by-phase status. **No production environment exists yet** — see `docs/deployment.md` and `docs/production-launch-checklist.md`.

## Getting started (local development)

Prerequisites: Node.js 22+, a local PostgreSQL 16+ instance.

```bash
npm install
cp .env.example .env.local   # then fill in real local values — see comments in the file
npm run db:push               # apply the schema (Drizzle push)
npm run db:seed               # load synthetic dev fixtures + a dev-only admin login
npm run dev
```

Open http://localhost:3000. The seeded admin login is printed by `db:seed` (dev-only credentials — never used in production).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server (Turbopack) |
| `npm run build` / `npm run start` | Production build / start |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test` / `npm run test:watch` | Vitest unit tests |
| `npx playwright test --project=chromium` (or `npm run test:e2e`) | Playwright E2E suite (reseeds the DB first — see `docs/testing.md`) |
| `npm run db:push` | Apply `src/db/schema.ts` to `DATABASE_URL` |
| `npm run db:seed` | Idempotently reset + seed synthetic dev data |
| `npm run jobs:process` | Run one processing-job cycle (transcription/analysis queue) locally |

## Documentation

Everything durable about this project lives in `docs/`, not just in commit messages:

- `docs/product-vision.md` — product thesis, users, scope boundaries, success criteria
- `docs/brand-audit.md` — Camp Coleman brand research (OBSERVED/INFERRED/RECOMMENDED)
- `docs/architecture.md` — stack, component/data-flow diagrams, provider-abstraction pattern, threat model summary, test strategy
- `docs/data-model.md` — entity-by-entity narrative companion to `src/db/schema.ts`
- `docs/security.md` — threat model, controls, and known residual risks
- `docs/privacy-and-consent.md` — what's collected, how consent is versioned/traced, withdrawal
- `docs/legal-review-required.md` — items requiring Camp Coleman counsel review before real use (not legal advice)
- `docs/testing.md` — unit + E2E strategy, what's covered, what's deliberately not
- `docs/deployment.md` — target topology, environment variables, the provider-abstraction gap that must be closed before a real production deploy
- `docs/cost-model.md` — estimated cost categories (hosting, storage, transcription, AI) pending real vendor quotes
- `docs/decision-log.md` — ADR-style record of significant decisions and why
- `docs/phase-status.md` — phase-by-phase build status tracker
- `docs/future-roadmap.md` — explicitly out-of-scope-for-V1 items
- `docs/pre-production-review.md` — Phase 12 security/privacy review findings
- `docs/production-launch-checklist.md` — Phase 13 launch requirements and unresolved decisions (the owner-authorization gate before any production provisioning)

## Tech stack

Next.js 16 (App Router, TypeScript), Tailwind CSS v4, Drizzle ORM over PostgreSQL, provider-abstracted media storage / transcription / AI analysis (local/synthetic implementations in dev, real cloud adapters intentionally not yet written — see `docs/deployment.md`), hand-rolled bcrypt+JWT admin auth (see `docs/decision-log.md` DL-007). Full rationale for every non-obvious choice is in `docs/architecture.md` and `docs/decision-log.md`.
