/**
 * Runs once when a new Next.js server instance starts, before any request
 * is handled — Next.js's `register()` hook, stable since v15 (see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
 *
 * We use it purely for fail-fast environment validation (see
 * `src/lib/env.ts` for the full rationale and what's checked): a
 * misconfigured `SESSION_SECRET` should stop `npm run dev` / the
 * production server cold, with a clear terminal message, rather than
 * surfacing later as a confusing generic error on whatever request path
 * happens to touch it first.
 *
 * Gated to the Node.js runtime only — `register()` also fires for the Edge
 * runtime (which `src/proxy.ts` runs under), where `DATABASE_URL` isn't
 * relevant and a hard throw would be the wrong failure mode for edge
 * middleware.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateRequiredEnv } = await import("./lib/env");
    validateRequiredEnv();
  }
}
