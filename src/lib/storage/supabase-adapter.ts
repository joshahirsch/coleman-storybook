import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { ConfirmedUpload, MediaStorageAdapter, UploadTarget } from "./types";

/**
 * Supabase Storage adapter — the production `MediaStorageAdapter`
 * implementation chosen per the owner's infra decision (Vercel + Supabase
 * for both Postgres and Storage; see docs/decision-log.md DL-008 and
 * docs/deployment.md).
 *
 * UPDATE 2026-08-11 — root-caused the first real live-bucket upload
 * failure ("Unexpected end of JSON input" on the contributor-facing
 * upload step). Two bugs, now fixed:
 *
 * 1. The previously-flagged open question about the raw-HTTP contract for
 *    a signed-upload-URL token is now resolved by reading storage-js's own
 *    source directly (`packages/StorageFileApi.ts`, `uploadToSignedUrl`),
 *    not guessed at. Two things a bare PUT was missing: (a) the request
 *    body must be `multipart/form-data` with a `cacheControl` field and
 *    the file itself appended under an empty-string field name — a raw
 *    bytes body is rejected; (b) Supabase's API gateway requires an
 *    `apikey` header (or `apikey` query param) on every /storage/v1/*
 *    request, including signed-upload-token consumption — without it the
 *    gateway returns "No API key found in request" before the token is
 *    even checked. `createUploadTarget` below now returns the exact
 *    headers/body-format the client needs (see `bodyFormat` on
 *    `UploadTarget` and `src/lib/upload-client.ts`) instead of assuming a
 *    generic PUT works.
 * 2. `src/app/api/uploads/init/route.ts` and `.../confirm/route.ts` did not
 *    wrap adapter calls in try/catch, so any thrown error (e.g. the one
 *    above) produced a bare empty 500 with no JSON body — which is what
 *    actually surfaced client-side as "Unexpected end of JSON input"
 *    rather than a legible error message. Both routes now return a
 *    structured JSON error on failure.
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

/**
 * The browser-side upload PUT must carry this as an `apikey` header (see
 * the file-level comment above) — Supabase's storage gateway rejects
 * requests without one, even against a valid signed-upload token. The anon
 * key is meant to be public/embeddable in client code; it grants no
 * storage access on its own, the signed token does that.
 */
function getAnonKey(): string {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error(
      "SUPABASE_ANON_KEY is not set — see .env.example. Required so the browser's " +
        "upload PUT carries a valid apikey header; Supabase's gateway rejects " +
        "storage requests without one even when a valid signed-upload token is present.",
    );
  }
  return anonKey;
}

export const supabaseStorageAdapter: MediaStorageAdapter = {
  buildKey({ organizationSlug, submissionId, answerId, extension }) {
    const safeExt = extension.replace(/[^a-z0-9]/gi, "").slice(0, 10) || "bin";
    return `${organizationSlug}/${submissionId}/${answerId}/${randomUUID()}.${safeExt}`;
  },

  async createUploadTarget(key): Promise<UploadTarget> {
    const client = getClient();
    const anonKey = getAnonKey();
    const { data, error } = await client.storage.from(getBucket()).createSignedUploadUrl(key);
    if (error || !data) {
      throw new Error(`Failed to create Supabase signed upload URL for "${key}": ${error?.message ?? "unknown error"}`);
    }
    // Supabase's signed-upload token is valid for 2 hours per their docs.
    // `url` is Supabase's `signedUrl` (already includes the token as a
    // query param). `headers` carries what a raw client-side PUT actually
    // needs against this endpoint, verified against storage-js's own
    // `uploadToSignedUrl` source rather than assumed — see the file-level
    // comment above. `bodyFormat: "supabase-formdata"` tells the client
    // (src/lib/upload-client.ts) to wrap the file in multipart/form-data
    // instead of sending raw bytes, which this endpoint requires.
    return {
      method: "PUT",
      url: data.signedUrl,
      headers: { "x-upsert": "false", apikey: anonKey },
      bodyFormat: "supabase-formdata",
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
