import { db } from "@/db/client";
import { campaignQuestions, campaigns } from "@/db/schema";
import { and, asc, eq, or, isNull } from "drizzle-orm";
import { getDefaultOrganization } from "./organization";

export async function getActiveCampaignBySlug(slug: string) {
  const org = await getDefaultOrganization();
  if (!org) return null;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.organizationId, org.id), eq(campaigns.slug, slug), eq(campaigns.active, true)))
    .limit(1);

  return campaign ?? null;
}

/** Returns campaign, even if inactive — used by admin. */
export async function getCampaignBySlugAnyStatus(slug: string) {
  const org = await getDefaultOrganization();
  if (!org) return null;
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.organizationId, org.id), eq(campaigns.slug, slug)))
    .limit(1);
  return campaign ?? null;
}

export type Relationship =
  | "camper"
  | "staff"
  | "camper_staff"
  | "parent"
  | "alumni_parent"
  | "volunteer"
  | "other";

/** Simple audience filter — null audience means "shown to everyone." Not a rules engine (spec Section 8). */
export async function getQuestionsForAudience(campaignId: string, relationship: Relationship) {
  return db
    .select()
    .from(campaignQuestions)
    .where(
      and(
        eq(campaignQuestions.campaignId, campaignId),
        eq(campaignQuestions.active, true),
        or(isNull(campaignQuestions.audience), eq(campaignQuestions.audience, relationship)),
      ),
    )
    .orderBy(asc(campaignQuestions.order));
}

export async function listAllCampaigns() {
  const org = await getDefaultOrganization();
  if (!org) return [];
  return db.select().from(campaigns).where(eq(campaigns.organizationId, org.id)).orderBy(asc(campaigns.title));
}
