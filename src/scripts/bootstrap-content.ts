/**
 * Create the real organization and campaigns — safe to run against production.
 *
 * Third script in the non-destructive family alongside create-admin.ts:
 * seed.ts is destructive (TRUNCATEs every table) and dev-only; create-admin.ts
 * and this script each do targeted, idempotent inserts/updates and are meant
 * to be run against a real database.
 *
 * Why this exists: db:migrate (src/db/seed.ts's non-destructive sibling for
 * schema) creates every TABLE, but no ROWS — nothing else creates the
 * `organizations` row or any `campaigns` row in production, since the only
 * code that ever inserted them was the destructive seed script. Discovered
 * while writing docs/phase-14-provisioning-runbook.md: without this, Phase
 * 14 would reach a fully-migrated, fully-configured, admin-account-created
 * production database that still 404s on every campaign URL, because no
 * organization or campaign exists to serve.
 *
 * The campaign copy and questions below are NOT placeholder/synthetic
 * content invented for this script — they're the same real "Alumni
 * Stories" / "Staff Stories" / "Parent Stories" campaigns that
 * src/db/seed.ts has created since Phase 3, just extracted out from under
 * the destructive TRUNCATE so they can be created safely in production.
 * Only the org, campaigns, and questions are created here — no synthetic
 * contributors, submissions, or admin users (those stay dev-only in
 * seed.ts, or are handled by create-admin.ts for the real admin).
 *
 * Per docs/decision-log.md DL-009 (small, alumni-only pilot — expand only
 * after POC validation), only the "alumni" campaign is activated by
 * default; "staff" and "parents" are created but left inactive so they
 * exist and are ready, without silently expanding the pilot's actual
 * audience beyond what the owner decided. Override with
 * ACTIVATE_ALL_CAMPAIGNS=true if that decision has since changed.
 *
 * Deliberately NOT included: the "friendships" campaign from seed.ts —
 * that one is a disabled-campaign test fixture (spec Section 30 negative
 * path), not real designed content, so it doesn't belong in production.
 *
 * Usage:
 *   npx tsx --env-file=.env.local src/scripts/bootstrap-content.ts
 *   ACTIVATE_ALL_CAMPAIGNS=true npx tsx --env-file=.env.local src/scripts/bootstrap-content.ts
 *
 * Safe to re-run: the organization is matched by slug and updated in place;
 * each campaign is matched by (organizationId, slug) — the same uniqueness
 * constraint the schema already enforces (campaigns_org_slug_idx) — and
 * skipped entirely if it already exists, rather than duplicating questions
 * or overwriting any copy an admin may have since edited by hand. To change
 * existing campaign copy, edit it directly (there's no admin UI for this
 * yet — see docs/future-roadmap.md / Phase 16, "Self-Service Campaign
 * Management") rather than re-running this script and expecting an update.
 */
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, campaigns, campaignQuestions } from "@/db/schema";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent";

const ORG = {
  name: "URJ Camp Coleman",
  slug: "camp-coleman",
  contactEmail: "info@campcoleman.org",
};

