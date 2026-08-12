import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resendEmailProvider } from "./resend-provider";

/**
 * Only tests fail-closed behavior when credentials are missing — the
 * actual send call against Resend's live API is NOT covered here (needs a
 * real account/API key, which does not exist in this environment). Same
 * scoping as supabase-adapter.test.ts / google-drive-adapter.test.ts.
 */
describe("resendEmailProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("fails closed when RESEND_API_KEY is missing", async () => {
    process.env.RESEND_FROM_EMAIL = "noreply@example.com";
    await expect(
      resendEmailProvider.sendVerificationCode({ to: "jane@example.com", code: "123456" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("fails closed when RESEND_FROM_EMAIL is missing", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    await expect(
      resendEmailProvider.sendVerificationCode({ to: "jane@example.com", code: "123456" }),
    ).rejects.toThrow(/RESEND_FROM_EMAIL/);
  });
});
