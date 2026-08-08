import Link from "next/link";
import { listAllCampaigns } from "@/lib/data/campaigns";
import { getDefaultOrganizationBrand } from "@/lib/data/organization";

// Campaign list changes whenever an admin activates/deactivates a campaign
// (Phase 16), so this must never be statically frozen at build time.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [campaigns, brand] = await Promise.all([listAllCampaigns(), getDefaultOrganizationBrand()]);
  const activeCampaigns = campaigns.filter((c) => c.active);
  const productName = brand?.productName ?? "Coleman Storybook";

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-brand-muted">{productName}</p>
        <h1 className="mt-2 text-3xl font-semibold text-brand-secondary sm:text-4xl">
          Your Coleman story matters.
        </h1>
        <p className="mt-4 text-lg text-brand-muted">
          Help us preserve the memories, friendships, traditions, and moments that make Coleman home.
        </p>
      </div>

      {activeCampaigns.length > 0 ? (
        <div className="flex w-full flex-col gap-3">
          <p className="text-sm text-brand-muted">Choose a story campaign to get started:</p>
          {activeCampaigns.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/${campaign.slug}`}
              className="w-full rounded-full bg-brand-primary px-6 py-3 font-medium text-white transition hover:opacity-90"
            >
              {campaign.title}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-brand-muted">No campaigns are currently active. Check back soon.</p>
      )}

      <p className="text-xs text-brand-muted">
        Staff and administrators:{" "}
        <Link href="/admin/login" className="underline">
          sign in here
        </Link>
        .
      </p>
    </main>
  );
}
