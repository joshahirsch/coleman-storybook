/**
 * Small pure helpers for parsing the app's own storage-key format
 * (`<org-slug>/<submission-id>/<answer-id>/<uuid>.<ext>` — see
 * `buildKey` in each storage adapter). Kept in their own file, separate
 * from `src/lib/submission-packaging.ts`, specifically so they can be unit
 * tested without pulling in that module's DB-touching import chain
 * (`submission-packaging.ts` -> `src/lib/data/submissions.ts` ->
 * `src/db/client.ts`, which throws at import time if `DATABASE_URL` isn't
 * set — fine in the running app/Vercel, but would crash a test file that
 * only wants this one pure function).
 */

/**
 * Extracts the file extension (no leading dot) from a storage key, e.g.
 * "camp-coleman/.../<uuid>.webm" -> "webm". `buildKey` always appends a
 * sanitized extension, so this should always match — the "bin" fallback
 * exists only so this function is total, not because it's expected to
 * trigger in practice.
 */
export function extensionFromStorageKey(key: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(key);
  return match ? match[1] : "bin";
}
