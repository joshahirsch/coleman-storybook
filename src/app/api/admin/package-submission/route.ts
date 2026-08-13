import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { packageSubmissionVideos } from "@/lib/submission-packaging";

/**
 * On-demand admin action: packages one submission's confirmed videos into
 * their own Drive subfolder, renamed per the adopted naming convention. See
 * `src/lib/submission-packaging.ts` for the full behavior/rationale.
 *
 * Deliberately manual (admin-session-gated POST, triggered per submission)
 * rather than wired into `finalizeSubmissionAction` the way the contact-log
 * CSV export is — the owner asked for this to run on-demand, not
 * automatically on every finalize (2026-08-13 decision, see the
 * "Coleman Storybook — Build Status" project doc).
 *
 * Safe to call more than once for the same submission — the underlying
 * folder-creation and file-copy both skip work already done rather than
 * duplicating it (see `packageSubmissionVideos`'s doc comment).
 */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const submissionId = (body as { submissionId?: unknown } | null)?.submissionId;
  if (typeof submissionId !== "string" || submissionId.length === 0) {
    return NextResponse.json({ error: '"submissionId" (string) is required.' }, { status: 400 });
  }

  try {
    const result = await packageSubmissionVideos(submissionId);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
