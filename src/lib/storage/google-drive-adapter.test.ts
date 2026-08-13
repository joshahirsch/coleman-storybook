import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { googleDriveStorageAdapter, findOrCreateSubmissionFolder, copyVideoIntoFolder } from "./google-drive-adapter";

/**
 * Only tests the parts of the adapter that don't require a live Google
 * Drive/OAuth setup: key format, and fail-closed behavior when credentials
 * are missing. The actual upload/read/delete calls against the Drive API
 * are NOT covered here — see the file-level comment in
 * google-drive-adapter.ts and docs/google-drive-setup.md.
 */
describe("googleDriveStorageAdapter", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.GOOGLE_DRIVE_CLIENT_ID;
    delete process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
    delete process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    delete process.env.APP_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("builds a key scoped by org/submission/answer with a safe extension", () => {
    const key = googleDriveStorageAdapter.buildKey({
      organizationSlug: "camp-coleman",
      submissionId: "sub-1",
      answerId: "ans-1",
      extension: "webm",
    });
    expect(key).toMatch(/^camp-coleman\/sub-1\/ans-1\/[0-9a-f-]{36}\.webm$/);
  });

  it("sanitizes an unexpected extension rather than trusting it verbatim", () => {
    const key = googleDriveStorageAdapter.buildKey({
      organizationSlug: "camp-coleman",
      submissionId: "sub-1",
      answerId: "ans-1",
      extension: "../../etc",
    });
    expect(key.endsWith(".etc")).toBe(true);
    expect(key).not.toContain("..");
  });

  it("fails closed (throws) when the root folder ID is missing, even before any network call", async () => {
    process.env.GOOGLE_DRIVE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = "test-refresh-token";
    // GOOGLE_DRIVE_ROOT_FOLDER_ID intentionally left unset.
    await expect(googleDriveStorageAdapter.createUploadTarget("some/key", "video/webm")).rejects.toThrow(
      /GOOGLE_DRIVE_ROOT_FOLDER_ID/,
    );
  });

  it("fails closed (throws) when APP_BASE_URL is missing, before any network call — regression test for the 2026-08-13 CORS incident (see createUploadTarget's comment)", async () => {
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = "test-folder-id";
    // APP_BASE_URL intentionally left unset. OAuth credentials also left
    // unset — irrelevant here, since APP_BASE_URL is now resolved before
    // the OAuth token fetch, so this must throw about APP_BASE_URL
    // specifically, not about missing OAuth credentials.
    await expect(googleDriveStorageAdapter.createUploadTarget("some/key", "video/webm")).rejects.toThrow(
      /APP_BASE_URL/,
    );
  });

  it("fails closed (throws) when OAuth credentials are missing", async () => {
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = "test-folder-id";
    // APP_BASE_URL must be set here so createUploadTarget gets past its
    // own config check and reaches the OAuth credential check this test
    // is actually targeting — see the dedicated APP_BASE_URL test above.
    process.env.APP_BASE_URL = "https://example.test";
    // Client ID/secret/refresh token intentionally left unset.
    await expect(googleDriveStorageAdapter.createUploadTarget("some/key", "video/webm")).rejects.toThrow(
      /GOOGLE_DRIVE_CLIENT_ID/,
    );
    await expect(googleDriveStorageAdapter.confirmUpload("some/key")).rejects.toThrow(/GOOGLE_DRIVE_CLIENT_ID/);
    await expect(googleDriveStorageAdapter.deleteObject("some/key")).rejects.toThrow(/GOOGLE_DRIVE_CLIENT_ID/);
  });

  it("findOrCreateSubmissionFolder fails closed when the root folder ID is missing, even before any network call", async () => {
    process.env.GOOGLE_DRIVE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = "test-refresh-token";
    // GOOGLE_DRIVE_ROOT_FOLDER_ID intentionally left unset.
    await expect(findOrCreateSubmissionFolder("jane_smith_08122026")).rejects.toThrow(
      /GOOGLE_DRIVE_ROOT_FOLDER_ID/,
    );
  });

  it("findOrCreateSubmissionFolder and copyVideoIntoFolder fail closed when OAuth credentials are missing", async () => {
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = "test-folder-id";
    // Client ID/secret/refresh token intentionally left unset.
    await expect(findOrCreateSubmissionFolder("jane_smith_08122026")).rejects.toThrow(/GOOGLE_DRIVE_CLIENT_ID/);
    await expect(
      copyVideoIntoFolder("some/key.webm", "q1_jane_smith_08122026.webm", "target-folder-id"),
    ).rejects.toThrow(/GOOGLE_DRIVE_CLIENT_ID/);
  });

  it("getSignedReadUrl never touches the network — always returns our own proxy route", async () => {
    // Deliberately no *Drive* env vars set; if this called the Drive API
    // directly it would throw, same as the other methods above. It does
    // need the (unrelated) signing secret that every adapter's signed URLs
    // share — see signing.test.ts for the equivalent local-adapter setup.
    process.env.STORAGE_SIGNING_SECRET = "test-secret-not-for-production";
    const url = await googleDriveStorageAdapter.getSignedReadUrl("camp-coleman/sub-1/ans-1/file.webm", 300);
    expect(url).toMatch(/^\/api\/media\/read\?key=.+&token=.+$/);
  });
});
