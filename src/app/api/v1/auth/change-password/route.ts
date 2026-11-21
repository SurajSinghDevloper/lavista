import { z } from "zod";
import { hashPassword, passwordProblem, revokeAllSessions, verifyPassword } from "@/server/auth";
import { api, badRequest, parseBody, tooMany } from "@/server/http";
import { User } from "@/server/models";
import { dbRateLimit } from "@/server/rate-limit";
import { audit } from "@/server/services/core";

const Body = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
  logoutOtherDevices: z.boolean().optional(),
});

export const POST = api({}, async ({ req, user, ip }) => {
  if (!(await dbRateLimit(`pw:${user.id}`, 5, 15 * 60))) throw tooMany();
  const body = await parseBody(req, Body);
  const problem = passwordProblem(body.newPassword);
  if (problem) throw badRequest(problem);
  const u = await User.findById(user.id).select("+passwordHash");
  if (!u || !(await verifyPassword(body.currentPassword, u.passwordHash))) {
    throw badRequest("Current password is incorrect");
  }
  u.passwordHash = await hashPassword(body.newPassword);
  u.mustChangePassword = false;
  await u.save();
  if (body.logoutOtherDevices !== false) await revokeAllSessions(user.id, "password_changed", user.sessionId);
  await audit(user, "password_change", "User", user.id, "Changed password", { ip });
  return { changed: true };
});
