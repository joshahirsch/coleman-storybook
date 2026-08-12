import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { getRequiredSessionSecret } from "@/lib/env";

/**
 * One-time-code (OTP) generation and verification for the email
 * ownership-verification step added to the contributor identity form
 * (see docs/security.md and src/lib/actions/public-actions.ts's
 * `sendVerificationCodeAction` / `verifyEmailCodeAction`).
 *
 * Codes are hashed with HMAC-SHA256 before being stored (never the
 * plaintext code) — reuses `SESSION_SECRET` as the HMAC key rather than
 * introducing a dedicated secret: it's already a required, validated,
 * high-entropy value (see src/lib/env.ts), and an HMAC hash of a 6-digit
 * code under one key can't be confused with or replayed against any other
 * use of that same key (admin session JWTs use a completely different
 * algorithm/library — `jose`'s `SignJWT` — and payload shape, so there's no
 * cross-purpose collision risk in practice).
 *
 * The hash is additionally keyed by email (see `hashOtpCode`) so the same
 * 6-digit code sent to two different addresses never hashes to the same
 * value — this isn't a secrecy requirement (an attacker who already knows
 * the code doesn't need the hash), it just means a leaked/logged hash for
 * one email can't be pasted in to satisfy the check for a different email.
 */

const CODE_LENGTH = 6;

/** Generates a cryptographically random 6-digit numeric code (zero-padded, e.g. "004821"). */
export function generateOtpCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

export function hashOtpCode(code: string, email: string): string {
  const secret = getRequiredSessionSecret();
  return createHmac("sha256", secret).update(`${email.toLowerCase()}:${code}`).digest("hex");
}

/** Constant-time comparison — never use `===` on secret-derived hashes (timing side-channel). */
export function verifyOtpCode(code: string, email: string, expectedHash: string): boolean {
  const actualHash = hashOtpCode(code, email);
  const actualBuf = Buffer.from(actualHash, "hex");
  const expectedBuf = Buffer.from(expectedHash, "hex");
  if (actualBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(actualBuf, expectedBuf);
}
