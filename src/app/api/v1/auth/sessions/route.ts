import { api } from "@/server/http";
import { Session, serialize } from "@/server/models";

/** Devices where the current user is logged in. */
export const GET = api({}, async ({ user }) => {
  const rows = await Session.find({ user: user.id, revokedAt: null, expiresAt: { $gt: new Date() } })
    .select("client deviceName userAgent ip lastUsedAt createdAt expiresAt")
    .sort("-lastUsedAt")
    .lean();
  return serialize(rows).map((s: { id: string }) => ({ ...s, current: s.id === user.sessionId }));
});
