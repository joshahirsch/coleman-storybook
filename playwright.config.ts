import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// This sandbox ships a pre-installed Chromium at a pinned revision (network
// access to Playwright's own browser-download CDN is blocked here) and
// PLAYWRIGHT_CHROMIUM_PATH/the hardcoded fallback point at it explicitly.
// Neither exists on a normal CI runner or a developer's machine, where
// `npx playwright install chromium` manages its own browser — so only pass
// executablePath when one of those paths actually exists; otherwise leave it
// undefined and let Playwright resolve its managed browser normally.
const sandboxChromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const chromiumExecutablePath = existsSync(sandboxChromiumPath) ? sandboxChromiumPath : undefined;

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
      executablePath: chromiumExecutablePath,
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
