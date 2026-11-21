import { revokeSession } from "@/server/auth";
import { api, assertId, notFound } from "@/server/http";
import { Session } from "@/server/models";

/** Log out a specific device. */
export const DELETE = api({}, async ({ user, params }) => {
  const id = assertId(params.id);
  const s = await Session.findOne({ _id: id, user: user.id });
  if (!s) throw notFound("Session not found");
  await revokeSession(id, "revoked_by_user");
  return { id };
});
