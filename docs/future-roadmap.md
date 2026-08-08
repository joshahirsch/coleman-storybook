# Future Roadmap / Explicitly Out of Scope for Initial MVP

These are deliberately deferred, not overlooked. Building them prematurely would violate the project's "minimal scope" and "extensible, not abstract" principles.

- Native iOS app
- Native Android app
- Complex video editor
- Full digital asset management (DAM) system
- Fully automated public publishing (AI never auto-publishes; human approval always required)
- CRM integrations
- Marketing automation platform integration
- Social scheduling/publishing automation
- Billing / subscription infrastructure
- Enterprise SSO
- Complex role-based access control (beyond a simple admin role in V1)
- The public-facing curated "Coleman Storybook" experience (Phase 18 — requires explicit owner authorization)
- Guardian/minor consent workflow (documented as a future requirement; needs owner-supplied requirements + legal review)
- Automated montage/highlight-reel generation
- Multilingual transcription
- Vector/semantic search infrastructure (Postgres full-text search is the V1 approach; data model leaves room to add embeddings later — see `docs/architecture.md`)
- Recommendation engine
- White-label multi-organization onboarding / full multi-tenant SaaS (V1 is "multi-organization ready," not "multi-tenant SaaS now")
- Structured "year(s) associated" field + a real admin year filter — V1 stores this as free text the contributor types (e.g. "Camper 2005-2011, Staff 2012-2015"); a trustworthy year filter needs either a structured start/end-year field on `contributors` or a deliberate parsing strategy, not a guess

## Productization

Whether Coleman Storybook becomes a multi-customer product beyond Camp Coleman is a Phase 19 evaluation based on evidence from the Coleman deployment (submission volume, staff usefulness, willingness-to-pay signals from adjacent markets such as other summer camps, schools, alumni associations, nonprofits, and congregations). No billing or tenant-onboarding infrastructure will be built ahead of that evidence.
