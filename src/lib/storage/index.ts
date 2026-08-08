import type { MediaStorageAdapter } from "./types";
import { localStorageAdapter } from "./local-adapter";
import { supabaseStorageAdapter } from "./supabase-adapter";

/**
 * Provider-abstraction entry point (docs/architecture.md Section 4).
 *
 * "local" is the dev/test filesystem adapter. "supabase" is the production
 * adapter per the owner's infra decision (docs/decision-log.md DL-008) —
 * see src/lib/storage/supabase-adapter.ts's file-level comment for its
 * verification status: it has NOT yet been exercised against a live
 * Supabase project (no credentials exist in this environment) and has an
 * explicitly flagged open question about the upload contract that must be
 * resolved before it's trusted in production.
 */
export function getStorageAdapter(): MediaStorageAdapter {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  switch (driver) {
    case "local":
      return localStorageAdapter;
    case "supabase":
      return supabaseStorageAdapter;
    default:
      throw new Error(
        `Unknown STORAGE_DRIVER "${driver}". Implemented: "local", "supabase". See docs/deployment.md.`,
      );
  }
}
