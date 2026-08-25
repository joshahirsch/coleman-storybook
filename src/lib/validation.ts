import { z } from "zod";

export const relationshipValues = [
  "camper",
  "staff",
  "camper_staff",
  "parent",
  "alumni_parent",
  "volunteer",
  "other",
] as const;

export const contributorIdentitySchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  // Required as of the email-OTP-verification feature (2026-08-12) — was
  // previously optional, but there's nothing to send a code to (and
  // nothing trustworthy to log in the contact export CSV) without a real
  // email. See docs/security.md.
  email: z.string().trim().email("Enter a valid email").max(255),
  // Array — a contributor can select more than one relationship to Coleman
  // (e.g. alumni AND current staff). Deduplicated defensively since the
  // client sends checkbox state, not a database-backed set.
  relationship: z
    .array(z.enum(relationshipValues))
    .min(1, "Select at least one relationship to Coleman")
    .transform((values) => Array.from(new Set(values))),
  yearsAssociated: z.string().trim().max(100).optional().or(z.literal("")),
  roleInfo: z.string().trim().max(500).optional().or(z.literal("")),
  isAdult: z.literal(true, "Coleman Storybook is currently open to adult contributors only."),
});
export type ContributorIdentityInput = z.infer<typeof contributorIdentitySchema>;

export const sendVerificationCodeSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
});
export type SendVerificationCodeInput = z.infer<typeof sendVerificationCodeSchema>;

export const verifyEmailCodeSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  // Exactly 6 digits — see src/lib/auth/otp.ts's generateOtpCode().
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
export type VerifyEmailCodeInput = z.infer<typeof verifyEmailCodeSchema>;

export const consentAcceptanceSchema = z.object({
  submissionId: z.string().uuid(),
  consentVersion: z.string().min(1),
  permittedUseClassification: z.string().min(1),
  accepted: z.literal(true, "Consent must be accepted to continue."),
});
export type ConsentAcceptanceInput = z.infer<typeof consentAcceptanceSchema>;

export const uploadInitSchema = z.object({
  submissionAnswerId: z.string().uuid(),
  mimeType: z.enum(["video/webm", "video/mp4", "audio/webm", "audio/mp4"]),
  estimatedBytes: z.number().int().positive().max(500 * 1024 * 1024), // 500MB hard cap
});
export type UploadInitInput = z.infer<typeof uploadInitSchema>;

export const uploadConfirmSchema = z.object({
  submissionAnswerId: z.string().uuid(),
  storageKey: z.string().min(1),
});
export type UploadConfirmInput = z.infer<typeof uploadConfirmSchema>;

export const adminLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const adminReviewUpdateSchema = z.object({
  submissionId: z.string().uuid(),
  editorialState: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  notes: z.string().max(5000).optional(),
  favorite: z.boolean().optional(),
});
export type AdminReviewUpdateInput = z.infer<typeof adminReviewUpdateSchema>;

/** Server-side enforced constraints, independent of anything the client sends. */
export const MEDIA_CONSTRAINTS = {
  allowedMimeTypes: ["video/webm", "video/mp4", "audio/webm", "audio/mp4"] as const,
  maxBytes: 500 * 1024 * 1024,
  maxDurationSecondsHardCap: 600,
};

/**
 * Optional "What should we ask Coleman people next?" suggestion, collected on
 * the completion screen. Capped well below the DB's unbounded `text` column so
 * a paste-bomb can't be stored; an all-whitespace value trims to "" and is
 * rejected here rather than saved as an empty row.
 */
export const suggestedQuestionSchema = z.object({
  submissionId: z.string().uuid(),
  suggestion: z.string().trim().min(1, "Type a question first.").max(1000),
});
export type SuggestedQuestionInput = z.infer<typeof suggestedQuestionSchema>;
