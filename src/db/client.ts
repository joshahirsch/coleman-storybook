import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __colemanStorybookDbClient: ReturnType<typeof postgres> | undefined;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and configure it — see docs/deployment.md.",
  );
}

const isProduction = process.env.NODE_ENV === "production";

/**
 * Connection-pool sizing is a production correctness concern here, not a
 * tuning nicety.
 *
 * Production runs on Vercel serverless behind Supabase's Supavisor pooler,
 * which caps *client* connections per project (15 on the current plan). Every
 * warm lambda instance evaluates this module once and keeps its own pool, so
 * the effective client count is `instances × max` — not `max`. The original
 * `max: 10` with no idle timeout meant two warm instances could hold all 15
 * slots open indefinitely, and every subsequent query failed with
 * `(EMAXCONNSESSION) max clients reached in session mode` — which surfaced to
 * contributors on 2026-08-18 as a generic "Something went wrong on our end."
 * on the very first step of the flow (the `email_verifications` insert inside
 * `sendVerificationCodeAction`).
 *
 * Two things prevent a recurrence:
 *  - `max: 1` in production, so one instance can never hoard slots. Serverless
 *    instances handle little concurrency each; queueing briefly inside an
 *    instance is strictly better than failing the request outright.
 *  - `idle_timeout`, so a socket that has gone quiet actually releases its
 *    pooler slot instead of holding it for the life of the instance. This is
 *    the part that was missing entirely before.
 *
 * `prepare: false` is required by Supavisor (prepared statements aren't
 * supported in transaction pooling mode) and was already correct.
 */
const client =
  global.__colemanStorybookDbClient ??
  postgres(connectionString, {
    max: isProduction ? 1 : 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 15,
    prepare: false,
  });

if (!isProduction) {
  global.__colemanStorybookDbClient = client;
}

export const db = drizzle(client, { schema });
