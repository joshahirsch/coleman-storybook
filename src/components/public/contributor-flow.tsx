"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  beginUploadAction,
  finalizeSubmissionAction,
  sendVerificationCodeAction,
  startSubmissionAction,
  submitConsentAction,
  submitSuggestedQuestionAction,
  verifyEmailCodeAction,
} from "@/lib/actions/public-actions";
import { uploadWithProgress } from "@/lib/upload-client";
import { PERMITTED_USE_CLASSIFICATIONS, type PermittedUseClassification } from "@/lib/consent";

type Relationship = "camper" | "staff" | "camper_staff" | "parent" | "alumni_parent" | "volunteer" | "other";

const RELATIONSHIP_OPTIONS: { value: Relationship; label: string }[] = [
  { value: "alumni_parent", label: "Alumni (former camper)" },
  { value: "staff", label: "Staff (current or former)" },
  { value: "camper_staff", label: "Camper and staff" },
  { value: "parent", label: "Parent" },
  { value: "volunteer", label: "Volunteer" },
  { value: "other", label: "Other Coleman community member" },
];

interface AnswerPrompt {
  id: string;
  prompt: string;
  helpText: string | null;
  order: number;
}

interface AnswerRecording {
  blob: Blob | null;
  approved: boolean;
  storageKey: string | null;
  uploadProgress: number; // 0..1
  uploadState: "idle" | "uploading" | "confirming" | "done" | "error";
  uploadError: string | null;
}

type Step =
  | "identity"
  | "verify-email"
  | "consent"
  | "permissions"
  | "record"
  | "uploading"
  | "complete"
  | "unrecoverable-error";

const OTP_RESEND_COOLDOWN_SECONDS = 30;

const MAX_RETRY_ATTEMPTS = 2;

/**
 * The identity and consent steps call Server Actions, which the browser
 * invokes as a `fetch()` RPC under the hood. A genuine network failure
 * (offline, DNS, connection refused, CORS) makes `fetch()` reject with a
 * `TypeError` specifically; any *other* rejection means the server itself
 * threw while handling the request (a bug, a misconfiguration — e.g. the
 * incident on 2026-08-09 where a too-short SESSION_SECRET made the consent
 * step fail this way). Those two cases used to be shown as the same
 * "Network error — please check your connection" message, which was
 * actively misleading for the second case and made it much harder to
 * diagnose. This distinguishes them without exposing internal error
 * details (stack traces, secrets) to contributors.
 */
function describeSubmitError(err: unknown): string {
  if (err instanceof TypeError) {
    return "Network error — please check your connection and try again.";
  }
  return "Something went wrong on our end. Please try again in a moment — if it keeps happening, let us know.";
}

