import { db } from "@/db/client";
import { mediaAssets } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function createPendingMediaAsset(input: {
  submissionAnswerId: string;
  storageKey: string;
  mimeType: string;
}) {
  const [asset] = await db
    .insert(mediaAssets)
    .values({
      submissionAnswerId: input.submissionAnswerId,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      status: "pending",
    })
    .returning();
  return asset;
}

export async function getMediaAssetById(id: string) {
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  return asset ?? null;
}

export async function getMediaAssetByStorageKey(storageKey: string) {
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.storageKey, storageKey)).limit(1);
  return asset ?? null;
}

export async function markMediaAssetConfirmed(
  id: string,
  info: { bytes: number; contentType: string; durationSeconds?: number },
) {
  await db
    .update(mediaAssets)
    .set({
      status: "confirmed",
      byteSize: info.bytes,
      mimeType: info.contentType,
      durationSeconds: info.durationSeconds ?? null,
      confirmedAt: new Date(),
    })
    .where(eq(mediaAssets.id, id));
}

export async function markMediaAssetFailed(id: string) {
  await db.update(mediaAssets).set({ status: "failed" }).where(eq(mediaAssets.id, id));
}
