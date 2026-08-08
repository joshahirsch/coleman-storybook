# Cost Model

No production infrastructure or paid vendor has been provisioned yet, so every figure below is an estimate for planning purposes, not a bill anyone has actually received. This document exists so the owner can make an informed Phase 13/14 authorization decision, not to lock in specific vendors — every category below is provider-abstracted in code (`docs/architecture.md` Section 4) specifically so the actual vendor choice can be deferred to whoever is paying for it.

## Cost categories

### 1. Application hosting

Next.js hosting (e.g. Vercel). Typical small-project cost: free tier is often sufficient for low-traffic, invitation-based usage (V1's expected traffic pattern per `docs/security.md`'s rate-limiting rationale); a paid tier (roughly $20/month and up) becomes relevant if usage grows, if a team needs more than the free tier's seats, or if Vercel Cron's free-tier limits are exceeded (the job-processing scheduler, see `docs/deployment.md`). Exact pricing should be checked against the hosting provider's current published rates before committing, since these change over time.

### 2. Database

Managed Postgres (e.g. Supabase). Free tiers commonly exist for small projects but typically pause after a period of inactivity — worth confirming before relying on one for a real pilot. A paid tier (commonly in the $25/month range for a small managed Postgres instance) removes that risk and adds larger storage/connection limits. Actual row/storage volume here is small — this app stores metadata, transcripts, and structured records, not the media files themselves (see below) — so database cost is unlikely to be the dominant line item.

### 3. Object storage (recorded video/audio)

This is likely the largest and most usage-sensitive cost, and the one most worth estimating carefully before a pilot. Video is the expensive dimension:

- A 2-3 minute webcam-quality video recording (matching the campaign `max_duration_seconds` defaults seeded in this build, e.g. 180s) is roughly 20-60MB depending on resolution/bitrate.
- `MEDIA_CONSTRAINTS.maxBytes` in `src/lib/validation.ts` hard-caps any single upload at 500MB as a safety ceiling, but realistic Quick-Answers-mode submissions (several short question-by-question clips) are expected to land well under that.
- Storage cost itself (the "at rest" component) is typically the smaller part of an object-storage bill at this scale — bandwidth/egress (serving signed playback URLs to admins reviewing stories) and any storage-provider request-count pricing tend to matter more as usage grows. Both scale directly with pilot participation and how often admins re-watch submissions, so a rough estimate should assume "every submission gets watched by an admin at least once, maybe several times during review."
- No object-storage vendor is selected yet (see `docs/deployment.md` "Provider gap") — Supabase Storage, S3, and R2 all have materially different pricing models (R2 notably has no egress fee, which matters a lot for a video-review-heavy admin workflow), so vendor choice should be informed by this cost profile, not made before it.

### 4. Transcription

No vendor selected. Typical speech-to-text APIs price per minute of audio processed. Given the small expected volume of a single-camp pilot (dozens to low hundreds of submissions, each a few minutes long), this is likely a small absolute dollar amount even at typical per-minute rates — but it is a real recurring marginal cost per submission, unlike the largely-fixed hosting/database cost, so it scales with pilot success (more contributors = more cost) in a way worth flagging to the owner before authorizing.

### 5. AI story analysis (themes/summary/quotes)

No vendor selected. Typical LLM API pricing is per-token; a transcript-length input (a few minutes of speech, roughly a few hundred to low thousands of words) plus a themes/summary/quotes output is a small request by LLM standards. Similarly a real but likely modest marginal-per-submission cost.

### 6. Email (if/when contributor or admin notification email is added)

Not built in V1 (no email-sending code exists in this codebase yet, despite `organizations.contact_email` and `contributors.email` fields existing in the schema for future use). If added, typical transactional email providers have generous free tiers for the volume this project would generate.

### 7. Domain / DNS

A one-time and small recurring cost (typically $10-20/year for a domain) if a dedicated production domain is desired rather than the hosting platform's default subdomain — not a system cost this codebase controls.

## What this build deliberately avoided spending money on

Per the project's "do not request credentials until actually needed" and "minimal scope" principles: no paid transcription/AI/storage vendor has been contracted, no production database or hosting plan has been provisioned, and all development/testing has used $0 local/synthetic substitutes (local Postgres, local filesystem storage, fake transcription/analysis providers). This means the cost model above is genuinely unvalidated against a real bill — it should be treated as a planning estimate for the owner authorization conversation at the Phase 13 gate, refined with real vendor quotes before Phase 14 provisioning, and revisited after the Phase 15 pilot with actual usage data.

## Recommended next step

Before Phase 14 (owner-authorized production provisioning), get actual current quotes/pricing pages for the specific vendors under consideration for hosting, database, storage, transcription, and AI analysis, since published rates change over time and this document should not be treated as current pricing — it's a category-and-shape estimate, not a quote.
