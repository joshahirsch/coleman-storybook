import { db } from "@/db/client";
import { organizationBrands, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * V1 is single-organization (Camp Coleman). This helper centralizes that
 * assumption in one place so multi-organization support later (resolving by
 * domain or path prefix instead of "the only org") is a contained change —
 * see docs/architecture.md Section 2.
 */
export async function getDefaultOrganization() {
  const [org] = await db.select().from(organizations).limit(1);
  return org ?? null;
}

export async function getDefaultOrganizationBrand() {
  const org = await getDefaultOrganization();
  if (!org) return null;
  const [brand] = await db
    .select()
    .from(organizationBrands)
    .where(eq(organizationBrands.organizationId, org.id))
    .limit(1);
  return brand ?? null;
}
