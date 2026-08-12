import type { EmailProvider } from "./types";

/**
 * Resend email provider (owner decision, 2026-08-12 — see
 * docs/resend-setup.md for the one-time account/API-key setup and the
 * "Coleman Storybook — Email OTP Verification" project doc for the
 * rationale). Talks to Resend's HTTP API directly via `fetch` rather than
 * pulling in the `resend` npm package — same pattern already used for
 * Google Drive (`src/lib/storage/google-drive-adapter.ts`): one dependency
 * fewer, and the request/response shape is simple enough that a thin SDK
 * wrapper wouldn't save much.
 */

const RESEND_API = "https://api.resend.com/emails";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — see docs/resend-setup.md and .env.example.`);
  }
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const resendEmailProvider: EmailProvider = {
  async sendVerificationCode({ to, code, firstName }) {
    const apiKey = getEnv("RESEND_API_KEY");
    const from = getEnv("RESEND_FROM_EMAIL");

    const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,";
    const html =
      `<p>${greeting}</p>` +
      `<p>Your Coleman Storybook verification code is:</p>` +
      `<p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p>` +
      `<p>This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>`;
    const text =
      `${firstName ? `Hi ${firstName},` : "Hi,"}\n\n` +
      `Your Coleman Storybook verification code is: ${code}\n\n` +
      `This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.`;

    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Your Coleman Storybook verification code",
        html,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend send failed (${res.status}): ${body}`);
    }
  },
};
