import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { supabaseStorageAdapter } from "./supabase-adapter";

/**
 * Only tests the parts of the adapter that don't require a live Supabase
 * project: key format, and fail-closed behavior when credentials are
 * missing. The actual upload/read/delete calls against Supabase's API are
 * NOT covered here — see the file-level comment in supabase-adapter.ts.
 * They need a real bucket to test against, which does not exist in this
 * environment.
 */
describe("supabaseStorageAdapter", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_STORAGE_BUCKET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("builds a key scoped by org/submission/answer with a safe extension", () => {
    const key = supabaseStorageAdapter.buildKey({
      organizationSlug: "camp-coleman",
      submissionId: "sub-1",
      answerId: "ans-1",
      extension: "webm",
    });
    expect(key).toMatch(/^camp-coleman\/sub-1\/ans-1\/[0-9a-f-]{36}\.webm$/);
  });

  it("sanitizes an unexpected extension rather than trusting it verbatim", () => {
    const key = supabaseStorageAdapter.buildKey({
      organizationSlug: "camp-coleman",
      submissionId: "sub-1",
      answerId: "ans-1",
      extension: "../../etc",
    });
    expect(key.endsWith(".etc")).toBe(true);
    expect(key).not.toContain("..");
  });

  it("fails closed (throws) rather than silently proceeding when Supabase credentials are missing", async () => {
    await expect(supabaseStorageAdapter.createUploadTarget("some/key", "video/webm")).rejects.toThrow(
      /SUPABASE_URL/,
    );
    await expect(supabaseStorageAdapter.getSignedReadUrl("some/key", 600)).rejects.toThrow(/SUPABASE_URL/);
  });
});