export function ContributorFlow({
  campaignSlug,
  campaignTitle,
  completionHeadline,
  completionCopy,
}: {
  campaignSlug: string;
  campaignTitle: string;
  completionHeadline: string | null;
  completionCopy: string | null;
}) {
  const [step, setStep] = useState<Step>("identity");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Identity form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  // Multi-select as of 2026-08-13 — a contributor can be e.g. both alumni
  // and current staff, so this is checked options rather than one radio
  // choice. Defaults to the campaign's primary audience pre-checked (same
  // default this field always had as a single-select) so the common case
  // still needs zero clicks; toggling adds/removes from the set.
  const [relationship, setRelationship] = useState<Relationship[]>(["alumni_parent"]);
  const [yearsAssociated, setYearsAssociated] = useState("");
  const [isAdultConfirmed, setIsAdultConfirmed] = useState(false);

  // Email verification (OTP) step state
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpResending, setOtpResending] = useState(false);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);

  // Submission state (populated once identity step succeeds)
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [consentVersion, setConsentVersion] = useState<string | null>(null);
  const [consentText, setConsentText] = useState<string | null>(null);
  const [maxDurationSeconds, setMaxDurationSeconds] = useState(180);
  const [answers, setAnswers] = useState<AnswerPrompt[]>([]);
  const [recordings, setRecordings] = useState<Record<string, AnswerRecording>>({});

  // Consent step state
  const [permittedUse, setPermittedUse] = useState<PermittedUseClassification>("full_permitted_use");
  const [consentAccepted, setConsentAccepted] = useState(false);

  // Camera/mic state
  const [permissionState, setPermissionState] = useState<"idle" | "requesting" | "granted" | "denied" | "error">(
    "idle",
  );
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  // Recording step state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "recorded">("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);

  // Upload step state
  const [uploadOverallError, setUploadOverallError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  // Completion step state -- the optional "what should we ask next?" box.
  // Everything here is post-submission: the story is already saved by the
  // time this screen renders, so none of this can affect it.
  const [suggestion, setSuggestion] = useState("");
  const [suggestionState, setSuggestionState] = useState<"idle" | "saving" | "saved">("idle");
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  async function submitSuggestion() {
    if (!submissionId || suggestionState === "saving") return;
    const trimmed = suggestion.trim();
    if (!trimmed) {
      setSuggestionError("Type a question first.");
      return;
    }
    setSuggestionError(null);
    setSuggestionState("saving");
    try {
      const result = await submitSuggestedQuestionAction(submissionId, trimmed);
      if (result.ok) {
        setSuggestionState("saved");
      } else {
        setSuggestionState("idle");
        setSuggestionError(result.error ?? "That could not be saved. Please try again.");
      }
    } catch {
      // Never surfaces as a failed submission -- the story is already saved.
      setSuggestionState("idle");
      setSuggestionError("That could not be saved. Please try again.");
    }
  }

  const currentQuestion = answers[currentQuestionIndex] as AnswerPrompt | undefined;

  // Warn before accidental navigation once recording/uploading has started.
  useEffect(() => {
    const shouldWarn = step === "record" || step === "uploading";
    if (!shouldWarn) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [step]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ticks the "resend code" cooldown down to 0 once a code has just been (re)sent.
  useEffect(() => {
    if (otpResendCooldown <= 0) return;
    const id = setInterval(() => setOtpResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [otpResendCooldown]);

  // Keep the live camera preview actually live.
  //
  // `videoPreviewRef` is shared by two DIFFERENT <video> elements: one on
  // the "permissions" step, and a separate one on the "record" step (see
  // the render below). `requestPermissions()` binds the MediaStream to
  // whichever element happened to be mounted at that moment — but React
  // mounts a brand-new <video> node when the step changes to "record" (and
  // reuses/repurposes that same node for the post-recording review clip,
  // whose `src` is a blob URL rather than a live stream). Nothing was ever
  // re-binding `srcObject` after that first assignment, so contributors
  // saw a black box while recording, then a stuck last frame from the
  // review clip on every question after the first — never their actual
  // live self-view. This effect re-binds the stream every time the
  // live-preview element is (re)rendered, on every question and step
  // transition, not just once.
  useEffect(() => {
    const showsLivePreview =
      (step === "permissions" && permissionState === "granted") || (step === "record" && recordingState !== "recorded");
    const el = videoPreviewRef.current;
    if (showsLivePreview && el && streamRef.current) {
      if (el.srcObject !== streamRef.current) {
        el.srcObject = streamRef.current;
      }
      el.play().catch(() => {});
    }
  }, [step, permissionState, recordingState, currentQuestionIndex]);

  function toggleRelationship(value: Relationship) {
    setRelationship((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  async function handleIdentitySubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!isAdultConfirmed) {
      setFormError("Coleman Storybook is currently open to adult contributors only.");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setFormError("Please enter your first and last name.");
      return;
    }
    if (!email.trim()) {
      setFormError("Please enter your email — we'll send a verification code to it.");
      return;
    }
    if (relationship.length === 0) {
      setFormError("Please select at least one relationship to Coleman.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await sendVerificationCodeAction(email);
      if (!result.ok) {
        setFormError(result.error ?? "Couldn't send the verification code. Please try again.");
        return;
      }
      setOtpCode("");
      setOtpError(null);
      setOtpResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setStep("verify-email");
    } catch (err) {
      setFormError(describeSubmitError(err));
    } finally {
      setSubmitting(false);
    }
  }

  /** Verifies the entered code, then immediately starts the submission with the resulting token — one contributor-facing action, even though it's two server round-trips under the hood. */
  async function handleVerifyEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOtpError(null);

    if (!/^\d{6}$/.test(otpCode.trim())) {
      setOtpError("Enter the 6-digit code from your email.");
      return;
    }

    setOtpVerifying(true);
    try {
      const verifyResult = await verifyEmailCodeAction(email, otpCode.trim());
      if (!verifyResult.ok || !verifyResult.verificationToken) {
        setOtpError(verifyResult.error ?? "That code isn't right. Please check and try again.");
        return;
      }

      const startResult = await startSubmissionAction(
        campaignSlug,
        { firstName, lastName, email, relationship, yearsAssociated, roleInfo: "", isAdult: true },
        verifyResult.verificationToken,
      );
      if (!startResult.ok || !startResult.submissionId) {
        setOtpError(startResult.error ?? "Something went wrong. Please try again.");
        return;
      }

      setSubmissionId(startResult.submissionId);
      setConsentVersion(startResult.consentVersion ?? null);
      setConsentText(startResult.consentText ?? null);
      setMaxDurationSeconds(startResult.maxDurationSeconds ?? 180);
      setAnswers(startResult.answers ?? []);
      const initialRecordings: Record<string, AnswerRecording> = {};
      for (const a of startResult.answers ?? []) {
        initialRecordings[a.id] = {
          blob: null,
          approved: false,
          storageKey: null,
          uploadProgress: 0,
          uploadState: "idle",
          uploadError: null,
        };
      }
      setRecordings(initialRecordings);
      setStep("consent");
    } catch (err) {
      setOtpError(describeSubmitError(err));
    } finally {
      setOtpVerifying(false);
    }
  }

  async function handleResendCode() {
    if (otpResendCooldown > 0 || otpResending) return;
    setOtpError(null);
    setOtpResending(true);
    try {
      const result = await sendVerificationCodeAction(email);
      if (!result.ok) {
        setOtpError(result.error ?? "Couldn't resend the code. Please try again.");
        return;
      }
      setOtpResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setOtpError(describeSubmitError(err));
    } finally {
      setOtpResending(false);
    }
  }

  function backToIdentityFromVerify() {
    setOtpCode("");
    setOtpError(null);
    setStep("identity");
  }

  async function handleConsentSubmit() {
    setFormError(null);
    if (!consentAccepted || !submissionId || !consentVersion) {
      setFormError("Please review and accept the consent statement to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitConsentAction({
        submissionId,
        consentVersion,
        permittedUseClassification: permittedUse,
        accepted: true,
      });
      if (!result.ok) {
        setFormError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      setStep("permissions");
    } catch (err) {
      setFormError(describeSubmitError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function requestPermissions() {
    setPermissionState("requesting");
    setPermissionError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPermissionState("error");
      setPermissionError(
        "Your browser doesn't support camera/microphone recording. Please try a recent version of Chrome or Safari.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      streamRef.current = stream;
      setPermissionState("granted");
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        await videoPreviewRef.current.play().catch(() => {});
      }
    } catch (err) {
      setPermissionState("denied");
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setPermissionError(
          "Camera/microphone access was denied. Please allow access in your browser settings and try again.",
        );
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        setPermissionError("No camera or microphone was found on this device.");
      } else {
        setPermissionError("Couldn't access your camera/microphone. Please check your device and try again.");
      }
    }
  }

  function proceedToRecording() {
    if (permissionState !== "granted") return;
    setStep("record");
  }

  function pickMimeType(): string {
    const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
    }
    return "video/webm";
  }

  function startRecording() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType.split(";")[0] });
      const url = URL.createObjectURL(blob);
      setReviewUrl(url);
      if (currentQuestion) {
        setRecordings((prev) => ({
          ...prev,
          [currentQuestion.id]: { ...prev[currentQuestion.id], blob, approved: false },
        }));
      }
      setRecordingState("recorded");
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecordingState("recording");
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        if (next >= maxDurationSeconds) {
          stopRecording();
        }
        return next;
      });
    }, 1000);
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRecorderRef.current?.stop();
  }

  function retakeRecording() {
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    setReviewUrl(null);
    setRecordingState("idle");
    setElapsedSeconds(0);
    if (currentQuestion) {
      setRecordings((prev) => ({
        ...prev,
        [currentQuestion.id]: { ...prev[currentQuestion.id], blob: null, approved: false },
      }));
    }
  }

  function approveAndContinue() {
    if (!currentQuestion) return;
    setRecordings((prev) => ({
      ...prev,
      [currentQuestion.id]: { ...prev[currentQuestion.id], approved: true },
    }));
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    setReviewUrl(null);
    setRecordingState("idle");
    setElapsedSeconds(0);

    if (currentQuestionIndex + 1 < answers.length) {
      setCurrentQuestionIndex((i) => i + 1);
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void beginUploads();
    }
  }

  async function beginUploads() {
    if (!submissionId) return;
    setStep("uploading");
    setUploadOverallError(null);

    const beginResult = await beginUploadAction(submissionId);
    if (!beginResult.ok) {
      setUploadOverallError(beginResult.error ?? "Couldn't start upload. Please try again.");
      return;
    }

    // IMPORTANT: track success locally rather than re-reading `recordings`
    // state after these awaits — `recordings` here is a stale closure
    // captured when beginUploads() started, and setRecordings() calls made
    // inside uploadOneAnswer() during the loop do not update it. Reading
    // state instead of these local results would make this function think
    // every upload was still "idle" even after they'd all succeeded.
    const results: boolean[] = [];
    for (const answer of answers) {
      const recording = recordings[answer.id];
      if (!recording?.blob) {
        results.push(false);
        continue;
      }
      results.push(await uploadOneAnswer(answer.id, recording.blob));
    }

    const allDone = results.every(Boolean);
    if (!allDone) {
      // Individual failures are shown inline per-question; overall retry is available below.
      return;
    }

    setFinalizing(true);
    const finalize = await finalizeSubmissionAction(submissionId);
    setFinalizing(false);
    if (!finalize.ok) {
      setUploadOverallError(finalize.error ?? "Couldn't finish submitting. Please try again.");
      return;
    }
    setStep("complete");
  }

  async function uploadOneAnswer(answerId: string, blob: Blob, attempt = 0): Promise<boolean> {
    setRecordings((prev) => ({
      ...prev,
      [answerId]: { ...prev[answerId], uploadState: "uploading", uploadProgress: 0, uploadError: null },
    }));

    try {
      const initRes = await fetch("/api/uploads/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionAnswerId: answerId,
          mimeType: blob.type || "video/webm",
          estimatedBytes: blob.size,
        }),
      });
      const initData = await initRes.json();
      if (!initRes.ok || !initData.ok) {
        throw new Error(initData.error ?? "Couldn't prepare upload.");
      }

      const putResult = await uploadWithProgress(
        initData.uploadUrl,
        initData.method,
        initData.headers,
        blob,
        initData.bodyFormat,
        (frac) => {
          setRecordings((prev) => ({ ...prev, [answerId]: { ...prev[answerId], uploadProgress: frac } }));
        },
      );
      if (!putResult.ok) {
        throw new Error("Upload failed. Please check your connection.");
      }

      setRecordings((prev) => ({ ...prev, [answerId]: { ...prev[answerId], uploadState: "confirming" } }));
      const confirmRes = await fetch("/api/uploads/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionAnswerId: answerId, storageKey: initData.storageKey }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok || !confirmData.ok) {
        throw new Error(confirmData.error ?? "Upload could not be confirmed.");
      }

      setRecordings((prev) => ({
        ...prev,
        [answerId]: { ...prev[answerId], uploadState: "done", uploadProgress: 1, storageKey: initData.storageKey },
      }));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      if (attempt < MAX_RETRY_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        return uploadOneAnswer(answerId, blob, attempt + 1);
      }
      setRecordings((prev) => ({
        ...prev,
        [answerId]: { ...prev[answerId], uploadState: "error", uploadError: message },
      }));
      return false;
    }
  }

  async function retryFailedUploads() {
    setUploadOverallError(null);
    const outcomes: boolean[] = [];
    for (const answer of answers) {
      const recording = recordings[answer.id];
      if (recording?.uploadState === "error" && recording.blob) {
        outcomes.push(await uploadOneAnswer(answer.id, recording.blob));
      } else {
        outcomes.push(recording?.uploadState === "done");
      }
    }
    const allDone = outcomes.every(Boolean);
    if (allDone && submissionId) {
      setFinalizing(true);
      const finalize = await finalizeSubmissionAction(submissionId);
      setFinalizing(false);
      if (finalize.ok) {
        setStep("complete");
      } else {
        setUploadOverallError(finalize.error ?? "Couldn't finish submitting. Please try again.");
      }
    }
  }

  const progressLabel = useMemo(() => {
    const stepOrder: Step[] = ["identity", "verify-email", "consent", "permissions", "record", "uploading", "complete"];
    const idx = stepOrder.indexOf(step);
    return `Step ${Math.max(idx, 0) + 1} of ${stepOrder.length}`;
  }, [step]);

  return (
    <div>
      <p className="mb-6 text-center text-xs font-medium uppercase tracking-wide text-brand-muted" aria-live="polite">
        {campaignTitle} — {progressLabel}
      </p>

      {step === "identity" && (
        <form onSubmit={handleIdentitySubmit} className="flex flex-col gap-4" noValidate>
          <h1 className="font-heading text-2xl font-bold text-brand-secondary">Tell us a bit about you</h1>
          <div className="flex gap-3">
            <label className="flex-1 text-sm font-medium text-brand-secondary">
              First name
              <input
                className="mt-1 w-full rounded-md border border-brand-hairline px-3 py-2 text-base"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                required
              />
            </label>
            <label className="flex-1 text-sm font-medium text-brand-secondary">
              Last name
              <input
                className="mt-1 w-full rounded-md border border-brand-hairline px-3 py-2 text-base"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                required
              />
            </label>
          </div>
          <label className="text-sm font-medium text-brand-secondary">
            Email
            <input
              type="email"
              className="mt-1 w-full rounded-md border border-brand-hairline px-3 py-2 text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <span className="mt-1 block text-xs font-normal text-brand-muted">
              We&apos;ll send a 6-digit code to this address to confirm it&apos;s yours before you record.
            </span>
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-brand-secondary">Your relationship to Coleman</legend>
            <p className="mt-1 text-xs font-normal text-brand-muted">Select all that apply.</p>
            <div className="mt-2 flex flex-col gap-2">
              {RELATIONSHIP_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm font-normal text-brand-secondary">
                  <input
                    type="checkbox"
                    checked={relationship.includes(opt.value)}
                    onChange={() => toggleRelationship(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-sm font-medium text-brand-secondary">
            Years associated with Coleman (optional)
            <input
              className="mt-1 w-full rounded-md border border-brand-hairline px-3 py-2 text-base"
              placeholder="e.g. 1998–2005"
              value={yearsAssociated}
              onChange={(e) => setYearsAssociated(e.target.value)}
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-brand-secondary">
            <input
              type="checkbox"
              className="mt-1"
              checked={isAdultConfirmed}
              onChange={(e) => setIsAdultConfirmed(e.target.checked)}
            />
            I confirm that I am an adult (18 or older). Coleman Storybook is currently open to adult contributors
            only.
          </label>

          {formError && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-full bg-brand-primary px-6 py-3 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Sending code…" : "Continue"}
          </button>
        </form>
      )}

      {step === "verify-email" && (
        <form onSubmit={handleVerifyEmailSubmit} className="flex flex-col gap-4" noValidate>
          <h1 className="font-heading text-2xl font-bold text-brand-secondary">Check your email</h1>
          <p className="text-sm text-brand-muted">
            We sent a 6-digit code to <span className="font-medium text-brand-secondary">{email}</span>. Enter it
            below to continue.
          </p>
          <label className="text-sm font-medium text-brand-secondary">
            Verification code
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="mt-1 w-full rounded-md border border-brand-hairline px-3 py-2 text-center text-lg tracking-[0.5em]"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
          </label>

          {otpError && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {otpError}
            </p>
          )}

          <button
            type="submit"
            disabled={otpVerifying}
            className="rounded-full bg-brand-primary px-6 py-3 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {otpVerifying ? "Verifying…" : "Verify & continue"}
          </button>

          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={backToIdentityFromVerify} className="text-brand-secondary underline">
              Change email
            </button>
            <button
              type="button"
              onClick={handleResendCode}
              disabled={otpResendCooldown > 0 || otpResending}
              className="text-brand-secondary underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
            >
              {otpResending
                ? "Resending…"
                : otpResendCooldown > 0
                  ? `Resend code (${otpResendCooldown}s)`
                  : "Resend code"}
            </button>
          </div>
        </form>
      )}

      {step === "consent" && (
        <div className="flex flex-col gap-4">
          <h1 className="font-heading text-2xl font-bold text-brand-secondary">Before you record</h1>
          <div className="max-h-64 overflow-y-auto rounded-md border border-brand-hairline bg-brand-surface p-4 text-sm text-brand-muted whitespace-pre-wrap">
            {consentText}
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-brand-secondary">How may we use your story?</legend>
            <div className="mt-2 flex flex-col gap-2">
              {PERMITTED_USE_CLASSIFICATIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-brand-secondary">
                  <input
                    type="radio"
                    name="permittedUse"
                    value={opt.value}
                    checked={permittedUse === opt.value}
                    onChange={() => setPermittedUse(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-start gap-2 text-sm text-brand-secondary">
            <input type="checkbox" className="mt-1" checked={consentAccepted} onChange={(e) => setConsentAccepted(e.target.checked)} />
            I have read and agree to the statement above.
          </label>
          {formError && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {formError}
            </p>
          )}
          <button
            onClick={handleConsentSubmit}
            disabled={submitting}
            className="rounded-full bg-brand-primary px-6 py-3 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Please wait…" : "I agree, continue"}
          </button>
        </div>
      )}

      {step === "permissions" && (
        <div className="flex flex-col gap-4">
          <h1 className="font-heading text-2xl font-bold text-brand-secondary">Get ready to record</h1>
          <ul className="list-disc pl-5 text-sm text-brand-muted">
            <li>Find a reasonably quiet place.</li>
            <li>Face a light source rather than having it behind you.</li>
            <li>Place your camera near eye level.</li>
            <li>Speak naturally — take your time.</li>
          </ul>

          <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
            <video key="live-preview" ref={videoPreviewRef} className="h-full w-full object-cover" muted playsInline />
          </div>

          {permissionState !== "granted" && (
            <button
              onClick={requestPermissions}
              disabled={permissionState === "requesting"}
              className="rounded-full bg-brand-primary px-6 py-3 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {permissionState === "requesting" ? "Requesting access…" : "Allow camera & microphone"}
            </button>
          )}

          {permissionError && (
            <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {permissionError}
              <button onClick={requestPermissions} className="ml-2 underline">
                Try again
              </button>
            </div>
          )}

          {permissionState === "granted" && (
            <button
              onClick={proceedToRecording}
              className="rounded-full bg-brand-primary px-6 py-3 font-medium text-white transition hover:opacity-90"
            >
              Continue
            </button>
          )}
        </div>
      )}

      {step === "record" && currentQuestion && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-brand-muted">
            Question {currentQuestionIndex + 1} of {answers.length}
          </p>
          <h1 className="font-heading text-2xl font-bold text-brand-secondary">{currentQuestion.prompt}</h1>
          {currentQuestion.helpText && <p className="text-sm text-brand-muted">{currentQuestion.helpText}</p>}

          <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
            {recordingState === "recorded" && reviewUrl ? (
              <video key="review-clip" src={reviewUrl} className="h-full w-full object-cover" controls playsInline />
            ) : (
              <video key="live-preview" ref={videoPreviewRef} className="h-full w-full object-cover" muted playsInline />
            )}
          </div>

          <p aria-live="polite" className="text-sm font-medium text-brand-secondary">
            {recordingState === "recording"
              ? `Recording… ${elapsedSeconds}s / ${maxDurationSeconds}s`
              : recordingState === "recorded"
                ? "Review your answer below."
                : "Ready to record."}
          </p>

          <div className="flex gap-3">
            {recordingState === "idle" && (
              <button
                onClick={startRecording}
                className="flex-1 rounded-full bg-brand-accent px-6 py-3 font-medium text-white transition hover:opacity-90"
              >
                Start recording
              </button>
            )}
            {recordingState === "recording" && (
              <button
                onClick={stopRecording}
                className="flex-1 rounded-full bg-brand-secondary px-6 py-3 font-medium text-white transition hover:opacity-90"
              >
                Stop
              </button>
            )}
            {recordingState === "recorded" && (
              <>
                <button
                  onClick={retakeRecording}
                  className="flex-1 rounded-full border border-brand-hairline px-6 py-3 font-medium text-brand-secondary transition hover:bg-brand-surface"
                >
                  Retake
                </button>
                <button
                  onClick={approveAndContinue}
                  className="flex-1 rounded-full bg-brand-primary px-6 py-3 font-medium text-white transition hover:opacity-90"
                >
                  {currentQuestionIndex + 1 < answers.length ? "Approve & next question" : "Approve & continue"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {step === "uploading" && (
        <div className="flex flex-col gap-4">
          <h1 className="font-heading text-2xl font-bold text-brand-secondary">Uploading your story…</h1>
          <p className="text-sm text-brand-muted">
            Please stay on this page until this finishes. This can take a few minutes on slower connections.
          </p>
          <ul className="flex flex-col gap-3">
            {answers.map((a, i) => {
              const r = recordings[a.id];
              return (
                <li key={a.id} className="rounded-md border border-brand-hairline p-3">
                  <p className="text-sm font-medium text-brand-secondary">
                    Question {i + 1}: {r?.uploadState === "done" ? "Uploaded ✓" : r?.uploadState === "error" ? "Failed" : "Uploading…"}
                  </p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-brand-hairline">
                    <div
                      className="h-full bg-brand-primary transition-all"
                      style={{ width: `${Math.round((r?.uploadProgress ?? 0) * 100)}%` }}
                    />
                  </div>
                  {r?.uploadError && <p className="mt-1 text-xs text-red-700">{r.uploadError}</p>}
                </li>
              );
            })}
          </ul>
          {finalizing && <p className="text-sm text-brand-muted">Finishing up…</p>}
          {uploadOverallError && (
            <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {uploadOverallError}
            </div>
          )}
          {answers.some((a) => recordings[a.id]?.uploadState === "error") && (
            <button
              onClick={retryFailedUploads}
              className="rounded-full bg-brand-primary px-6 py-3 font-medium text-white transition hover:opacity-90"
            >
              Retry failed upload(s)
            </button>
          )}
        </div>
      )}

      {step === "complete" && (
        <div className="flex flex-col items-center gap-5 py-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-accent/20">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-8 w-8 text-brand-primary"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-2xl font-bold text-brand-secondary">
              {completionHeadline ?? "Your story is now part of the Coleman story."}
            </h1>
            <p className="text-brand-muted">{completionCopy ?? "Todah rabah — thank you for sharing your Coleman story."}</p>
          </div>

          <p className="max-w-sm text-sm text-brand-muted">
            Your recording has been saved and will be reviewed by the Coleman Storybook team before it&apos;s used
            anywhere. You&apos;re all done here — feel free to close this page.
          </p>

          {/*
            "What should we ask Coleman people next?" — moved here from the
            recorded question set (owner decision, 2026-08-25). Entirely
            optional and entirely post-submission: the story is already
            saved and finalized before this screen renders, so a failure
            here shows inline and changes nothing about the submission.
          */}
          <div className="mt-2 w-full max-w-md rounded-md border border-brand-hairline bg-brand-surface p-4 text-left">
            <label htmlFor="suggested-question" className="font-heading text-base font-bold text-brand-secondary">
              One more thing, if you have a minute
            </label>
            <p className="mt-1 text-sm text-brand-muted">
              What should we ask Coleman people next? We read every suggestion.
            </p>

            {suggestionState === "saved" ? (
              <p role="status" className="mt-3 text-sm font-medium text-brand-secondary">
                Got it — thank you. That goes straight to the Coleman Storybook team.
              </p>
            ) : (
              <>
                <textarea
                  id="suggested-question"
                  value={suggestion}
                  onChange={(e) => setSuggestion(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="A question you wish we had asked…"
                  className="mt-3 w-full rounded-md border border-brand-hairline bg-white p-2 text-sm text-brand-secondary"
                />
                {suggestionError && (
                  <p role="alert" className="mt-2 text-sm text-red-700">
                    {suggestionError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={submitSuggestion}
                  disabled={suggestionState === "saving"}
                  className="mt-3 rounded-full bg-brand-primary px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {suggestionState === "saving" ? "Sending…" : "Send suggestion"}
                </button>
              </>
            )}
          </div>

          {/*
            Deliberately a plain <a>, not next/link's <Link>: this page IS
            `/${campaignSlug}/share`, so a <Link> here navigates to the
            current URL. Next's client-side router treats that as a no-op
            (no page change, so no re-render) rather than remounting the
            page -- which meant clicking it visibly did nothing, since
            ContributorFlow's ~15 pieces of local state (step, submissionId,
            recordings, the camera stream ref, etc.) never got reset. A real
            navigation forces the browser to reload the page and mount a
            fresh ContributorFlow from scratch, which is what "start another
            story" actually needs here.
          */}
          <a
            href={`/${campaignSlug}/share`}
            className="mt-2 rounded-full border border-brand-hairline px-6 py-3 text-sm font-medium text-brand-secondary transition hover:bg-brand-surface"
          >
            Share another Coleman story
          </a>
        </div>
      )}
    </div>
  );
}
