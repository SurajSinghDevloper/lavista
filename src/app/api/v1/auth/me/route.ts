import { z } from "zod";
import { api, notFound, parseBody } from "@/server/http";
import { User } from "@/server/models";
import { zOptPhone, zRef, zText } from "@/server/validators";

async function profile(userId: string, permissions: string[]) {
  const user = await User.findById(userId).populate("avatar", "storageKey mimeType");
  if (!user) throw notFound();
  return { ...user.toJSON(), permissions };
}

export const GET = api({}, async ({ user }) => profile(user.id, user.permissions));

const Body = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: zOptPhone,
  address: zText(300),
  emergencyContact: zText(100),
  avatar: zRef,
});

/** Users can update their own basic profile. Role/permissions are admin-only (see /users). */
export const PATCH = api({}, async ({ req, user }) => {
  const data = await parseBody(req, Body);
  await User.updateOne({ _id: user.id }, { $set: data });
  return profile(user.id, user.permissions);
});
