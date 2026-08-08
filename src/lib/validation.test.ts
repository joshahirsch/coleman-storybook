import { describe, expect, it } from "vitest";
import { contributorIdentitySchema, consentAcceptanceSchema, uploadInitSchema, MEDIA_CONSTRAINTS } from "./validation";

describe("contributorIdentitySchema", () => {
  const base = {
    firstName: "Sarah",
    lastName: "Cohen",
    email: "sarah@example.test",
    relationship: "alumni_parent" as const,
    yearsAssociated: "1998-2005",
    roleInfo: "",
    isAdult: true as const,
  };

  it("accepts a valid adult submission", () => {
    const result = contributorIdentitySchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("rejects when isAdult is not exactly true (minors must be excluded — spec Section 20)", () => {
    const result = contributorIdentitySchema.safeParse({ ...base, isAdult: false });
    expect(result.success).toBe(false);
  });

  it("rejects a missing first name", () => {
    const result = contributorIdentitySchema.safeParse({ ...base, firstName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid relationship value (no free-text injection into the enum)", () => {
    const result = contributorIdentitySchema.safeParse({ ...base, relationship: "camper; DROP TABLE" });
    expect(result.success).toBe(false);
  });

  it("allows an empty email (email is optional)", () => {
    const result = contributorIdentitySchema.safeParse({ ...base, email: "" });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const result = contributorIdentitySchema.safeParse({ ...base, email: "not-an-email" });
    expect(result.success).toBe(false);
  });
});

describe("consentAcceptanceSchema", () => {
  it("rejects accepted=false (client cannot self-report consent without checking the box)", () => {
    const result = consentAcceptanceSchema.safeParse({
      submissionId: "11111111-1111-1111-1111-111111111111",
      consentVersion: "v1-draft-2026-08-08",
      permittedUseClassification: "full_permitted_use",
      accepted: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID submissionId", () => {
    const result = consentAcceptanceSchema.safeParse({
      submissionId: "not-a-uuid",
      consentVersion: "v1-draft-2026-08-08",
      permittedUseClassification: "full_permitted_use",
      accepted: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("uploadInitSchema / MEDIA_CONSTRAINTS", () => {
  it("rejects a disallowed mime type", () => {
    const result = uploadInitSchema.safeParse({
      submissionAnswerId: "11111111-1111-1111-1111-111111111111",
      mimeType: "application/x-msdownload",
      estimatedBytes: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an oversized estimatedBytes value beyond the hard cap", () => {
    const result = uploadInitSchema.safeParse({
      submissionAnswerId: "11111111-1111-1111-1111-111111111111",
      mimeType: "video/webm",
      estimatedBytes: 501 * 1024 * 1024,
    });
    expect(result.success).toBe(false);
  });

  it("MEDIA_CONSTRAINTS.maxBytes matches the schema's hard cap", () => {
    expect(MEDIA_CONSTRAINTS.maxBytes).toBe(500 * 1024 * 1024);
  });
});
