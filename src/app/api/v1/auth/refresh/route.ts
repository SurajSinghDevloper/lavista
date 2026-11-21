import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clearAuthCookies,
  clientType,
  COOKIE_REFRESH,
  rotateRefreshToken,
  setAuthCookies,
} from "@/server/auth";
import { ok, publicApi, readJson } from "@/server/http";

const Body = z.object({ refreshToken: z.string().min(20).max(200).optional() });

function expired(clearCookies: boolean) {
  const res = NextResponse.json(
    { success: false, error: { code: "SESSION_EXPIRED", message: "Session expired. Please log in again." } },
    { status: 401 }
  );
  if (clearCookies) clearAuthCookies(res);
  return res;
}

/**
 * Exchange a refresh token for a new access + refresh token pair (rotation).
 * Web: refresh token is read from the httpOnly cookie.
 * Mobile (header `X-Client-Type: mobile`): send `{ refreshToken }` in the body.
 */
export const POST = publicApi(async ({ req, ip }) => {
  const client = clientType(req);
  const body = Body.parse(await readJson(req));
  const token = client === "mobile" ? body.refreshToken : req.cookies.get(COOKIE_REFRESH)?.value;
  if (!token) return expired(client === "web");

  const tokens = await rotateRefreshToken(token, {
    client,
    ip,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  if (!tokens) return expired(client === "web");

  if (client === "mobile") {
    return ok({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresIn: tokens.expiresIn });
  }
  const res = ok({ expiresIn: tokens.expiresIn });
  setAuthCookies(res, tokens);
  return res;
});
