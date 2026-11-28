/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";
import { RESOURCES } from "@/lib/permissions";
import { hashPassword, passwordProblem, revokeAllSessions } from "../auth";
import { crud } from "../crud";
import { can } from "@/lib/permissions";
import { api, assertId, badRequest, forbidden, notFound, parseBody } from "../http";
import { User } from "../models";
import { audit } from "../services/core";
import { roleExists } from "../services/roles";
import { zBool, zDate, zEmail, zOption, zOptOption, zOptPhone, zText } from "../validators";

const perm = z.string().refine(
  (p) => /^[a-z_]+:(read|write|delete|approve|all)$/.test(p) && RESOURCES.includes(p.split(":")[0] as never),
  "One of the selected extra permissions is not recognised"
);

const base = {
  name: z.string().trim().min(2).max(100),
  phone: zOptPhone,
  role: zOption,
  designation: zText(100),
  department: zOptOption,
  joiningDate: zDate,
  address: zText(300),
  emergencyContact: zText(100),
  notes: zText(1000),
  isActive: zBool,
  extraPermissions: z.array(perm).max(100).optional(),
};

const createSchema = z.object({
  ...base,
  email: z.email().trim().toLowerCase().max(200),
  password: z.string().min(8).max(200),
});
const updateSchema = z.object({ ...base, email: zEmail }).partial();

/** Admin powers can only be handed out by an admin (a manager with "users:write" can't promote anyone). */
async function checkRoleChange(data: any, existing: any, ctx: any) {
  if (data.role && !(await roleExists(data.role))) throw badRequest("Please choose a valid role.");
  const isAdmin = can(ctx.user.permissions, "*");
  if (!isAdmin && (data.role === "admin" || existing?.role === "admin")) throw forbidden("Only an admin can give or change admin access.");
  if (!isAdmin && data.extraPermissions !== undefined) throw forbidden("Only an admin can give extra permissions.");
}

async function ensureAnotherAdmin(excludeId: string) {
  const admins = await User.countDocuments({ role: "admin", isActive: true, _id: { $ne: excludeId } });
  if (admins === 0) throw badRequest("At least one active admin is required");
}

export const users = crud({
  model: User,
  resource: "users",
  entity: "User",
  createSchema,
  updateSchema,
  search: ["name", "email", "phone", "designation"],
  filters: { role: "list", department: "string", isActive: "bool" },
  sortable: ["name", "createdAt", "role", "lastLoginAt"],
  defaultSort: "name",
  populate: { path: "avatar", select: "storageKey mimeType" },
  beforeCreate: async (data, ctx) => {
    await checkRoleChange(data, null, ctx);
    const problem = passwordProblem(data.password);
    if (problem) throw badRequest(problem);
    data.passwordHash = await hashPassword(data.password);
    data.mustChangePassword = true;
    delete data.password;
    return data;
  },
  beforeUpdate: async (data, existing, ctx) => {
    await checkRoleChange(data, existing, ctx);
    const id = String(existing._id);
    const demoting = data.role && data.role !== "admin" && existing.role === "admin";
    const deactivating = data.isActive === false && existing.isActive;
    if (id === ctx.user.id && (demoting || deactivating)) {
      throw badRequest("You cannot change your own role or deactivate yourself");
    }
    if (demoting || (deactivating && existing.role === "admin")) await ensureAnotherAdmin(id);
    if ((data.role && data.role !== existing.role) || deactivating || data.extraPermissions) {
      // Force existing tokens to be re-issued with the new permissions.
      data.tokenVersion = (existing.tokenVersion ?? 0) + 1;
    }
    if (deactivating) await revokeAllSessions(id, "deactivated");
    return data;
  },
});

/** DELETE = deactivate (keeps history intact). */
export const deactivateUser = api({ perm: "users:delete" }, async ({ params, user, ip }) => {
  const id = assertId(params.id);
  if (id === user.id) throw badRequest("You cannot deactivate yourself");
  const u = await User.findById(id);
  if (!u) throw notFound("User not found");
  if (u.role === "admin" && !can(user.permissions, "*")) throw forbidden("Only an admin can deactivate another admin.");
  if (u.role === "admin") await ensureAnotherAdmin(id);
  u.isActive = false;
  u.tokenVersion = (u.tokenVersion ?? 0) + 1;
  await u.save();
  await revokeAllSessions(id, "deactivated");
  await audit(user, "deactivate", "User", id, `Deactivated ${u.name}`, { ip });
  return { id };
});

export const resetPassword = api({ perm: "users:write" }, async ({ req, params, user, ip }) => {
  const id = assertId(params.id);
  const { password } = await parseBody(req, z.object({ password: z.string().min(8).max(200) }));
  const problem = passwordProblem(password);
  if (problem) throw badRequest(problem);
  const u = await User.findById(id);
  if (!u) throw notFound("User not found");
  if (u.role === "admin" && !can(user.permissions, "*")) throw forbidden("Only an admin can reset an admin's password.");
  u.passwordHash = await hashPassword(password);
  u.mustChangePassword = true;
  u.failedLogins = 0;
  u.lockUntil = undefined;
  u.tokenVersion = (u.tokenVersion ?? 0) + 1;
  await u.save();
  await revokeAllSessions(id, "password_reset");
  await audit(user, "password_reset", "User", id, `Reset password for ${u.name}`, { ip });
  return { reset: true };
});

/** Minimal list for dropdowns – any logged-in user. */
export const userLookup = api({}, async ({ req }) => {
  const role = req.nextUrl.searchParams.get("role");
  const filter: any = { isActive: true };
  if (role) filter.role = { $in: role.split(",").slice(0, 10) };
  const rows = await User.find(filter).select("name role designation").sort("name").limit(500).lean();
  return rows.map((r: any) => ({ id: String(r._id), name: r.name, role: r.role, designation: r.designation }));
});