const CAMPAIGNS: Array<{
  slug: string;
  title: string;
  description: string;
  heroHeadline: string;
  heroSubhead: string;
  introCopy: string;
  completionHeadline: string;
  completionCopy: string;
  tags: string[];
  activateByDefault: boolean;
  questions: string[];
}> = [
  {
    slug: "alumni",
    title: "Alumni Stories",
    description: "For Camp Coleman alumni sharing memories from their camper years.",
    heroHeadline: "Your Coleman story matters.",
    heroSubhead: "Help us preserve the memories, friendships, traditions, and moments that make Coleman home.",
    introCopy:
      "It only takes a few minutes. We'll guide you through a few questions and record your answers using your phone or computer.",
    completionHeadline: "Your story is now part of the Coleman story.",
    completionCopy: "Todah rabah — thank you for sharing your Coleman story with us.",
    tags: ["alumni"],
    activateByDefault: true,
    questions: [
      "Tell us your name and when you were at Coleman.",
      "What Coleman memory still makes you smile?",
      "Who did you meet at Coleman who changed your life?",
      "What did Coleman give you that you did not realize at the time?",
      "How did Coleman influence who you became?",
      "What would you tell someone considering Coleman today?",
    ],
  },
  {
    slug: "staff",
    title: "Staff Stories",
    description: "For current and former Camp Coleman staff.",
    heroHeadline: "Your Coleman story matters.",
    heroSubhead: "Tell us what working at Coleman meant to you.",
    introCopy:
      "It only takes a few minutes. We'll guide you through a few questions and record your answers using your phone or computer.",
    completionHeadline: "Your story is now part of the Coleman story.",
    completionCopy: "Todah rabah — thank you for sharing your Coleman story with us.",
    tags: ["staff"],
    activateByDefault: false,
    questions: [
      "What brought you to the Coleman staff?",
      "What did working at Coleman teach you?",
      "Tell us about a moment with a camper or coworker you still remember.",
      "How did your Coleman experience influence what came next?",
    ],
  },
  {
    slug: "parents",
    title: "Parent Stories",
    description: "For parents and alumni-parents of Camp Coleman campers.",
    heroHeadline: "Your Coleman story matters.",
    heroSubhead: "Tell us what Coleman has meant for your family.",
    introCopy:
      "It only takes a few minutes. We'll guide you through a few questions and record your answers using your phone or computer.",
    completionHeadline: "Your story is now part of the Coleman story.",
    completionCopy: "Todah rabah — thank you for sharing your Coleman story with us.",
    tags: ["parents"],
    activateByDefault: false,
    questions: [
      "Tell us your name and your family's connection to Coleman.",
      "What changes have you noticed in your camper since they started at Coleman?",
      "What would you tell another parent considering Coleman?",
    ],
  },
];

async function main() {
  const activateAll = process.env.ACTIVATE_ALL_CAMPAIGNS === "true";

  const [existingOrg] = await db.select().from(organizations).where(eq(organizations.slug, ORG.slug)).limit(1);

  const org =
    existingOrg ??
    (
      await db
        .insert(organizations)
        .values(ORG)
        .returning()
    )[0];

  if (existingOrg) {
    console.log(`Organization already exists: ${org.name} (${org.id}) — left as-is.`);
  } else {
    console.log(`Created organization: ${org.name} (${org.id})`);
  }

  for (const c of CAMPAIGNS) {
    const [existingCampaign] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.organizationId, org.id), eq(campaigns.slug, c.slug)))
      .limit(1);

    if (existingCampaign) {
      console.log(`Campaign already exists: "${c.title}" (/${c.slug}) — skipped, not modified.`);
      continue;
    }

    const active = c.activateByDefault || activateAll;
    const [campaign] = await db
      .insert(campaigns)
      .values({
        organizationId: org.id,
        slug: c.slug,
        title: c.title,
        description: c.description,
        heroHeadline: c.heroHeadline,
        heroSubhead: c.heroSubhead,
        introCopy: c.introCopy,
        completionHeadline: c.completionHeadline,
        completionCopy: c.completionCopy,
        recordingMode: "quick_answers",
        maxDurationSeconds: 180,
        consentVersion: CURRENT_CONSENT_VERSION,
        tags: c.tags,
        active,
      })
      .returning();

    await db.insert(campaignQuestions).values(
      c.questions.map((promptText, order) => ({
        campaignId: campaign.id,
        promptText,
        order,
      })),
    );

    console.log(
      `Created campaign: "${c.title}" (/${c.slug}), ${c.questions.length} questions, ` +
        `${active ? "ACTIVE" : "inactive (not shown/linked until activated)"}.`,
    );
  }

  console.log("\nDone. Campaign URLs (once deployed): APP_BASE_URL + /<slug>, e.g. /alumni.");
  process.exit(0);
}

main().catch((err) => {
  console.error("bootstrap-content failed:", err);
  process.exit(1);
});
