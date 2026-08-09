import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getRequiredSessionSecret } from "@/lib/env";

/**
 * Admin session handling.
 *
 * V1 auth choice: hand-rolled, signed httpOnly-cookie sessions using `jose`
 * (a well-vetted JWT library) + bcrypt-hashed passwords, rather than wiring
 * a managed auth provider (Supabase Auth / Google Workspace SSO). No
 * external credentials exist yet to wire a managed provider, and the spec's
 * "prefer mature managed authentication" preference is satisfied here via
 * mature, audited *libraries* rather than a managed *service* — see
 * docs/decision-log.md DL-007 for the full tradeoff and the swap-in path
 * once Coleman decides between Supabase Auth and Google Workspace SSO.
 */

const COOKIE_NAME = "coleman_storybook_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

export interface AdminSessionPayload {
  adminUserId: string;
  organizationId: string;
  email: string;
}

function getSecretKey(): Uint8Array {
  // src/instrumentation.ts validates this same requirement at server
  // startup, so a misconfigured secret should already have failed loudly
  // before any request reaches this code — see src/lib/env.ts.
  return new TextEncoder().encode(getRequiredSessionSecret());
}

export async function createAdminSession(payload: AdminSessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroyAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Returns the verified session payload, or null if there is no session or
 * it fails verification (expired, tampered, wrong signature). Callers MUST
 * treat null as "not authenticated" — never render admin content, never run
 * an admin mutation, without a non-null result from this function. Route
 * boundaries are additionally enforced in `src/proxy.ts` (fail-closed at the
 * edge before any handler runs), so this is defense in depth, not the only
 * check.
 */
export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.adminUserId === "string" &&
      typeof payload.organizationId === "string" &&
      typeof payload.email === "string"
    ) {
      return {
        adminUserId: payload.adminUserId,
        organizationId: payload.organizationId,
        email: payload.email,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function requireAdminSession(): Promise<AdminSessionPayload> {
  const session = await getAdminSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}

export const ADMIN_SESSION_COOKIE_NAME = COOKIE_NAME;
