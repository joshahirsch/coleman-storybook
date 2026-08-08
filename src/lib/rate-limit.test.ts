import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  it("allows requests under the limit and blocks once exceeded", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      const result = checkRateLimit(key, { maxRequests: 3, windowSeconds: 60 });
      expect(result.allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, { maxRequests: 3, windowSeconds: 60 });
    expect(blocked.allowed).toBe(false);
  });

  it("tracks separate keys independently", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    checkRateLimit(a, { maxRequests: 1, windowSeconds: 60 });
    const blockedA = checkRateLimit(a, { maxRequests: 1, windowSeconds: 60 });
    const allowedB = checkRateLimit(b, { maxRequests: 1, windowSeconds: 60 });
    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });
});
