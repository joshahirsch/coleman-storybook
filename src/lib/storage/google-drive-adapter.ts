import { randomUUID } from "node:crypto";
import type { ConfirmedUpload, MediaStorageAdapter, UploadTarget } from "./types";
import { signToken } from "./signing";

/**
 * Google Drive storage adapter (owner decision, 2026-08-11 — see
 * docs/decision-log.md and coleman-storybook-status project doc for the
 * full rationale: cheaper storage at the owner's existing Google One tier,
 * plus the ability to run backend transcription scripts directly against
 * files already in Drive).
 *
 * Auth model: a single OAuth 2.0 refresh token for the owner's own personal
 * Google account (josh.hirsch@gmail.com), requesting ONLY the
 * `drive.file` scope — Drive's most restrictive scope, which grants access
 * exclusively to files this app itself creates (never the rest of the
 * owner's Drive). This is a deliberate least-privilege choice, not an
 * oversight: it means even a fully compromised token can only read/delete
 * media this app uploaded, nothing else in the owner's account. See
 * `docs/google-drive-setup.md` for the one-time Google Cloud Console setup
 * this requires (OAuth client + consent flow to mint the refresh token) —
 * that setup MUST publish the OAuth consent screen to "In production"
 * status, not leave it in "Testing", or the refresh token silently expires
 * after 7 days (confirmed against Google's own OAuth docs). `drive.file` is
 * a non-sensitive scope, so publishing to production does not require
 * Google's manual verification review.
 *
 * Upload flow mirrors the Supabase adapter's shape exactly (same
 * `MediaStorageAdapter` interface, same "hand the browser a short-lived
 * target and let it PUT directly, never proxy the bytes through our own
 * server" design — this matters because Vercel serverless functions have a
 * request body size cap that a multi-minute video recording could exceed):
 * we open a Google Drive "resumable upload session" server-side (this is
 * the part that needs our OAuth token) and hand the browser the resulting
 * session URL. The browser then PUTs the raw file bytes directly to
 * Google's servers — no Authorization header needed on that PUT, the
 * session URL itself is the credential (confirmed against Google's Drive
 * API upload guide). `bodyFormat: "raw"` is correct here, same as the
 * local adapter — Drive's resumable session accepts a single whole-file PUT
 * with just a Content-Length header, no multipart wrapping like Supabase
 * needs.
 *
 * Reads are proxied through our OWN app (`/api/media/read`, same signed
 * HMAC token as the local adapter — see `signing.ts`) rather than returning
 * a Drive URL directly, because Drive has no first-class time-limited
 * signed-URL primitive the way S3/Supabase Storage do. The proxy route
 * fetches bytes from Drive server-side (using our OAuth token) and streams
 * them back — only ever reachable with a valid, unexpired signed token, so
 * media is never publicly readable (docs/security.md).
 *
 * `key` (the value `buildKey` returns) doubles as the Drive file's `name`
 * field. Because `buildKey` embeds a fresh UUID, names are unique in
 * practice even though Drive itself doesn't enforce name uniqueness. Every
 * other operation (`confirmUpload`, `getSignedReadUrl`'s proxy route,
 * `deleteObject`) looks the file up by `name` within the configured root
 * folder — there is no separate ID-mapping table to keep in sync.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — see docs/google-drive-setup.md and .env.example.`);
  }
  return value;
}

function getRootFolderId(): string {
  return getEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID");
}

/** Escapes a value for safe interpolation into a Drive API `q` search string literal. */
function escapeQueryLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// Cached per warm serverless instance. Cold starts just re-fetch — cheap and
// well within Google's token-endpoint quota for this app's traffic.
let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAtMs - 60_000 > now) {
    return cachedAccessToken.token;
  }

  const clientId = getEnv("GOOGLE_DRIVE_CLIENT_ID");
  const clientSecret = getEnv("GOOGLE_DRIVE_CLIENT_SECRET");
  const refreshToken = getEnv("GOOGLE_DRIVE_REFRESH_TOKEN");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to refresh Google Drive access token (${res.status}): ${body || "no response body"}. ` +
        "If this is an 'invalid_grant' error, the refresh token was likely revoked or (if the OAuth " +
        "consent screen is still in 'Testing' status) expired after 7 days — see docs/google-drive-setup.md.",
    );
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = { token: data.access_token, expiresAtMs: now + data.expires_in * 1000 };
  return data.access_token;
}

/** Looks up a file's Drive metadata by its `name` within the configured root folder. Internal — not part of the public interface. */
async function findFileByKey(key: string): Promise<{ id: string; size?: string; mimeType?: string } | null> {
  const rootFolderId = getRootFolderId();
  const accessToken = await getAccessToken();
  const q = `name = '${escapeQueryLiteral(key)}' and '${escapeQueryLiteral(rootFolderId)}' in parents and trashed = false`;
  const url = `${DRIVE_API}/files?${new URLSearchParams({
    q,
    fields: "files(id,size,mimeType)",
    pageSize: "1",
    spaces: "drive",
  })}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Drive files.list failed (${res.status}) for key "${key}": ${body}`);
  }
  const data = (await res.json()) as { files: { id: string; size?: string; mimeType?: string }[] };
  return data.files[0] ?? null;
}

/**
 * Fetches a file's bytes from Drive by key. Used only by the
 * `/api/media/read` proxy route — mirrors `localObjectPath` in
 * `local-adapter.ts`, which is similarly exported for that same route's
 * exclusive use rather than being part of the `MediaStorageAdapter`
 * interface.
 */
export async function fetchDriveMediaByKey(
  key: string,
): Promise<{ body: ReadableStream<Uint8Array>; contentType: string; byteSize: number } | null> {
  const file = await findFileByKey(key);
  if (!file) return null;

  const accessToken = await getAccessToken();
  const res = await fetch(`${DRIVE_API}/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Drive file download failed (${res.status}) for key "${key}": ${body}`);
  }

  return {
    body: res.body,
    contentType: file.mimeType ?? "application/octet-stream",
    byteSize: file.size ? Number(file.size) : 0,
  };
}

/**
 * Uploads a buffer we already hold server-side, in one request, under the
 * given key. Used ONLY by the one-time Supabase→Drive migration route
 * (`/api/admin/migrate-media-to-drive`) — everyday contributor uploads go
 * through `createUploadTarget`'s resumable-session/direct-PUT-from-browser
 * path instead, specifically so large recordings never pass through our
 * own server (see the file-level comment). A one-time admin-triggered
 * migration of a handful of already-uploaded files is exactly the case
 * where routing bytes through our server is fine — there's no other way to
 * move bytes that already live in a different provider's bucket.
 *
 * Uses Drive's single-request `multipart` upload (metadata + data in one
 * POST), not the resumable protocol — simpler when the whole buffer is
 * already in memory and doesn't need to be handed to an untrusted client.
 */
export async function uploadBufferToDriveForMigration(
  key: string,
  contentType: string,
  data: Buffer,
): Promise<{ id: string; bytes: number }> {
  const rootFolderId = getRootFolderId();
  const accessToken = await getAccessToken();

  const boundary = `coleman-storybook-migration-${randomUUID()}`;
  const metadata = JSON.stringify({ name: key, parents: [rootFolderId] });
  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
    "utf8",
  );
  const closing = Buffer.from(`\r\n--${boundary}--`, "utf8");
  const body = Buffer.concat([preamble, data, closing]);

  const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,size`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Google Drive multipart upload failed for "${key}" (${res.status}): ${errBody}`);
  }

  const result = (await res.json()) as { id: string; size?: string };
  return { id: result.id, bytes: result.size ? Number(result.size) : data.byteLength };
}

export const googleDriveStorageAdapter: MediaStorageAdapter = {
  buildKey({ organizationSlug, submissionId, answerId, extension }) {
    const safeExt = extension.replace(/[^a-z0-9]/gi, "").slice(0, 10) || "bin";
    return `${organizationSlug}/${submissionId}/${answerId}/${randomUUID()}.${safeExt}`;
  },

  async createUploadTarget(key, contentType): Promise<UploadTarget> {
    const rootFolderId = getRootFolderId();
    const accessToken = await getAccessToken();
    const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=resumable`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": contentType,
      },
      body: JSON.stringify({ name: key, parents: [rootFolderId] }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Failed to open Google Drive resumable upload session for "${key}" (${res.status}): ${body}`);
    }

    const sessionUrl = res.headers.get("Location");
    if (!sessionUrl) {
      throw new Error(`Google Drive did not return a resumable session URL for "${key}" (missing Location header).`);
    }

    return {
      method: "PUT",
      url: sessionUrl,
      headers: { "Content-Type": contentType },
      bodyFormat: "raw",
      // Drive resumable session URIs are valid for one week; we advertise a
      // much shorter window since a contributor's actual recording session
      // is minutes, not days, and a short expiry limits how long a leaked
      // session URL would be usable.
      expiresInSeconds: 2 * 60 * 60,
    };
  },

  async confirmUpload(key): Promise<ConfirmedUpload | null> {
    const file = await findFileByKey(key);
    if (!file || !file.size) return null;
    return { bytes: Number(file.size), contentType: file.mimeType ?? "application/octet-stream" };
  },

  async getSignedReadUrl(key, expiresInSeconds) {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const token = signToken({ key, purpose: "read", exp });
    return `/api/media/read?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`;
  },

  async deleteObject(key) {
    const file = await findFileByKey(key);
    if (!file) return;
    const accessToken = await getAccessToken();
    const res = await fetch(`${DRIVE_API}/files/${file.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 404) {
      const body = await res.text().catch(() => "");
      throw new Error(`Failed to delete Google Drive file for key "${key}" (${res.status}): ${body}`);
    }
  },
};
