import { execSync } from "node:child_process";

/**
 * Reseeds the database to a known synthetic baseline before every E2E run.
 *
 * Why this exists: the E2E suite exercises real mutations (admin approve/
 * favorite/notes, real uploads, real submission-state transitions) against
 * a persistent Postgres instance, not a mocked store. Without resetting
 * first, state from a previous run (e.g. a submission left APPROVED and
 * favorited) leaks into the next run and silently changes fixture
 * assumptions — for example, which synthetic contributor a broad text
 * search returns first. `src/db/seed.ts` is already idempotent
 * (TRUNCATE ... RESTART IDENTITY CASCADE), so running it here just makes
 * "run the suite twice in a row" produce the same result both times.
 */
export default function globalSetup() {
  execSync("npm run db:seed", {
    cwd: __dirname + "/..",
    stdio: "inherit",
  });
}
