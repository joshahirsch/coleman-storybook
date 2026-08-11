import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { campaigns, submissionAnswers, submissions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { uploadInitSchema } from "@/lib/validation";
import { getDefaultOrganization } from "@/lib/data/organization";
import { createPendingMediaAsset } from "@/lib/data/media";
import { getStorageAdapter } from "@/lib/storage";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

const EXTENSION_BY_MIME: Record<string, string> = {
  "video/webm": "webm",
  "video/mp4": "mp4",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
};

export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);
  const rl = checkRateLimit(`upload-init:${ip}`, { maxRequests: 60, windowSeconds: 3600 });
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Too many upload attempts. Please try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const parsed = uploadInitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const [answer] = await db
    .select()
    .from(submissionAnswers)
    .where(eq(submissionAnswers.id, parsed.data.submissionAnswerId))
    .limit(1);
  if (!answer) {
    return NextResponse.json({ ok: false, error: "Submission answer not found." }, { status: 404 });
  }

  const [submission] = await db.select().from(submissions).where(eq(submissions.id, answer.submissionId)).limit(1);
  if (!submission || submission.state !== "UPLOADING") {
    return NextResponse.json(
      { ok: false, error: "This submission is not currently accepting uploads." },
      { status: 409 },
    );
  }

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, submission.campaignId)).limit(1);
  if (!campaign || !campaign.active) {
    return NextResponse.json({ ok: false, error: "This campaign is no longer active." }, { status: 409 });
  }

  const org = await getDefaultOrganization();
  if (!org) {
    return NextResponse.json({ ok: false, error: "Configuration error." }, { status: 500 });
  }

  // Everything below can throw (bad/missing storage env vars, the storage
  // provider's API rejecting the request, a DB write failing, etc.). An
  // uncaught throw here means Next.js/Vercel returns a bare empty 500 with
  // no JSON body — which is exactly what turned an actual (fixable)
  // Supabase configuration problem into an opaque client-side
  // "Unexpected end of JSON input" instead of a legible error. Always
  // return structured JSON, even on failure, so the real cause is visible.
  try {
    const storage = getStorageAdapter();
    const extension = EXTENSION_BY_MIME[parsed.data.mimeType] ?? "bin";
    const key = storage.buildKey({
      organizationSlug: org.slug,
      submissionId: submission.id,
      answerId: answer.id,
      extension,
    });

    await createPendingMediaAsset({
      submissionAnswerId: answer.id,
      storageKey: key,
      mimeType: parsed.data.mimeType,
    });

    const target = await storage.createUploadTarget(key, parsed.data.mimeType);

    return NextResponse.json({
      ok: true,
      storageKey: key,
      uploadUrl: target.url,
      method: target.method,
      headers: target.headers ?? {},
      bodyFormat: target.bodyFormat,
      expiresInSeconds: target.expiresInSeconds,
    });
  } catch (err) {
    console.error("[uploads/init] failed to prepare upload target:", err);
    return NextResponse.json(
      { ok: false, error: "Couldn't prepare the upload. Please try again in a moment." },
      { status: 500 },
    );
  }
}
