import { NextResponse, type NextRequest } from "next/server";

// Next.js 16: proxy.ts replaces middleware.ts.
// We run on edge, so we don't touch the DB here — just check the session
// cookie's presence. (app)/layout.tsx does the authoritative DB check.

const COOKIE = "po_session";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/api/cron/") ||
    (path.startsWith("/api/nhanh/sync-") && request.headers.get("authorization")?.startsWith("Bearer ")) ||
    path.startsWith("/api/tiktok-shop/callback") ||
    path.startsWith("/api/tiktok/callback") ||
    path.startsWith("/api/shopee/callback") ||
    path === "/favicon.ico" ||
    path === "/manifest.json" ||
    path === "/sw.js";

  if (isPublic) return NextResponse.next();

  const hasSession = !!request.cookies.get(COOKIE)?.value;
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
