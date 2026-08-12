import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { issueVerificationToken, verifyVerificationToken } from "./verification-token";

describe("verification-token", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret-at-least-16-chars";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.useRealTimers();
  });

  it("issues a token that verifies for the same email", () => {
    const token = issueVerificationToken("jane@example.com");
    expect(verifyVerificationToken(token, "jane@example.com")).toBe(true);
  });

  it("is case-insensitive on the email", () => {
    const token = issueVerificationToken("Jane@Example.com");
    expect(verifyVerificationToken(token, "jane@example.com")).toBe(true);
  });

  it("rejects verification against a different email than it was issued for", () => {
    const token = issueVerificationToken("jane@example.com");
    expect(verifyVerificationToken(token, "someoneelse@example.com")).toBe(false);
  });

  it("rejects a malformed token", () => {
    expect(verifyVerificationToken("not-a-real-token", "jane@example.com")).toBe(false);
    expect(verifyVerificationToken("", "jane@example.com")).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const token = issueVerificationToken("jane@example.com");
    const [body] = token.split(".");
    const tampered = `${body}.deadbeef00000000deadbeef00000000deadbeef00000000deadbeef000000`;
    expect(verifyVerificationToken(tampered, "jane@example.com")).toBe(false);
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00.000Z"));
    const token = issueVerificationToken("jane@example.com");

    vi.setSystemTime(new Date("2026-08-12T12:20:00.000Z")); // 20 min later, past the 15-min TTL
    expect(verifyVerificationToken(token, "jane@example.com")).toBe(false);
  });

  it("throws when issuing if SESSION_SECRET is missing (fails closed)", () => {
    delete process.env.SESSION_SECRET;
    expect(() => issueVerificationToken("jane@example.com")).toThrow(/SESSION_SECRET/);
  });
});
