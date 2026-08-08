/**
 * In-memory, single-instance rate limiter for public write endpoints.
 *
 * KNOWN LIMITATION (documented, not hidden — see docs/security.md
 * "Residual Risks"): this is per-process memory, so it resets on deploy and
 * does not coordinate across multiple server instances. That is an
 * acceptable V1 tradeoff given expected personal-invitation-based traffic
 * (not public ad-driven volume) and the absence of a Redis/KV vendor in the
 * V1 stack. If abuse is observed in the pilot (Phase 15), upgrading to a
 * shared store (e.g. Upstash Redis) is a contained change limited to this
 * file.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  { maxRequests, windowSeconds }: { maxRequests: number; windowSeconds: number },
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (existing.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  existing.count += 1;
  return { allowed: true, remaining: maxRequests - existing.count };
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
