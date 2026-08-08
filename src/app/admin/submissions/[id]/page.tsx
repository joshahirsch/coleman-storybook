import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { getSubmissionDetailForAdmin } from "@/lib/data/admin";
import { getStorageAdapter } from "@/lib/storage";
import { ReviewPanel } from "@/components/admin/review-panel";

export default async function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminSession();
  const { id } = await params;

  const detail = await getSubmissionDetailForAdmin(id);
  if (!detail) notFound();

  const { submission, contributor, campaign, review, consents, analysis, answers, jobs } = detail;
  const storage = getStorageAdapter();

  const answersWithUrls = await Promise.all(
    answers.map(async (answer) => ({
      ...answer,
      mediaAssets: await Promise.all(
        answer.mediaAssets.map(async (m) => ({
          ...m,
          playbackUrl: m.status === "confirmed" ? await storage.getSignedReadUrl(m.storageKey, 600) : null,
        })),
      ),
    })),
  );

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-8">
      <Link href="/admin/dashboard" className="text-sm text-gray-600 underline">
        ← Back to library
      </Link>

      <div className="mt-4 mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {contributor?.firstName} {contributor?.lastName}
            {contributor?.isSynthetic && (
              <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                SYNTHETIC seed contributor
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-600">
            {contributor?.relationship.replace(/_/g, " ")} · {contributor?.yearsAssociated ?? "years not provided"} ·{" "}
            {campaign?.title}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Submission state: <span className="font-medium text-gray-600">{submission.state}</span>
            {submission.submittedAt && ` · submitted ${new Date(submission.submittedAt).toLocaleString()}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="flex flex-col gap-6 md:col-span-2">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-900">Recordings</h2>
            <div className="flex flex-col gap-4">
              {answersWithUrls.map((answer, i) => (
                <div key={answer.id} className="rounded-md border border-gray-200 p-4">
                  <p className="text-sm font-medium text-gray-900">Question {i + 1}</p>
                  {answer.mediaAssets.map((m) => (
                    <div key={m.id} className="mt-2">
                      {m.playbackUrl ? (
                        <video src={m.playbackUrl} controls className="w-full max-w-md rounded-md bg-black" />
                      ) : (
                        <p className="text-xs text-gray-400">
                          Media {m.status === "pending" ? "not yet uploaded" : m.status}.
                        </p>
                      )}
                      {m.transcripts.length > 0 ? (
                        m.transcripts.map((t) => (
                          <div key={t.id} className="mt-2 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                            {t.provider === "fake-local" && (
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-purple-700">
                                SYNTHETIC — not a real transcript (dev/test provider)
                              </p>
                            )}
                            {t.text}
                          </div>
                        ))
                      ) : (
                        <p className="mt-2 text-xs text-gray-400">No transcript yet.</p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-900">Story intelligence (AI-assisted)</h2>
            {analysis ? (
              <div className="rounded-md border border-gray-200 p-4">
                {analysis.provider === "fake-local" && (
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-purple-700">
                    SYNTHETIC — not a real AI analysis (dev/test provider)
                  </p>
                )}
                <p className="text-sm text-gray-700">{analysis.summary}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {analysis.themes.map((theme) => (
                    <span key={theme} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                      {theme}
                    </span>
                  ))}
                </div>
                {Array.isArray(analysis.pullQuotes) && analysis.pullQuotes.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium uppercase text-gray-600">Pull quotes</p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {(analysis.pullQuotes as { text: string }[]).map((q, i) => (
                        <li key={i} className="border-l-2 border-gray-300 pl-2 text-sm italic text-gray-700">
                          &ldquo;{q.text}&rdquo;
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysis.marketingUseSuggestions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium uppercase text-gray-600">Marketing use suggestions</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-gray-700">
                      {analysis.marketingUseSuggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="mt-3 text-xs text-gray-400">
                  AI-derived metadata is assistive only and does not constitute human editorial approval.
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No analysis yet.</p>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-900">Processing status</h2>
            <ul className="flex flex-col gap-1">
              {jobs.length === 0 && <li className="text-sm text-gray-400">No processing jobs yet.</li>}
              {jobs.map((job) => (
                <li key={job.id} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm">
                  <span>
                    {job.jobType} — {job.status} {job.attempts > 1 && `(attempt ${job.attempts})`}
                  </span>
                  {job.lastError && <span className="text-xs text-red-700">{job.lastError}</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <ReviewPanel
            submissionId={submission.id}
            initialEditorialState={(review?.editorialState as "PENDING" | "APPROVED" | "REJECTED") ?? "PENDING"}
            initialFavorite={review?.favorite ?? false}
            initialNotes={review?.notes ?? ""}
          />

          <section className="rounded-md border border-gray-200 p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-900">Consent</h2>
            {consents.length === 0 ? (
              <p className="text-sm text-red-700">No consent record found.</p>
            ) : (
              consents.map((c) => (
                <div key={c.id} className="text-sm text-gray-700">
                  <p>Version: {c.consentVersion}</p>
                  <p>Permitted use: {c.permittedUseClassification.replace(/_/g, " ")}</p>
                  <p>Accepted: {new Date(c.acceptedAt).toLocaleString()}</p>
                  {c.revokedAt && <p className="font-medium text-red-700">Revoked: {new Date(c.revokedAt).toLocaleString()}</p>}
                </div>
              ))
            )}
          </section>

          <section className="rounded-md border border-gray-200 p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-900">Contributor</h2>
            <p className="text-sm text-gray-700">{contributor?.email ?? "No email provided"}</p>
          </section>
        </div>
      </div>
    </main>
  );
}
