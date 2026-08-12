import type { EmailProvider } from "./types";

/**
 * Dev/local fallback: logs the code to the server console instead of
 * actually sending an email. Default when `EMAIL_PROVIDER` is unset,
 * mirroring `STORAGE_DRIVER` defaulting to `"local"` (src/lib/storage/index.ts)
 * — lets the full OTP flow be exercised locally (and in this session's own
 * verification runs, which have no network path to Resend's API) without
 * needing a real email provider account.
 */
export const consoleEmailProvider: EmailProvider = {
  async sendVerificationCode({ to, code, firstName }) {
    console.log(
      `[console-email-provider] Verification code for ${firstName ? `${firstName} <${to}>` : to}: ${code} ` +
        "(EMAIL_PROVIDER is unset/'console' — no real email was sent. Set EMAIL_PROVIDER=resend + RESEND_API_KEY to send real emails.)",
    );
  },
};
