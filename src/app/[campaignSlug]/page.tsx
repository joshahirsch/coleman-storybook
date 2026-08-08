import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveCampaignBySlug, getCampaignBySlugAnyStatus } from "@/lib/data/campaigns";
import { trackAnalyticsEvent } from "@/lib/audit";

export default async function CampaignLandingPage({
  params,
}: {
  params: Promise<{ campaignSlug: string }>;
}) {
  const { campaignSlug } = await params;
  const campaign = await getActiveCampaignBySlug(campaignSlug);

  if (!campaign) {
    const anyStatus = await getCampaignBySlugAnyStatus(campaignSlug);
    if (anyStatus && !anyStatus.active) {
      return (
        <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-2xl font-semibold text-brand-secondary">This campaign is not currently accepting stories.</h1>
          <p className="text-brand-muted">Please check back later, or contact Camp Coleman for more information.</p>
        </main>
      );
    }
    notFound();
  }

  await trackAnalyticsEvent({ eventType: "campaign_viewed", campaignId: campaign.id });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-brand-muted">{campaign.title}</p>
        <h1 className="mt-2 text-3xl font-semibold text-brand-secondary sm:text-4xl">
          {campaign.heroHeadline ?? "Your Coleman story matters."}
        </h1>
        {campaign.heroSubhead && <p className="mt-4 text-lg text-brand-muted">{campaign.heroSubhead}</p>}
      </div>

      {campaign.introCopy && <p className="max-w-lg text-brand-muted">{campaign.introCopy}</p>}

      <Link
        href={`/${campaign.slug}/share`}
        className="rounded-full bg-brand-primary px-8 py-4 text-lg font-medium text-white shadow-sm transition hover:opacity-90"
      >
        Share My Coleman Story
      </Link>

      <p className="max-w-md text-xs text-brand-muted">
        Coleman Storybook is currently open to adult contributors. By continuing you&apos;ll be asked to review and
        accept a media release before recording.
      </p>
    </main>
  );
}
