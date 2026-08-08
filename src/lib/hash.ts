import { createHash } from "node:crypto";

/**
 * We never store a contributor's raw IP address (see docs/security.md and
 * docs/privacy-and-consent.md) — only a salted one-way hash, which is
 * enough to support abuse investigation ("did the same network submit many
 * times") without retaining directly identifying network data.
 */
export function hashIp(ip: string): string {
  const salt = process.env.SESSION_SECRET ?? "unsalted-dev-only";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
