import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Chromium is launched with fake camera/mic devices
 * (--use-fake-device-for-media-stream + --use-fake-ui-for-media-stream) so
 * the actual getUserMedia/MediaRecorder contributor flow can be exercised
 * for real, headlessly — not mocked out — including generating real
 * synthetic video frames that MediaRecorder captures and the app uploads.
 * See docs/testing.md.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: {
      // This sandbox ships a pre-installed Chromium at a pinned revision
      // that may not match whatever revision this @playwright/test version
      // would otherwise try to download (and downloading is blocked by the
      // network allowlist anyway) — point at it explicitly.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium",
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
