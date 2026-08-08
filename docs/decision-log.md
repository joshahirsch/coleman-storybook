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

*(Further entries — stack selection, storage provider, auth provider, transcription/AI provider, tenancy model details — will be added in Phase 1 as those decisions are made.)*
