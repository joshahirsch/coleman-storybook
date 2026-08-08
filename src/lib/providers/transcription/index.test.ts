import { describe, it, expect, afterEach } from "vitest";
import { isProcessingPipelineEnabled } from "./index";

describe("isProcessingPipelineEnabled", () => {
  const original = process.env.TRANSCRIPTION_PROVIDER;

  afterEach(() => {
    if (original === undefined) delete process.env.TRANSCRIPTION_PROVIDER;
    else process.env.TRANSCRIPTION_PROVIDER = original;
  });

  it("defaults to enabled when TRANSCRIPTION_PROVIDER is unset (dev default is fake)", () => {
    delete process.env.TRANSCRIPTION_PROVIDER;
    expect(isProcessingPipelineEnabled()).toBe(true);
  });

  it("is enabled for the fake dev/test provider", () => {
    process.env.TRANSCRIPTION_PROVIDER = "fake";
    expect(isProcessingPipelineEnabled()).toBe(true);
  });

  it("is disabled when explicitly set to none (owner POC cost decision, DL-009)", () => {
    process.env.TRANSCRIPTION_PROVIDER = "none";
    expect(isProcessingPipelineEnabled()).toBe(false);
  });
});
