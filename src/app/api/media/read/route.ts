import { NextResponse, type NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { stat, readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { verifyToken } from "@/lib/storage/signing";
import { localObjectPath } from "@/lib/storage/local-adapter";
import { fetchDriveMediaByKey } from "@/lib/storage/google-drive-adapter";

/**
 * Serves a media object only to holders of a valid, unexpired signed token
 * (see src/lib/storage/signing.ts). Never lists or serves objects without
 * one — this is the ONLY path through which recorded media is ever readable
 * for adapters that don't have their own native signed-URL primitive
 * (docs/architecture.md Section 8, docs/security.md).
 *
 * Dispatches on `STORAGE_DRIVER` because the underlying fetch mechanics
 * differ per adapter (local disk read vs. proxied Drive API call) even
 * though the token verification and response shape are identical. The
 * Supabase adapter does NOT route through here — its `getSignedReadUrl`
 * returns Supabase Storage's own native signed URL directly, since Supabase
 * (unlike Drive) has a first-class time-limited signed-URL primitive.
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  const token = request.nextUrl.searchParams.get("token");
  if (!key || !token) {
    return NextResponse.json({ error: "Missing key or token." }, { status: 400 });
  }

  const verification = verifyToken(token, { key, purpose: "read" });
  if (!verification.valid) {
    return NextResponse.json({ error: `Link invalid or expired (${verification.reason}).` }, { status: 403 });
  }

  if (process.env.STORAGE_DRIVER === "drive") {
    const media = await fetchDriveMediaByKey(key);
    if (!media) {
      return NextResponse.json({ error: "Object not found." }, { status: 404 });
    }
    return new Response(media.body, {
      status: 200,
      headers: {
        "Content-Type": media.contentType,
        ...(media.byteSize > 0 ? { "Content-Length": String(media.byteSize) } : {}),
        "Cache-Control": "private, max-age=0, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const filePath = localObjectPath(key);
  let fileSize: number;
  try {
    const fileStat = await stat(filePath);
    fileSize = fileStat.size;
  } catch {
    return NextResponse.json({ error: "Object not found." }, { status: 404 });
  }

  let contentType = "application/octet-stream";
  try {
    const meta = JSON.parse(await readFile(`${filePath}.meta.json`, "utf8")) as { contentType: string };
    contentType = meta.contentType;
  } catch {
    // Fall back to octet-stream if metadata is somehow missing.
  }

  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(fileSize),
      "Cache-Control": "private, max-age=0, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
