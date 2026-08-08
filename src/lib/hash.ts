import { createHash } from "node:crypto";

/**
 * We never store a contributor's raw IP address (see docs/security.md and
 * docs/privacy-and-consent.md) — only a salted one-way hash, which is
 * enough to support abuse investigation ("did the same network submit many
 * times") without retaining directly identifying network data.
 */
export function hashIp(ip: string): string {
  const salt = process.env.SESSION_SECRET;
  if (!salt || salt.length < 16) {
    // Fail closed rather than silently hashing with a fixed, guessable
    // salt — a predictable salt would make the "hash" reversible via a
    // rainbow table over the IPv4/IPv6 address space, defeating the point.
    // See docs/pre-production-review.md.
    throw new Error("SESSION_SECRET is not set (or too short) — see .env.example");
  }
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
