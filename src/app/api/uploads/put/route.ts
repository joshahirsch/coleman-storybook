import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/storage/signing";
import { writeLocalObject } from "@/lib/storage/local-adapter";
import { getMediaAssetByStorageKey } from "@/lib/data/media";
import { MEDIA_CONSTRAINTS } from "@/lib/validation";

/**
 * Local-adapter "direct upload" target. In production (Supabase Storage /
 * S3 / R2) the client would PUT directly to the cloud provider's signed
 * URL and this route would not exist — see docs/architecture.md Section 1.
 * This route exists only so the local dev/test storage adapter has a real
 * signed, time-limited write endpoint to point at, keeping the upload flow
 * architecturally identical to the cloud version.
 */
export async function PUT(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  const token = request.nextUrl.searchParams.get("token");
  if (!key || !token) {
    return NextResponse.json({ ok: false, error: "Missing key or token." }, { status: 400 });
  }

  const verification = verifyToken(token, { key, purpose: "write" });
  if (!verification.valid) {
    return NextResponse.json({ ok: false, error: `Upload URL invalid or expired (${verification.reason}).` }, { status: 403 });
  }

  const asset = await getMediaAssetByStorageKey(key);
  if (!asset) {
    return NextResponse.json({ ok: false, error: "No pending upload found for this key." }, { status: 404 });
  }
  if (asset.status !== "pending") {
    return NextResponse.json({ ok: false, error: "This media asset has already been confirmed or failed." }, { status: 409 });
  }

  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  if (contentType !== asset.mimeType) {
    return NextResponse.json(
      { ok: false, error: `Content-Type ${contentType} does not match declared type ${asset.mimeType}.` },
      { status: 400 },
    );
  }
  if (!(MEDIA_CONSTRAINTS.allowedMimeTypes as readonly string[]).includes(contentType)) {
    return NextResponse.json({ ok: false, error: "Unsupported media type." }, { status: 415 });
  }

  const arrayBuffer = await request.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    return NextResponse.json({ ok: false, error: "Empty upload body." }, { status: 400 });
  }
  if (arrayBuffer.byteLength > MEDIA_CONSTRAINTS.maxBytes) {
    return NextResponse.json({ ok: false, error: "File exceeds the maximum allowed size." }, { status: 413 });
  }

  await writeLocalObject(key, contentType, Buffer.from(arrayBuffer));

  return NextResponse.json({ ok: true, bytes: arrayBuffer.byteLength });
}

// NOTE: App Router Route Handlers use the Web Request/Response API directly
// (no Pages-Router-style `config.api.bodyParser` toggle applies here).
// Known production limitation of routing uploads through this Next.js route
// at all (only true for the LOCAL adapter): Vercel serverless functions cap
// request body size well below a multi-minute video's size. The Supabase
// Storage / S3 / R2 production adapter (docs/architecture.md Section 1)
// avoids this entirely because the client PUTs directly to the storage
// provider's own signed URL, never through this Next.js server — see
// docs/deployment.md.
