// Optimistic route protection (Next 16 "proxy", formerly middleware). It only
// checks the session cookie's signature and role claim, without touching the
// database, to spare users a page they can't use. It is NOT the security
// boundary: services authorize every action again.
import { NextResponse, type NextRequest } from "next/server";
import { ForbiddenError, UnauthorizedError } from "@/domain/errors";
import { SESSION_COOKIE, verifySession } from "@/server/auth/session-token";
import { errorResponse } from "@/server/http/error-mapper";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/logout"]);

const isAdminArea = (pathname: string) =>
  pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (PUBLIC_PATHS.has(pathname)) {
    // Already signed in: the login page has nothing to offer.
    if (user && pathname === "/login") return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }

  if (!user) {
    if (isApi) return errorResponse(new UnauthorizedError());
    const login = new URL("/login", req.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if (isAdminArea(pathname) && user.role !== "ADMIN") {
    if (isApi) return errorResponse(new ForbiddenError("Admins only"));
    return NextResponse.redirect(new URL("/orders", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
