import { beforeAll, describe, expect, it } from "vitest";
import { signToken, verifyToken } from "./signing";

beforeAll(() => {
  process.env.STORAGE_SIGNING_SECRET = "test-secret-not-for-production";
});

describe("signed storage tokens", () => {
  it("verifies a freshly signed read token", () => {
    const token = signToken({ key: "org/sub/answer/file.webm", purpose: "read", exp: Math.floor(Date.now() / 1000) + 60 });
    const result = verifyToken(token, { key: "org/sub/answer/file.webm", purpose: "read" });
    expect(result.valid).toBe(true);
  });

  it("rejects an expired token", () => {
    const token = signToken({ key: "k", purpose: "read", exp: Math.floor(Date.now() / 1000) - 10 });
    const result = verifyToken(token, { key: "k", purpose: "read" });
    expect(result.valid).toBe(false);
  });

  it("rejects a token used for the wrong key (cannot reuse a signed URL for a different object)", () => {
    const token = signToken({ key: "k1", purpose: "read", exp: Math.floor(Date.now() / 1000) + 60 });
    const result = verifyToken(token, { key: "k2", purpose: "read" });
    expect(result.valid).toBe(false);
  });

  it("rejects a token used for the wrong purpose (a write token cannot be used to read)", () => {
    const token = signToken({ key: "k", purpose: "write", exp: Math.floor(Date.now() / 1000) + 60 });
    const result = verifyToken(token, { key: "k", purpose: "read" });
    expect(result.valid).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const token = signToken({ key: "k", purpose: "read", exp: Math.floor(Date.now() / 1000) + 60 });
    const [body] = token.split(".");
    const tampered = `${body}.deadbeef${"0".repeat(56)}`;
    const result = verifyToken(tampered, { key: "k", purpose: "read" });
    expect(result.valid).toBe(false);
  });

  it("rejects a malformed token", () => {
    const result = verifyToken("not-a-real-token", { key: "k", purpose: "read" });
    expect(result.valid).toBe(false);
  });
});
