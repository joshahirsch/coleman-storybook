/**
 * Create (or update) a real admin user — safe to run against production.
 *
 * This is the deliberate counterpart to `src/db/seed.ts`: seed.ts is
 * destructive (TRUNCATEs every table) and refuses to run in production;
 * this script does a single targeted insert/update on `admin_users` and
 * is meant to be run in production, once a real database exists, to
 * create the first real admin account (see
 * docs/production-launch-checklist.md Section 2, item 5 — Josh Hirsch,
 * josh.hirsch@gmail.com).
 *
 * Usage:
 *   ADMIN_EMAIL="josh.hirsch@gmail.com" \
 *   ADMIN_NAME="Josh Hirsch" \
 *   npx tsx --env-file=.env.local src/scripts/create-admin.ts
 *
 * ADMIN_PASSWORD is optional. If omitted, a strong random password is
 * generated and printed ONCE to stdout — copy it out immediately (e.g.
 * into a password manager) and hand it to the admin out of band (never
 * via email in plaintext, never committed anywhere). The script does not
 * persist the plaintext anywhere; only the bcrypt hash is stored.
 *
 * Safe to re-run: if ADMIN_EMAIL already exists, this UPDATES that row's
 * display name and (only if ADMIN_PASSWORD or --reset-password is given)
 * password, rather than erroring or creating a duplicate. Running it with
 * no password change intended (just to confirm/update the display name)
 * never touches the existing password hash.
 *
 * Requires exactly one organization to already exist (true for this
 * single-org V1 — see src/lib/data/organization.ts). Refuses to run
 * against a database with zero or more than one organization rather than
 * guessing which org to attach the admin to.
 */
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adminUsers, organizations } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

function generateStrongPassword(): string {
  // 24 bytes of entropy, base64url-encoded (~32 chars, no ambiguous
  // padding/slashes) — comfortably beyond what a human needs to type once
  // before storing it in a password manager.
  return crypto.randomBytes(24).toString("base64url");
}

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const displayName = process.env.ADMIN_NAME?.trim();
  const explicitPassword = process.env.ADMIN_PASSWORD;
  const resetPassword = process.argv.includes("--reset-password");

  if (!email || !displayName) {
    console.error(
      "Usage: ADMIN_EMAIL=\"...\" ADMIN_NAME=\"...\" [ADMIN_PASSWORD=\"...\"] " +
        "npx tsx --env-file=.env.local src/scripts/create-admin.ts [--reset-password]\n\n" +
        "ADMIN_EMAIL and ADMIN_NAME are required. ADMIN_PASSWORD is optional — " +
        "omit it to have a strong random password generated and printed once.",
    );
    process.exit(1);
  }

  const orgs = await db.select().from(organizations);
  if (orgs.length === 0) {
    console.error(
      "No organization found. Run the schema/data setup for this deployment " +
        "before creating an admin (an organization row must exist first).",
    );
    process.exit(1);
  }
  if (orgs.length > 1) {
    console.error(
      `Found ${orgs.length} organizations; this script assumes single-org V1 ` +
        "(src/lib/data/organization.ts) and refuses to guess which one to " +
        "attach the admin to. Update this script if multi-org support has " +
        "landed since it was written.",
    );
    process.exit(1);
  }
  const org = orgs[0];

  const [existing] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);

  const shouldSetPassword = !existing || !!explicitPassword || resetPassword;
  let plaintextToPrint: string | null = null;
  let passwordHash: string | undefined;

  if (shouldSetPassword) {
    const plaintext = explicitPassword ?? generateStrongPassword();
    if (!explicitPassword) plaintextToPrint = plaintext;
    passwordHash = await hashPassword(plaintext);
  }

  if (existing) {
    await db
      .update(adminUsers)
      .set({
        displayName,
        active: true,
        ...(passwordHash ? { passwordHash } : {}),
      })
      .where(eq(adminUsers.id, existing.id));
    console.log(`Updated existing admin: ${email} (${displayName})`);
    console.log(shouldSetPassword ? "Password was reset." : "Password left unchanged.");
  } else {
    if (!passwordHash) {
      // Unreachable given shouldSetPassword logic above, but keeps
      // TypeScript honest and fails loudly instead of inserting a null hash.
      throw new Error("Internal error: no password hash computed for new admin.");
    }
    await db.insert(adminUsers).values({
      organizationId: org.id,
      email,
      displayName,
      passwordHash,
      active: true,
    });
    console.log(`Created new admin: ${email} (${displayName}) in organization "${org.name}"`);
  }

  if (plaintextToPrint) {
    console.log("\n" + "=".repeat(72));
    console.log("GENERATED PASSWORD (shown once — copy it now, then close this terminal):");
    console.log(plaintextToPrint);
    console.log("=".repeat(72));
    console.log(
      "\nHand this to the admin out of band (password manager share, not " +
        "email/Slack in plaintext). It is not stored anywhere except as a " +
        "bcrypt hash in the database.",
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("create-admin failed:", err);
  process.exit(1);
});
