import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PAGES = new Set(["/login"]);

/**
 * Optimistic checks only. Real authorization happens in every route handler,
 * which validates the session against the database.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // CSRF defense in depth (on top of SameSite=Lax cookies): state-changing API
  // calls must come from this site.
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (!origin || new URL(origin).host !== req.headers.get("host")) {
      return NextResponse.json({ error: "cross-origin request blocked" }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) return NextResponse.next();

  const signedIn = req.cookies.has("session");
  if (!signedIn && !PUBLIC_PAGES.has(pathname)) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|apple-icon.png|manifest.webmanifest|sw.js|icons/).*)"],
};
