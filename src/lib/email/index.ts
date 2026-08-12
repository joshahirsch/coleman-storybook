import type { EmailProvider } from "./types";
import { consoleEmailProvider } from "./console-provider";
import { resendEmailProvider } from "./resend-provider";

/** Provider-abstraction entry point, same shape as `src/lib/storage/index.ts`'s `getStorageAdapter()`. "console" (default) is the dev/local fallback; "resend" is the real production sender — see docs/resend-setup.md. */
export function getEmailProvider(): EmailProvider {
  const driver = process.env.EMAIL_PROVIDER ?? "console";
  switch (driver) {
    case "console":
      return consoleEmailProvider;
    case "resend":
      return resendEmailProvider;
    default:
      throw new Error(`Unknown EMAIL_PROVIDER "${driver}". Implemented: "console", "resend". See docs/resend-setup.md.`);
  }
}
