import { clearAuthCookies, revokeAllSessions } from "@/server/auth";
import { api, ok } from "@/server/http";

/** Log out from every device (including this one). */
export const POST = api({}, async ({ user }) => {
  await revokeAllSessions(user.id, "logout_all");
  const res = ok({ loggedOut: true });
  clearAuthCookies(res);
  return res;
});
