/**
 * Local-development-only convenience: repeatedly runs the same processing
 * cycle `POST /api/jobs/process` runs in production, so a developer testing
 * locally with `TRANSCRIPTION_PROVIDER="fake"` never has to remember to run
 * `npm run jobs:process` by hand. Without this, submissions sit in
 * PROCESSING/STARTED indefinitely in the local admin dashboard — which is
 * exactly what happened during a real testing session on 2026-08-09 (two
 * real recordings stuck showing PROCESSING with no indication anything was
 * ever going to move them along). See docs/decision-log.md DL-018.
 *
 * Started once from src/instrumentation.ts's register() hook. Deliberately
 * scoped tightly so it can never affect production:
 *   - only runs when NODE_ENV !== "production" (see startDevJobPoller())
 *   - only runs when TRANSCRIPTION_PROVIDER isn't "none" (nothing would
 *     ever be enqueued in that mode anyway — see docs/decision-log.md DL-009)
 * Production keeps using a real external scheduler (Vercel Cron hitting
 * POST /api/jobs/process with CRON_SECRET) — an in-process setInterval
 * would be the wrong mechanism there regardless (unreliable across
 * multiple serverless instances, no auth boundary, keeps a process alive
 * that's meant to be able to scale to zero). See docs/architecture.md
 * Section 3 and docs/deployment.md's "Scheduled job runner" row.
 */

const POLL_INTERVAL_MS = 4000;

let started = false;

export function startDevJobPoller(): void {
  if (started) return; // defense in depth against a double register() call
  started = true;

  console.log(
    `Coleman Storybook (dev): auto-processing submissions every ${POLL_INTERVAL_MS / 1000}s ` +
      `(TRANSCRIPTION_PROVIDER=${process.env.TRANSCRIPTION_PROVIDER}). ` +
      "Run `npm run jobs:process` yourself any time you want this to happen immediately instead of waiting.",
  );

  const tick = async () => {
    try {
      const { runJobProcessingCycle } = await import("@/lib/job-runner");
      const result = await runJobProcessingCycle();
      if (result.processed > 0) {
        console.log(
          `Coleman Storybook (dev): processed ${result.processed} job(s) — ${result.succeeded} succeeded, ${result.failed} failed.`,
        );
      }
    } catch (err) {
      // Never let a transient failure (e.g. the DB briefly unreachable
      // during a restart) kill the poller — just log and try again next
      // tick, same as a real scheduler would retry on its own interval.
      console.error("Coleman Storybook (dev): job auto-processing cycle failed:", err);
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
  // Don't let this background convenience timer keep the process alive by
  // itself (e.g. during `npm run build`'s brief server spin-up, or when
  // Playwright tears down its E2E webServer) — a real request or an open
  // server socket should be what keeps the process running, not this.
  timer.unref?.();
}
