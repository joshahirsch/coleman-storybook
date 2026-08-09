/**
 * Apply the current Camp Coleman brand tokens to an existing database —
 * safe to run against production.
 *
 * This is the deliberate counterpart to `src/db/seed.ts`: seed.ts is
 * destructive (TRUNCATEs every table) and refuses to run in production;
 * this script does a single targeted insert/update on `organization_brands`
 * for the one existing organization (V1 is single-org — see
 * src/lib/data/organization.ts) and is meant to be re-run any time the
 * brand tokens change, without touching submissions, admin users, or
 * anything else already in the database.
 *
 * Values hard-coded below are sourced from a live visual/computed-style
 * audit of https://campcoleman.org/ (2026-08-08) — navy/teal/blue,
 * Montserrat + Open Sans — approved by the owner (Josh Hirsch) the same day
 * as Coleman Storybook's working brand tokens. This is NOT an official
 * Camp Coleman brand guide (none has been supplied as of this writing) —
 * see docs/brand-audit.md for the full audit and provenance. If Camp
 * Coleman later supplies an official brand guide, update the values below
 * and re-run.
 *
 * Usage:
 *   npx tsx --env-file=.env.local src/scripts/update-brand.ts
 *
 * logoUrl points at `public/brand/coleman-logo.png` — the real Camp
 * Coleman logo file, supplied directly by the owner (Josh Hirsch, saved
 * from campcoleman.org) on 2026-08-08 (see docs/brand-audit.md Section 7).
 * Override with the BRAND_LOGO_URL env var if the file ever moves or is
 * replaced with an official asset from Coleman.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizationBrands, organizations } from "@/db/schema";

const BRAND = {
  productName: "Coleman Storybook",
  isPlaceholder: false,
  primaryColor: "#0C71C3", // Coleman blue — buttons/CTAs
  secondaryColor: "#003F69", // Coleman navy — headings, primary text
  accentColor: "#74CCD3", // Coleman teal — focus rings, highlights
  fontHeading: "Montserrat",
  fontBody: "Open Sans",
  logoUrl: process.env.BRAND_LOGO_URL ?? "/brand/coleman-logo.png",
};

async function main() {
  const orgs = await db.select().from(organizations);
  if (orgs.length === 0) {
    console.error(
      "No organization found. Run the schema/data setup for this deployment before updating brand tokens " +
        "(an organization row must exist first).",
    );
    process.exit(1);
  }
  if (orgs.length > 1) {
    console.error(
      `Found ${orgs.length} organizations; this script assumes single-org V1 (src/lib/data/organization.ts) and ` +
        "refuses to guess which one to update. Update this script if multi-org support has landed since it was written.",
    );
    process.exit(1);
  }
  const org = orgs[0];

  const [existing] = await db
    .select()
    .from(organizationBrands)
    .where(eq(organizationBrands.organizationId, org.id))
    .limit(1);

  if (existing) {
    await db.update(organizationBrands).set(BRAND).where(eq(organizationBrands.id, existing.id));
    console.log(`Updated brand tokens for organization "${org.name}".`);
  } else {
    await db.insert(organizationBrands).values({ organizationId: org.id, ...BRAND });
    console.log(`Created brand tokens for organization "${org.name}".`);
  }

  console.log(JSON.stringify(BRAND, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("update-brand failed:", err);
  process.exit(1);
});
