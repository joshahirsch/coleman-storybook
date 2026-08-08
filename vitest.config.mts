import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

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
      "@": path.resolve(dirname, "./src"),
    },
  },
});
