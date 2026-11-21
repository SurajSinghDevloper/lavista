import { z } from "zod";
import {
  clearAuthCookies,
  clientType,
  COOKIE_REFRESH,
  revokeByRefreshToken,
  revokeSession,
} from "@/server/auth";
import { ok, publicApi, readJson } from "@/server/http";

const Body = z.object({ refreshToken: z.string().max(200).optional() });

export const POST = publicApi(async ({ req, user }) => {
  const body = Body.parse(await readJson(req));
  const token = clientType(req) === "mobile" ? body.refreshToken : req.cookies.get(COOKIE_REFRESH)?.value;
  if (token) await revokeByRefreshToken(token);
  if (user) await revokeSession(user.sessionId);
  const res = ok({ loggedOut: true });
  clearAuthCookies(res);
  return res;
});
