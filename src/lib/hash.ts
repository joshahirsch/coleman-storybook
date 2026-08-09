import { createHash } from "node:crypto";
import { getRequiredSessionSecret } from "@/lib/env";

/**
 * We never store a contributor's raw IP address (see docs/security.md and
 * docs/privacy-and-consent.md) — only a salted one-way hash, which is
 * enough to support abuse investigation ("did the same network submit many
 * times") without retaining directly identifying network data.
 */
export function hashIp(ip: string): string {
  // Fail closed rather than silently hashing with a fixed, guessable salt —
  // a predictable salt would make the "hash" reversible via a rainbow
  // table over the IPv4/IPv6 address space, defeating the point. See
  // docs/pre-production-review.md. In normal operation this should never
  // actually throw here — src/instrumentation.ts validates this same
  // requirement at server startup, so a misconfigured secret fails loudly
  // before any request reaches this code.
  const salt = getRequiredSessionSecret();
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
