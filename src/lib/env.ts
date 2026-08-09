/**
 * Centralized required-environment-variable validation.
 *
 * Before this file existed, `src/lib/hash.ts` and `src/lib/auth/session.ts`
 * each independently guarded against a missing/too-short `SESSION_SECRET`
 * by throwing deep inside a request handler (`hashIp()`, `getSecretKey()`).
 * That fail-closed behavior is correct, but it means a misconfigured
 * secret only surfaces the first time some contributor happens to reach
 * the consent step, or the first time someone happens to log into
 * `/admin` — and from the browser, an uncaught server-side throw during a
 * Server Action looks exactly like a network failure (see
 * `src/components/public/contributor-flow.tsx`'s error handling). That's
 * exactly what happened locally on 2026-08-09: a 9-character
 * `SESSION_SECRET` in `.env.local` (below the 16-character minimum) made
 * the consent step fail with a generic "Network error" message that had
 * nothing to do with the network.
 *
 * `src/instrumentation.ts` calls `validateRequiredEnv()` once, at server
 * startup, via Next.js's `register()` hook (stable since Next 15 — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
 * That way a bad secret fails loudly in the terminal immediately, before
 * any request is served, instead of silently later as a confusing
 * client-side error that a contributor (not a developer) is the one to hit.
 */

const MIN_SESSION_SECRET_LENGTH = 16;

/**
 * Returns the validated `SESSION_SECRET`, or throws a clear, actionable
 * error. Used by both `src/lib/hash.ts` (contributor IP hashing) and
 * `src/lib/auth/session.ts` (admin JWT signing) so the requirement is
 * defined in exactly one place.
 */
export function getRequiredSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET is not set (or shorter than ${MIN_SESSION_SECRET_LENGTH} characters) — see .env.example. ` +
        "Generate a real one with: openssl rand -base64 32",
    );
  }
  return secret;
}

/**
 * Called once at server startup (see `src/instrumentation.ts`). Checks
 * every environment variable the app cannot safely run without, and — if
 * any are missing or invalid — logs all of them together and throws,
 * which stops the server from starting in a half-working state.
 *
 * Deliberately conservative about what's "required" here: this should only
 * include variables whose absence causes a hard failure somewhere in the
 * app (not merely a feature being disabled — e.g. `TRANSCRIPTION_PROVIDER`
 * defaulting is fine and NOT validated here).
 */
export function validateRequiredEnv(): void {
  const problems: string[] = [];

  try {
    getRequiredSessionSecret();
  } catch (err) {
    problems.push(err instanceof Error ? err.message : String(err));
  }

  if (!process.env.DATABASE_URL) {
    problems.push("DATABASE_URL is not set — see .env.example.");
  }

  if (problems.length > 0) {
    console.error(
      "\n⚠️  Coleman Storybook: invalid environment configuration:\n" +
        problems.map((p) => `   - ${p}`).join("\n") +
        "\n   Fix .env.local (dev) or the hosting platform's environment variables (production), then restart.\n",
    );
    throw new Error("Invalid environment configuration — see the errors logged above.");
  }
}
