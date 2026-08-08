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

/**
 * Owner decision (docs/decision-log.md DL-009): hold off on a real
 * transcription/AI vendor for the initial POC pilot to keep costs at zero.
 * Setting TRANSCRIPTION_PROVIDER=none disables the processing pipeline
 * entirely for real submissions — see the call site in
 * src/lib/actions/public-actions.ts. This is deliberately NOT the same as
 * leaving it on "fake": running the fake/synthetic provider against a real
 * contributor's real recording would generate a fabricated, unrelated
 * "SYNTHETIC" placeholder transcript next to their real video, which is
 * misleading in a real review context even with the badge. "none" instead
 * skips processing so admins review the raw recording directly — fully
 * supported already since editorial review never depended on a transcript
 * existing (docs/data-model.md "Dual State Machines").
 */
export function isProcessingPipelineEnabled(): boolean {
  return (process.env.TRANSCRIPTION_PROVIDER ?? "fake") !== "none";
}
