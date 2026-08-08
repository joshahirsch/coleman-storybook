import type { TranscriptionProvider } from "./types";
import { fakeTranscriptionProvider } from "./fake";

export * from "./types";

/**
 * Provider selection. Only "fake" is implemented in V1 (see
 * docs/decision-log.md and docs/cost-model.md — no transcription vendor has
 * been selected/funded). Adding a real provider means implementing
 * `TranscriptionProvider` in a new file and returning it here when
 * TRANSCRIPTION_PROVIDER matches its name; no call site changes needed.
 */
export function getTranscriptionProvider(): TranscriptionProvider {
  const provider = process.env.TRANSCRIPTION_PROVIDER ?? "fake";
  switch (provider) {
    case "fake":
      return fakeTranscriptionProvider;
    default:
      throw new Error(
        `Unknown TRANSCRIPTION_PROVIDER "${provider}". Only "fake" is implemented in V1 — see docs/architecture.md Section 1.`,
      );
  }
}
