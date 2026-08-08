/**
 * Submission processing lifecycle state machine.
 *
 * Deliberately separate from editorial state (src/lib/editorial-state.ts) —
 * see docs/architecture.md Section 6 and the spec's explicit instruction not
 * to collapse these into ambiguous booleans.
 */

export type SubmissionState =
  | "STARTED"
  | "RECORDING"
  | "UPLOADING"
  | "SUBMITTED"
  | "PROCESSING"
  | "READY_FOR_REVIEW"
  | "PROCESSING_FAILED"
  | "WITHDRAWN";

const ALLOWED_TRANSITIONS: Record<SubmissionState, SubmissionState[]> = {
  STARTED: ["RECORDING", "WITHDRAWN"],
  RECORDING: ["UPLOADING", "STARTED", "WITHDRAWN"],
  UPLOADING: ["SUBMITTED", "RECORDING", "WITHDRAWN"],
  SUBMITTED: ["PROCESSING", "WITHDRAWN"],
  PROCESSING: ["READY_FOR_REVIEW", "PROCESSING_FAILED"],
  READY_FOR_REVIEW: ["WITHDRAWN"],
  PROCESSING_FAILED: ["PROCESSING", "WITHDRAWN"],
  WITHDRAWN: [],
};

export function canTransition(from: SubmissionState, to: SubmissionState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export class InvalidSubmissionTransitionError extends Error {
  constructor(from: SubmissionState, to: SubmissionState) {
    super(`Invalid submission state transition: ${from} -> ${to}`);
    this.name = "InvalidSubmissionTransitionError";
  }
}

export function assertTransition(from: SubmissionState, to: SubmissionState): void {
  if (!canTransition(from, to)) {
    throw new InvalidSubmissionTransitionError(from, to);
  }
}

/** A submission is only "durably successful" once it reaches this state — never earlier, and never based on client claims alone. */
export function isDurablySubmitted(state: SubmissionState): boolean {
  return state === "SUBMITTED" || state === "PROCESSING" || state === "READY_FOR_REVIEW" || state === "PROCESSING_FAILED";
}

export type EditorialState = "PENDING" | "APPROVED" | "REJECTED";

const EDITORIAL_TRANSITIONS: Record<EditorialState, EditorialState[]> = {
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["REJECTED", "PENDING"],
  REJECTED: ["APPROVED", "PENDING"],
};

export function canTransitionEditorial(from: EditorialState, to: EditorialState): boolean {
  return EDITORIAL_TRANSITIONS[from]?.includes(to) ?? false;
}
