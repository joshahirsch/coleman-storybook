"use client";

/**
 * XHR-based upload (not fetch) specifically because we need real upload
 * progress events for the contributor-facing progress bar — fetch's
 * streaming upload progress support is inconsistent across the mobile
 * Safari/Chrome versions this product must support (see
 * docs/testing.md "Browser Limitations").
 *
 * `bodyFormat` comes straight from the storage adapter's `UploadTarget`
 * (src/lib/storage/types.ts) — "raw" sends the blob's bytes directly,
 * "supabase-formdata" wraps it in a multipart/form-data body the way
 * Supabase's own SDK does internally, which its signed-upload-URL endpoint
 * requires (verified against storage-js's source; see
 * src/lib/storage/supabase-adapter.ts for the full explanation). Do NOT
 * set a Content-Type header for the form-data case — the browser sets its
 * own multipart boundary automatically, and overriding it would break the
 * upload.
 */
export function uploadWithProgress(
  url: string,
  method: string,
  headers: Record<string, string>,
  blob: Blob,
  bodyFormat: "raw" | "supabase-formdata",
  onProgress: (fraction: number) => void,
): Promise<{ ok: boolean; status: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.onabort = () => reject(new Error("Upload was cancelled."));

    if (bodyFormat === "supabase-formdata") {
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", blob);
      xhr.send(form);
    } else {
      xhr.send(blob);
    }
  });
}
