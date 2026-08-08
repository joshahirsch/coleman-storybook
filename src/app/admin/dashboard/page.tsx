import Link from "next/link";
import { requireAdminSession } from "@/lib/auth/session";
import { listSubmissionsForAdmin } from "@/lib/data/admin";
import { listAllCampaigns } from "@/lib/data/campaigns";
import { adminLogoutAction } from "@/lib/actions/admin-actions";

function StateBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    STARTED: "bg-gray-100 text-gray-700",
    RECORDING: "bg-gray-100 text-gray-700",
    UPLOADING: "bg-blue-100 text-blue-800",
    SUBMITTED: "bg-blue-100 text-blue-800",
    PROCESSING: "bg-amber-100 text-amber-800",
    READY_FOR_REVIEW: "bg-green-100 text-green-800",
    PROCESSING_FAILED: "bg-red-100 text-red-800",
    WITHDRAWN: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[state] ?? "bg-gray-100 text-gray-700"}`}>
      {state.replace(/_/g, " ")}
    </span>
  );
}

function EditorialBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    PENDING: "bg-gray-100 text-gray-600",
    APPROVED: "bg-emerald-100 text-emerald-800",
    REJECTED: "bg-red-100 text-red-800",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[state]}`}>{state}</span>;
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; editorial?: string; favorite?: string; q?: string }>;
}) {
  const session = await requireAdminSession();
  const params = await searchParams;

  const [campaigns, submissions] = await Promise.all([
    listAllCampaigns(),
    listSubmissionsForAdmin({
      campaignId: params.campaign || undefined,
      editorialState: (params.editorial as "PENDING" | "APPROVED" | "REJECTED" | undefined) || undefined,
      favoriteOnly: params.favorite === "1",
      searchText: params.q || undefined,
    }),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-600">Coleman Storybook — Admin</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Story Library</h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>{session.email}</span>
          <form action={adminLogoutAction}>
            <button type="submit" className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <form method="GET" className="mb-6 flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-gray-50 p-4">
        <label className="text-sm text-gray-700">
          Search transcripts/names
          <input
            type="text"
            name="q"
            defaultValue={params.q}
            className="mt-1 block w-56 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="e.g. friendship, Sarah…"
          />
        </label>
        <label className="text-sm text-gray-700">
          Campaign
          <select name="campaign" defaultValue={params.campaign ?? ""} className="mt-1 block rounded-md border border-gray-300 px-3 py-1.5 text-sm">
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-700">
          Editorial status
          <select name="editorial" defaultValue={params.editorial ?? ""} className="mt-1 block rounded-md border border-gray-300 px-3 py-1.5 text-sm">
            <option value="">Any</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="favorite" value="1" defaultChecked={params.favorite === "1"} />
          Favorites only
        </label>
        <button type="submit" className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800">
          Apply
        </button>
        {(params.q || params.campaign || params.editorial || params.favorite) && (
          <Link href="/admin/dashboard" className="text-sm text-gray-600 underline">
            Clear filters
          </Link>
        )}
      </form>

      {submissions.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-600">
          No submissions match these filters.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-4 py-2">Contributor</th>
                <th className="px-4 py-2">Campaign</th>
                <th className="px-4 py-2">Submitted</th>
                <th className="px-4 py-2">Processing</th>
                <th className="px-4 py-2">Editorial</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {submissions.map((s) => (
                <tr key={s.submissionId} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {s.contributorName} {s.favorite && <span title="Favorited">★</span>}
                    </div>
                    <div className="text-xs text-gray-600">{s.relationship.replace(/_/g, " ")}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{s.campaignTitle}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StateBadge state={s.state} />
                    {s.hasFailedProcessing && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        Needs attention
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <EditorialBadge state={s.editorialState} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/submissions/${s.submissionId}`} className="text-sm font-medium text-gray-900 underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
