import { createHmac, timingSafeEqual } from "node:crypto";
import { getRequiredSessionSecret } from "@/lib/env";

/**
 * Short-lived, signed token proving "this email was just OTP-verified" —
 * handed to the browser by `verifyEmailCodeAction` and passed back into
 * `startSubmissionAction`, which re-validates it server-side before
 * creating a contributor/submission. Same "never trust the client's claim
 * alone" principle the rest of this codebase already follows (e.g.
 * `/api/uploads/confirm` re-checks storage itself rather than trusting the
 * client's "it uploaded" claim; see docs/security.md) — a contributor's
 * browser saying "the code was right" is not sufficient on its own,
 * because nothing stops a modified/malicious client from just claiming
 * that without ever calling `verifyEmailCodeAction`.
 *
 * Deliberately a small dedicated HMAC token here rather than reusing
 * `src/lib/storage/signing.ts` — that module's payload shape (`key` +
 * `purpose: "read" | "write"`) is specific to media object access; this is
 * a different kind of claim (identity verification, not object access)
 * and conflating the two would make both harder to reason about. Same
 * crypto approach (HMAC-SHA256, `timingSafeEqual`), same reused
 * `SESSION_SECRET` key as `src/lib/auth/otp.ts` — see that file's header
 * comment for why reusing this one secret across purposes is safe.
 */

const TOKEN_TTL_SECONDS = 15 * 60; // generous enough to cover filling out the rest of the identity form

interface VerificationTokenPayload {
  email: string;
  purpose: "email-verified";
  exp: number; // unix seconds
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Issues a signed token asserting `email` was just OTP-verified, valid for `TOKEN_TTL_SECONDS`. */
export function issueVerificationToken(email: string): string {
  const payload: VerificationTokenPayload = {
    email: email.toLowerCase(),
    purpose: "email-verified",
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", getRequiredSessionSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Verifies a token asserts `email` was OTP-verified and hasn't expired/been tampered with. */
export function verifyVerificationToken(token: string, email: string): boolean {
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;

  const expectedSig = createHmac("sha256", getRequiredSessionSecret()).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return false;

  let payload: VerificationTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return false;
  }

  if (payload.purpose !== "email-verified") return false;
  if (payload.email !== email.toLowerCase()) return false;
  if (Date.now() / 1000 > payload.exp) return false;

  return true;
}
