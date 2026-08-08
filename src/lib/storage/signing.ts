import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Small, dependency-free signed-token helper used to make local/dev media
 * access behave like real cloud signed URLs: time-limited, tamper-evident,
 * and never publicly guessable. Same idea as an S3/Supabase signed URL,
 * implemented with HMAC-SHA256 so it needs no external service.
 */

interface TokenPayload {
  key: string;
  purpose: "read" | "write";
  exp: number; // unix seconds
}

function getSecret(): string {
  const secret = process.env.STORAGE_SIGNING_SECRET;
  if (!secret) {
    throw new Error("STORAGE_SIGNING_SECRET is not set — see .env.example");
  }
  return secret;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signToken(payload: TokenPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(
  token: string,
  expected: { key: string; purpose: "read" | "write" },
): { valid: true } | { valid: false; reason: string } {
  const [body, sig] = token.split(".");
  if (!body || !sig) return { valid: false, reason: "malformed token" };

  const expectedSig = createHmac("sha256", getSecret()).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, reason: "signature mismatch" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "invalid payload" };
  }

  if (payload.key !== expected.key) return { valid: false, reason: "key mismatch" };
  if (payload.purpose !== expected.purpose) return { valid: false, reason: "purpose mismatch" };
  if (Date.now() / 1000 > payload.exp) return { valid: false, reason: "expired" };

  return { valid: true };
}
