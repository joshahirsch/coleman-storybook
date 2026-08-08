import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests use *.test.ts (not *.spec.ts, which is reserved for Playwright
// E2E specs under e2e/ — see playwright.config.ts) to keep the two runners
// from ever picking up each other's files.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
