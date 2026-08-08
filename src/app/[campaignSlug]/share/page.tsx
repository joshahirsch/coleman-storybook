import { notFound } from "next/navigation";
import { getActiveCampaignBySlug } from "@/lib/data/campaigns";
import { ContributorFlow } from "@/components/public/contributor-flow";

export default async function SharePage({ params }: { params: Promise<{ campaignSlug: string }> }) {
  const { campaignSlug } = await params;
  const campaign = await getActiveCampaignBySlug(campaignSlug);
  if (!campaign) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-8 sm:py-12">
      <ContributorFlow
        campaignSlug={campaign.slug}
        campaignTitle={campaign.title}
        completionHeadline={campaign.completionHeadline}
        completionCopy={campaign.completionCopy}
      />
    </main>
  );
}
