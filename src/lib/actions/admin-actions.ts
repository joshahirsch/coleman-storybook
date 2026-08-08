"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { adminUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { adminLoginSchema, adminReviewUpdateSchema, type AdminReviewUpdateInput } from "@/lib/validation";
import { verifyPassword } from "@/lib/auth/password";
import { createAdminSession, destroyAdminSession, requireAdminSession } from "@/lib/auth/session";
import { upsertAdminReview } from "@/lib/data/admin";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { headers } from "next/headers";

export interface AdminLoginResult {
  ok: boolean;
  error?: string;
}

export async function adminLoginAction(_prevState: AdminLoginResult, formData: FormData): Promise<AdminLoginResult> {
  const hdrs = await headers();
  const ip = clientIpFromHeaders(hdrs);
  const rl = checkRateLimit(`admin-login:${ip}`, { maxRequests: 10, windowSeconds: 900 });
  if (!rl.allowed) {
    return { ok: false, error: "Too many login attempts. Please wait and try again." };
  }

  const parsed = adminLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and password." };
  }

  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, parsed.data.email)).limit(1);

  // Constant-shape response whether the account exists or not, to avoid
  // leaking which emails are registered admins.
  const genericError = "Incorrect email or password.";
  if (!admin || !admin.active) {
    return { ok: false, error: genericError };
  }

  const validPassword = await verifyPassword(parsed.data.password, admin.passwordHash);
  if (!validPassword) {
    await logAuditEvent({
      organizationId: admin.organizationId,
      actorType: "admin",
      actorId: admin.id,
      eventType: "admin_login_failed",
      subjectType: "admin_user",
      subjectId: admin.id,
    });
    return { ok: false, error: genericError };
  }

  await createAdminSession({ adminUserId: admin.id, organizationId: admin.organizationId, email: admin.email });
  await logAuditEvent({
    organizationId: admin.organizationId,
    actorType: "admin",
    actorId: admin.id,
    eventType: "admin_login_succeeded",
    subjectType: "admin_user",
    subjectId: admin.id,
  });

  redirect("/admin/dashboard");
}

export async function adminLogoutAction(): Promise<void> {
  await destroyAdminSession();
  redirect("/admin/login");
}

export async function updateAdminReviewAction(input: AdminReviewUpdateInput): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession().catch(() => null);
  if (!session) return { ok: false, error: "Not authenticated." };

  const parsed = adminReviewUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await upsertAdminReview({
    submissionId: parsed.data.submissionId,
    adminUserId: session.adminUserId,
    editorialState: parsed.data.editorialState,
    notes: parsed.data.notes,
    favorite: parsed.data.favorite,
  });

  await logAuditEvent({
    organizationId: session.organizationId,
    actorType: "admin",
    actorId: session.adminUserId,
    eventType: "admin_review_updated",
    subjectType: "submission",
    subjectId: parsed.data.submissionId,
    metadata: {
      editorialState: parsed.data.editorialState,
      favoriteChanged: parsed.data.favorite !== undefined,
      notesChanged: parsed.data.notes !== undefined,
    },
  });

  return { ok: true };
}
