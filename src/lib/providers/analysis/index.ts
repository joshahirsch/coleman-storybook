import type { StoryAnalysisProvider } from "./types";
import { fakeAnalysisProvider } from "./fake";

export * from "./types";

export function getAnalysisProvider(): StoryAnalysisProvider {
  const provider = process.env.AI_ANALYSIS_PROVIDER ?? "fake";
  switch (provider) {
    case "fake":
      return fakeAnalysisProvider;
    default:
      throw new Error(
        `Unknown AI_ANALYSIS_PROVIDER "${provider}". Only "fake" is implemented in V1 — see docs/architecture.md Section 1.`,
      );
  }
}
