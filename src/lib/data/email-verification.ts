import { db } from "@/db/client";
import { emailVerifications } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

const CODE_TTL_SECONDS = 10 * 60;
/** Max wrong-code attempts against one issued code before it's locked out and a fresh one is required. */
export const MAX_VERIFY_ATTEMPTS = 5;

export async function createEmailVerification(email: string, codeHash: string) {
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000);
  const [row] = await db
    .insert(emailVerifications)
    .values({ email: email.toLowerCase(), codeHash, expiresAt })
    .returning();
  return row;
}

/** Most recent verification row for this email, regardless of state — callers check `expiresAt`/`verifiedAt`/`attempts` themselves. */
export async function getLatestEmailVerification(email: string) {
  const [row] = await db
    .select()
    .from(emailVerifications)
    .where(eq(emailVerifications.email, email.toLowerCase()))
    .orderBy(desc(emailVerifications.createdAt))
    .limit(1);
  return row ?? null;
}

/** Atomically increments `attempts` (a DB-level `attempts = attempts + 1`, not read-then-write, so two concurrent wrong guesses against the same code can't undercount each other) and returns the new count. */
export async function incrementVerificationAttempts(id: string): Promise<number> {
  const [row] = await db
    .update(emailVerifications)
    .set({ attempts: sql`${emailVerifications.attempts} + 1` })
    .where(eq(emailVerifications.id, id))
    .returning({ attempts: emailVerifications.attempts });
  return row?.attempts ?? MAX_VERIFY_ATTEMPTS;
}

export async function markEmailVerified(id: string): Promise<void> {
  await db.update(emailVerifications).set({ verifiedAt: new Date() }).where(eq(emailVerifications.id, id));
}
