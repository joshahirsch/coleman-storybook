import type { MediaStorageAdapter } from "./types";
import { localStorageAdapter } from "./local-adapter";
import { supabaseStorageAdapter } from "./supabase-adapter";
import { googleDriveStorageAdapter } from "./google-drive-adapter";

/**
 * Provider-abstraction entry point (docs/architecture.md Section 4).
 *
 * "local" is the dev/test filesystem adapter. "supabase" was the original
 * production adapter (docs/decision-log.md DL-008), verified live
 * 2026-08-11 — see src/lib/storage/supabase-adapter.ts's file-level
 * comment. "drive" is the current production adapter as of the 2026-08-11
 * Google Drive migration (cheaper storage at the owner's existing Google
 * One tier, plus direct backend access for future transcription scripts) —
 * see src/lib/storage/google-drive-adapter.ts's file-level comment and
 * docs/google-drive-setup.md for the one-time OAuth setup it requires. The
 * Supabase adapter is left in place (not deleted) in case of rollback.
 */
export function getStorageAdapter(): MediaStorageAdapter {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  switch (driver) {
    case "local":
      return localStorageAdapter;
    case "supabase":
      return supabaseStorageAdapter;
    case "drive":
      return googleDriveStorageAdapter;
    default:
      throw new Error(
        `Unknown STORAGE_DRIVER "${driver}". Implemented: "local", "supabase", "drive". See docs/deployment.md.`,
      );
  }
}
