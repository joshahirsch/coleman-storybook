import type { MediaStorageAdapter } from "./types";
import { localStorageAdapter } from "./local-adapter";

/**
 * Provider-abstraction entry point (docs/architecture.md Section 4). V1
 * ships only the local adapter because no Supabase/S3/R2 credentials have
 * been supplied yet (per project principle: do not request credentials
 * until actually needed). Swapping in a real cloud adapter later means
 * adding a new file that implements `MediaStorageAdapter` and returning it
 * here based on `STORAGE_DRIVER` — no call site changes required.
 */
export function getStorageAdapter(): MediaStorageAdapter {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  switch (driver) {
    case "local":
      return localStorageAdapter;
    default:
      throw new Error(
        `Unknown STORAGE_DRIVER "${driver}". Only "local" is implemented in V1 — see docs/architecture.md Section 1 for the planned Supabase/S3/R2 swap-in.`,
      );
  }
}
