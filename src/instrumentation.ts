/**
 * Runs once when a new Next.js server instance starts, before any request
 * is handled — Next.js's `register()` hook, stable since v15 (see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
 *
 * Two responsibilities, both startup-time, both Node.js-runtime-only
 * (`register()` also fires for the Edge runtime, which `src/proxy.ts` runs
 * under — neither of these belongs there):
 *
 * 1. Fail-fast environment validation (see `src/lib/env.ts`): a
 *    misconfigured `SESSION_SECRET` should stop `npm run dev` / the
 *    production server cold, with a clear terminal message, rather than
 *    surfacing later as a confusing generic error on whatever request path
 *    happens to touch it first.
 * 2. In local dev only, start the job auto-processor (see
 *    `src/lib/dev-job-poller.ts`) so submissions don't sit in
 *    PROCESSING/STARTED forever waiting for someone to remember to run
 *    `npm run jobs:process` — production keeps using a real external
 *    scheduler instead (see that file's header comment for why).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateRequiredEnv } = await import("./lib/env");
    validateRequiredEnv();

    if (process.env.NODE_ENV !== "production" && process.env.TRANSCRIPTION_PROVIDER !== "none") {
      const { startDevJobPoller } = await import("./lib/dev-job-poller");
      startDevJobPoller();
    }
  }
}
