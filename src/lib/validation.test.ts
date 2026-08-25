import { describe, expect, it } from "vitest";
import {
  contributorIdentitySchema,
  consentAcceptanceSchema,
  suggestedQuestionSchema,
  uploadInitSchema,
  MEDIA_CONSTRAINTS,
} from "./validation";

describe("contributorIdentitySchema", () => {
  const base = {
    firstName: "Sarah",
    lastName: "Cohen",
    email: "sarah@example.test",
    relationship: ["alumni_parent"] as const,
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
    const result = contributorIdentitySchema.safeParse({ ...base, relationship: ["camper; DROP TABLE"] });
    expect(result.success).toBe(false);
  });

  it("rejects an empty relationship selection (must pick at least one)", () => {
    const result = contributorIdentitySchema.safeParse({ ...base, relationship: [] });
    expect(result.success).toBe(false);
  });

  it("accepts multiple relationship selections", () => {
    const result = contributorIdentitySchema.safeParse({ ...base, relationship: ["alumni_parent", "staff"] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.relationship).toEqual(["alumni_parent", "staff"]);
    }
  });

  it("deduplicates repeated relationship selections", () => {
    const result = contributorIdentitySchema.safeParse({ ...base, relationship: ["staff", "staff", "alumni_parent"] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.relationship).toEqual(["staff", "alumni_parent"]);
    }
  });

  it("rejects an empty email (required as of the email-OTP-verification feature, 2026-08-12 — see docs/security.md)", () => {
    const result = contributorIdentitySchema.safeParse({ ...base, email: "" });
    expect(result.success).toBe(false);
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

describe("suggestedQuestionSchema", () => {
  // A real v4 UUID: zod's .uuid() enforces the RFC version/variant bits, and
  // Postgres gen_random_uuid() (what actually mints submission ids) emits v4.
  const id = "0063e3b9-a15b-43a7-ac23-321117f87afd";

  it("accepts a normal suggestion and trims surrounding whitespace", () => {
    const result = suggestedQuestionSchema.safeParse({
      submissionId: id,
      suggestion: "   What song do you still associate with camp?  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.suggestion).toBe("What song do you still associate with camp?");
    }
  });

  it("rejects a whitespace-only suggestion rather than storing an empty row", () => {
    const result = suggestedQuestionSchema.safeParse({ submissionId: id, suggestion: "     " });
    expect(result.success).toBe(false);
  });

  it("rejects a suggestion longer than the 1000-character cap", () => {
    const result = suggestedQuestionSchema.safeParse({ submissionId: id, suggestion: "a".repeat(1001) });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid submission id", () => {
    const result = suggestedQuestionSchema.safeParse({ submissionId: "not-a-uuid", suggestion: "Ask about food." });
    expect(result.success).toBe(false);
  });
});
