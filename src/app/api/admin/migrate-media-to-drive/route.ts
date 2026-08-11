import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { mediaAssets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAdminSession } from "@/lib/auth/session";
import { supabaseStorageAdapter } from "@/lib/storage/supabase-adapter";
import { uploadBufferToDriveForMigration } from "@/lib/storage/google-drive-adapter";

/**
 * ONE-TIME migration: copies every confirmed media asset from Supabase
 * Storage to Google Drive, keeping the exact same `storageKey` (Drive
 * `name`) so no database rows need to change — flipping `STORAGE_DRIVER`
 * from "supabase" to "drive" afterwards is all that's needed for the app
 * to find them (see src/lib/storage/index.ts).
 *
 * Deliberately reads/writes the two adapters directly rather than going
 * through `getStorageAdapter()`, because during migration `STORAGE_DRIVER`
 * is still "supabase" in production — this route needs both backends at
 * once, which the single-active-adapter abstraction doesn't model (nor
 * should it, outside this one-off use).
 *
 * Does NOT delete anything from Supabase — the originals stay there as a
 * rollback path until the owner is satisfied the Drive copies are good.
 *
 * Gated by admin session (not CRON_SECRET) because this is a manual,
 * human-triggered, run-it-once action, not a recurring scheduled job.
 * Safe to call more than once: each file is re-uploaded to Drive (Drive
 * doesn't error on duplicate names), so an accidental second run just
 * costs a little wasted API time, not data loss — this endpoint should be
 * removed once migration is confirmed done (see docs/google-drive-setup.md).
 */
export async function POST() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const assets = await db
    .select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey, mimeType: mediaAssets.mimeType })
    .from(mediaAssets)
    .where(eq(mediaAssets.status, "confirmed"));

  const results: { key: string; ok: boolean; bytes?: number; error?: string }[] = [];

  for (const asset of assets) {
    try {
      const readUrl = await supabaseStorageAdapter.getSignedReadUrl(asset.storageKey, 300);
      const sourceRes = await fetch(readUrl);
      if (!sourceRes.ok) {
        throw new Error(`Failed to fetch source object from Supabase (${sourceRes.status})`);
      }
      const buffer = Buffer.from(await sourceRes.arrayBuffer());

      const uploaded = await uploadBufferToDriveForMigration(asset.storageKey, asset.mimeType, buffer);

      if (uploaded.bytes !== buffer.byteLength) {
        throw new Error(
          `Byte size mismatch after upload: source was ${buffer.byteLength}, Drive reports ${uploaded.bytes}`,
        );
      }

      results.push({ key: asset.storageKey, ok: true, bytes: uploaded.bytes });
    } catch (err) {
      results.push({ key: asset.storageKey, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;

  return NextResponse.json({ total: results.length, succeeded, failed, results });
}
