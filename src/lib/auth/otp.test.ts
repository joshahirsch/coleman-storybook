import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateOtpCode, hashOtpCode, verifyOtpCode } from "./otp";

describe("otp", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret-at-least-16-chars";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("generateOtpCode", () => {
    it("returns a 6-digit numeric string, zero-padded", () => {
      for (let i = 0; i < 50; i++) {
        const code = generateOtpCode();
        expect(code).toMatch(/^\d{6}$/);
      }
    });
  });

  describe("hashOtpCode / verifyOtpCode", () => {
    it("verifies a code against its own hash", () => {
      const hash = hashOtpCode("123456", "jane@example.com");
      expect(verifyOtpCode("123456", "jane@example.com", hash)).toBe(true);
    });

    it("rejects a wrong code", () => {
      const hash = hashOtpCode("123456", "jane@example.com");
      expect(verifyOtpCode("654321", "jane@example.com", hash)).toBe(false);
    });

    it("is keyed by email — the same code hashed for a different email doesn't match", () => {
      const hash = hashOtpCode("123456", "jane@example.com");
      expect(verifyOtpCode("123456", "someoneelse@example.com", hash)).toBe(false);
    });

    it("is case-insensitive on the email", () => {
      const hash = hashOtpCode("123456", "Jane@Example.com");
      expect(verifyOtpCode("123456", "jane@example.com", hash)).toBe(true);
    });

    it("throws if SESSION_SECRET is missing (fails closed, doesn't silently hash with an empty key)", () => {
      delete process.env.SESSION_SECRET;
      expect(() => hashOtpCode("123456", "jane@example.com")).toThrow(/SESSION_SECRET/);
    });
  });
});
