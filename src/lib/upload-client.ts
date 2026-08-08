"use client";

/**
 * XHR-based upload (not fetch) specifically because we need real upload
 * progress events for the contributor-facing progress bar — fetch's
 * streaming upload progress support is inconsistent across the mobile
 * Safari/Chrome versions this product must support (see
 * docs/testing.md "Browser Limitations").
 */
export function uploadWithProgress(
  url: string,
  method: string,
  headers: Record<string, string>,
  blob: Blob,
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
    xhr.send(blob);
  });
}
