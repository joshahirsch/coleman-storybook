import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { ConfirmedUpload, MediaStorageAdapter, UploadTarget } from "./types";

/**
 * Supabase Storage adapter — the production `MediaStorageAdapter`
 * implementation chosen per the owner's infra decision (Vercel + Supabase
 * for both Postgres and Storage; see docs/decision-log.md DL-008 and
 * docs/deployment.md).
 *
 * IMPORTANT — VERIFICATION STATUS: this file has been written against
 * Supabase's documented JS SDK methods (`createSignedUploadUrl`,
 * `createSignedUrl`, `list`, `remove`) but has NOT been exercised against a
 * live Supabase project, because no real SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY credentials exist in this development
 * environment. Do not treat this as tested/production-verified code — it
 * needs a real bucket and a real end-to-end upload/read/delete cycle run
 * against it before Phase 14 launch (see docs/production-launch-checklist.md).
 *
 * A specific unresolved question this review surfaced (see the comment on
 * `createUploadTarget` below): Supabase's raw-HTTP contract for uploading to
 * a signed-upload-URL token is not fully documented publicly (confirmed by
 * checking Supabase's own docs and community discussion threads while
 * writing this file). The officially supported path is the JS SDK's
 * `uploadToSignedUrl(path, token, file)` method, not a generic PUT — so
 * the browser-side upload code (`src/lib/upload-client.ts`, currently a
 * generic XMLHttpRequest PUT built for the local dev adapter) will very
 * likely need a Supabase-specific branch that uses the Supabase JS SDK
 * client-side, rather than assuming the existing generic PUT works
 * unmodified against this adapter's returned UploadTarget. Flagging this
 * explicitly rather than guessing at an unverified raw-HTTP shape and
 * presenting it as done.
 */

let cachedClient: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — see .env.example. " +
        "The service role key is used server-side only and must never be exposed to the browser.",
    );
  }
  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cachedClient;
}

function getBucket(): string {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!bucket) {
    throw new Error("SUPABASE_STORAGE_BUCKET is not set — see .env.example.");
  }
  return bucket;
}

export const supabaseStorageAdapter: MediaStorageAdapter = {
  buildKey({ organizationSlug, submissionId, answerId, extension }) {
    const safeExt = extension.replace(/[^a-z0-9]/gi, "").slice(0, 10) || "bin";
    return `${organizationSlug}/${submissionId}/${answerId}/${randomUUID()}.${safeExt}`;
  },

  async createUploadTarget(key): Promise<UploadTarget> {
    const client = getClient();
    const { data, error } = await client.storage.from(getBucket()).createSignedUploadUrl(key);
    if (error || !data) {
      throw new Error(`Failed to create Supabase signed upload URL for "${key}": ${error?.message ?? "unknown error"}`);
    }
    // Supabase's signed-upload token is valid for 2 hours per their docs.
    // See the file-level comment above re: the unverified raw-HTTP upload
    // contract — `url` here is Supabase's `signedUrl`, and `headers`
    // carries the token in case the eventual client-side implementation
    // needs it as a header rather than embedded in the URL/SDK call.
    return {
      method: "PUT",
      url: data.signedUrl,
      headers: { "x-upsert": "false" },
      expiresInSeconds: 2 * 60 * 60,
    };
  },

  async confirmUpload(key): Promise<ConfirmedUpload | null> {
    const client = getClient();
    const lastSlash = key.lastIndexOf("/");
    const dir = lastSlash === -1 ? "" : key.slice(0, lastSlash);
    const filename = lastSlash === -1 ? key : key.slice(lastSlash + 1);

    const { data, error } = await client.storage.from(getBucket()).list(dir, {
      search: filename,
      limit: 1,
    });
    if (error || !data || data.length === 0) return null;

    const object = data[0];
    const bytes = object.metadata?.size;
    const contentType = object.metadata?.mimetype;
    if (typeof bytes !== "number" || typeof contentType !== "string") return null;

    return { bytes, contentType };
  },

  async getSignedReadUrl(key, expiresInSeconds) {
    const client = getClient();
    const { data, error } = await client.storage.from(getBucket()).createSignedUrl(key, expiresInSeconds);
    if (error || !data) {
      throw new Error(`Failed to create Supabase signed read URL for "${key}": ${error?.message ?? "unknown error"}`);
    }
    return data.signedUrl;
  },

  async deleteObject(key) {
    const client = getClient();
    await client.storage.from(getBucket()).remove([key]);
  },
};
