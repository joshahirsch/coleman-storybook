import { NextResponse, type NextRequest } from "next/server";
import { uploadConfirmSchema, MEDIA_CONSTRAINTS } from "@/lib/validation";
import { getMediaAssetByStorageKey, markMediaAssetConfirmed } from "@/lib/data/media";
import { getStorageAdapter } from "@/lib/storage";

/**
 * Server-side re-verification that the object actually exists before
 * anything is marked durable. The client's claim of "upload finished" is
 * never trusted alone — see docs/architecture.md Section 7.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const parsed = uploadConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const asset = await getMediaAssetByStorageKey(parsed.data.storageKey);
  if (!asset || asset.submissionAnswerId !== parsed.data.submissionAnswerId) {
    return NextResponse.json({ ok: false, error: "Media asset not found for this answer." }, { status: 404 });
  }
  if (asset.status === "confirmed") {
    return NextResponse.json({ ok: true, alreadyConfirmed: true });
  }

  const storage = getStorageAdapter();
  const confirmed = await storage.confirmUpload(parsed.data.storageKey);
  if (!confirmed) {
    return NextResponse.json(
      { ok: false, error: "Upload could not be verified on the server. Please retry the upload." },
      { status: 409 },
    );
  }
  if (confirmed.bytes > MEDIA_CONSTRAINTS.maxBytes) {
    return NextResponse.json({ ok: false, error: "Uploaded file exceeds the maximum allowed size." }, { status: 413 });
  }
  if (!(MEDIA_CONSTRAINTS.allowedMimeTypes as readonly string[]).includes(confirmed.contentType)) {
    return NextResponse.json({ ok: false, error: "Uploaded file has an unsupported type." }, { status: 415 });
  }

  await markMediaAssetConfirmed(asset.id, { bytes: confirmed.bytes, contentType: confirmed.contentType });

  return NextResponse.json({ ok: true });
}
