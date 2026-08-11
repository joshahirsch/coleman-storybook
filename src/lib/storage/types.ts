/**
 * Media storage adapter interface. See docs/architecture.md Section 4.
 *
 * Every recording is sensitive testimonial media (docs/security.md) — no
 * implementation of this interface may make objects publicly readable by
 * default. Reads only ever happen through `getSignedReadUrl`.
 */
export interface UploadTarget {
  method: "PUT";
  url: string;
  headers?: Record<string, string>;
  /** Seconds until this upload target itself expires (separate from read-URL expiry). */
  expiresInSeconds: number;
  /**
   * How the client must construct the PUT body.
   *
   * "raw" — send the file's bytes directly as the request body. This is
   * what the local/dev adapter (and any future raw-object-storage adapter
   * like S3/R2) expects.
   *
   * "supabase-formdata" — Supabase's signed-upload-URL endpoint does NOT
   * accept a raw-bytes body, even though it takes a PUT. Its own SDK
   * (`uploadToSignedUrl`) always wraps the file in a `multipart/form-data`
   * body with a `cacheControl` field and the file itself under an
   * empty-string field name — confirmed directly against storage-js's
   * source (`packages/StorageFileApi.ts`), not assumed. See
   * `supabase-adapter.ts` and `upload-client.ts` for the full explanation.
   * A raw-bytes PUT against this URL fails.
   */
  bodyFormat: "raw" | "supabase-formdata";
}

export interface ConfirmedUpload {
  bytes: number;
  contentType: string;
}

export interface MediaStorageAdapter {
  /** Generate an object key. Callers should not construct keys by hand. */
  buildKey(parts: { organizationSlug: string; submissionId: string; answerId: string; extension: string }): string;

  /** Returns a short-lived target the client can PUT the raw media bytes to directly. */
  createUploadTarget(key: string, contentType: string): Promise<UploadTarget>;

  /**
   * Re-verifies (server-side) that the object actually exists and returns its
   * real size/content-type. Callers MUST treat a null return as "upload did
   * not happen" and must never mark a submission durable based on the
   * client's claim alone (see docs/architecture.md Section 7).
   */
  confirmUpload(key: string): Promise<ConfirmedUpload | null>;

  /** Time-limited signed URL for admin playback/download. Never a public URL. */
  getSignedReadUrl(key: string, expiresInSeconds: number): Promise<string>;

  deleteObject(key: string): Promise<void>;
}
