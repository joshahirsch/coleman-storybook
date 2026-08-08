import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __colemanStorybookDbClient: ReturnType<typeof postgres> | undefined;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and configure it — see docs/deployment.md.",
  );
}

// Reuse a single connection pool across hot reloads in dev.
const client =
  global.__colemanStorybookDbClient ??
  postgres(connectionString, { max: 10, prepare: false });

if (process.env.NODE_ENV !== "production") {
  global.__colemanStorybookDbClient = client;
}

export const db = drizzle(client, { schema });
