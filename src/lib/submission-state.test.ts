import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  canTransitionEditorial,
  isDurablySubmitted,
  InvalidSubmissionTransitionError,
} from "./submission-state";

describe("submission state machine", () => {
  it("allows the expected happy-path sequence", () => {
    expect(canTransition("STARTED", "RECORDING")).toBe(true);
    expect(canTransition("RECORDING", "UPLOADING")).toBe(true);
    expect(canTransition("UPLOADING", "SUBMITTED")).toBe(true);
    expect(canTransition("SUBMITTED", "PROCESSING")).toBe(true);
    expect(canTransition("PROCESSING", "READY_FOR_REVIEW")).toBe(true);
  });

  it("allows processing failure and retry", () => {
    expect(canTransition("PROCESSING", "PROCESSING_FAILED")).toBe(true);
    expect(canTransition("PROCESSING_FAILED", "PROCESSING")).toBe(true);
  });

  it("rejects skipping states (e.g. STARTED straight to SUBMITTED)", () => {
    expect(canTransition("STARTED", "SUBMITTED")).toBe(false);
  });

  it("rejects transitions out of a terminal WITHDRAWN state", () => {
    expect(canTransition("WITHDRAWN", "STARTED")).toBe(false);
    expect(canTransition("WITHDRAWN", "PROCESSING")).toBe(false);
  });

  it("rejects READY_FOR_REVIEW going back to PROCESSING directly (must go through re-processing explicitly)", () => {
    expect(canTransition("READY_FOR_REVIEW", "PROCESSING")).toBe(false);
  });

  it("assertTransition throws a typed error on an invalid transition", () => {
    expect(() => assertTransition("STARTED", "READY_FOR_REVIEW")).toThrow(InvalidSubmissionTransitionError);
  });

  it("assertTransition does not throw on a valid transition", () => {
    expect(() => assertTransition("STARTED", "RECORDING")).not.toThrow();
  });

  it("isDurablySubmitted is false until SUBMITTED is reached", () => {
    expect(isDurablySubmitted("STARTED")).toBe(false);
    expect(isDurablySubmitted("RECORDING")).toBe(false);
    expect(isDurablySubmitted("UPLOADING")).toBe(false);
    expect(isDurablySubmitted("SUBMITTED")).toBe(true);
    expect(isDurablySubmitted("PROCESSING")).toBe(true);
    expect(isDurablySubmitted("READY_FOR_REVIEW")).toBe(true);
    expect(isDurablySubmitted("PROCESSING_FAILED")).toBe(true);
  });

  it("editorial state allows admins to change their mind either direction", () => {
    expect(canTransitionEditorial("PENDING", "APPROVED")).toBe(true);
    expect(canTransitionEditorial("APPROVED", "REJECTED")).toBe(true);
    expect(canTransitionEditorial("REJECTED", "APPROVED")).toBe(true);
    expect(canTransitionEditorial("APPROVED", "PENDING")).toBe(true);
  });
});
