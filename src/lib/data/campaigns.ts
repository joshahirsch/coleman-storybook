import { db } from "@/db/client";
import { campaignQuestions, campaigns } from "@/db/schema";
import { and, asc, eq, or, isNull, inArray } from "drizzle-orm";
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

/**
 * Simple audience filter — null audience means "shown to everyone." Not a
 * rules engine (spec Section 8).
 *
 * `relationships` is the contributor's full set of selected relationships
 * (multi-select as of 2026-08-13) — a question is shown if it has no
 * audience restriction, or its single target audience is ANY ONE of the
 * contributor's selections (union, not intersection: a camper_staff
 * contributor sees both camper-only and staff-only questions).
 */
export async function getQuestionsForAudience(campaignId: string, relationships: Relationship[]) {
  const audienceCondition =
    relationships.length > 0
      ? or(isNull(campaignQuestions.audience), inArray(campaignQuestions.audience, relationships))
      : isNull(campaignQuestions.audience);

  return db
    .select()
    .from(campaignQuestions)
    .where(and(eq(campaignQuestions.campaignId, campaignId), eq(campaignQuestions.active, true), audienceCondition))
    .orderBy(asc(campaignQuestions.order));
}

export async function listAllCampaigns() {
  const org = await getDefaultOrganization();
  if (!org) return [];
  return db.select().from(campaigns).where(eq(campaigns.organizationId, org.id)).orderBy(asc(campaigns.title));
}
