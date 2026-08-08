/**
 * Local dev/test runner for the processing job queue. In production this
 * logic is invoked by POST /api/jobs/process (see that route), which a
 * scheduler such as Vercel Cron calls on an interval — see
 * docs/architecture.md Section 3 for why V1 uses a DB-backed queue instead
 * of standing up a separate worker/message-queue service.
 *
 * Run with: npm run jobs:process
 * (env loaded via `tsx --env-file=.env.local`, Node 22's native env-file support)
 */
import { runJobProcessingCycle } from "@/lib/job-runner";

async function main() {
  const result = await runJobProcessingCycle();
  console.log(`Processed ${result.processed} job(s): ${result.succeeded} succeeded, ${result.failed} failed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Job processing cycle failed:", err);
  process.exit(1);
});
