import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth gate for UI routes only (API routes verify tokens themselves).
 * The `lv_in` cookie is a non-sensitive hint set at login; real checks happen in /api.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const loggedIn = request.cookies.has("lv_in");
  if (!loggedIn && pathname !== "/login") {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|.*\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)"],
};
