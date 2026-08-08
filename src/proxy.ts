import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Edge-level gate for the admin surface. Next.js 16 renamed the
 * `middleware.ts` convention to `proxy.ts` (functionally identical) — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
 *
 * This is deliberately "fail closed": any request under /admin (other than
 * the login page and its form action) without a valid, unexpired,
 * correctly-signed session cookie is redirected to /admin/login before any
 * page or API handler code runs. This is defense in depth on top of the
 * per-request checks in src/lib/auth/session.ts and the data-access layer —
 * see docs/security.md.
 */

const COOKIE_NAME = "coleman_storybook_admin_session";

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET ?? "";
  return new TextEncoder().encode(secret);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminRoute = pathname.startsWith("/admin");
  const isAdminApiRoute = pathname.startsWith("/api/admin");
  if (!isAdminRoute && !isAdminApiRoute) {
    return NextResponse.next();
  }

  const isPublicAdminPath = pathname === "/admin/login" || pathname === "/api/admin/login";
  if (isPublicAdminPath) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return denyOrRedirect(request, isAdminApiRoute);
  }

  try {
    await jwtVerify(token, getSecretKey());
    return NextResponse.next();
  } catch {
    return denyOrRedirect(request, isAdminApiRoute);
  }
}

function denyOrRedirect(request: NextRequest, isApi: boolean) {
  if (isApi) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
