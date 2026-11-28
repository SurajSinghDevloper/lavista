/**
 * Roles and what each role may do. The admin edits them in Team → Roles & permissions;
 * the shipped defaults (lib/permissions.ts) apply until then. Admin always keeps full access,
 * so nobody can lock themselves out.
 */
import { ROLES } from "@/lib/constants";
import { RESOURCES, ROLE_PERMISSIONS, type Permission } from "@/lib/permissions";
import { Setting, User } from "../models";

export type RoleDef = { value: string; label: string; color?: string; permissions: string[]; builtIn?: boolean };

const KEY = "roles";
const BUILT_IN = new Set<string>(ROLES.map((r) => r.value));
const ACTIONS = new Set(["read", "write", "delete", "approve", "all"]);
const RES = new Set<string>(RESOURCES);

export const DEFAULT_ROLE_DEFS: RoleDef[] = ROLES.map((r) => ({
  value: r.value,
  label: r.label,
  color: r.color,
  permissions: [...ROLE_PERMISSIONS[r.value]],
  builtIn: true,
}));

export function isValidPermission(p: string) {
  if (p === "*") return true;
  const [res, act, ...rest] = p.split(":");
  return !rest.length && RES.has(res) && ACTIONS.has(act);
}

function normalize(saved?: RoleDef[] | null): RoleDef[] {
  const list = saved?.length ? saved : DEFAULT_ROLE_DEFS;
  const adminLabel = list.find((r) => r.value === "admin")?.label || "Admin / Owner";
  const others = list
    .filter((r) => r.value !== "admin")
    .map((r) => ({
      value: r.value,
      label: r.label,
      color: r.color ?? "gray",
      permissions: [...new Set((r.permissions ?? []).filter((p) => p !== "*" && isValidPermission(p)))],
      builtIn: BUILT_IN.has(r.value),
    }));
  return [{ value: "admin", label: adminLabel, color: "purple", permissions: ["*"], builtIn: true }, ...others];
}

let cache: { at: number; roles: RoleDef[] } | null = null;
const TTL_MS = 15_000;

export async function getRoles(): Promise<RoleDef[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.roles;
  const doc = await Setting.findById(KEY).lean<{ value?: RoleDef[] }>();
  const roles = normalize(doc?.value);
  cache = { at: Date.now(), roles };
  return roles;
}

export async function permissionsForRole(role: string, extra: string[] = []): Promise<Permission[]> {
  const r = (await getRoles()).find((x) => x.value === role);
  return [...new Set([...(r?.permissions ?? []), ...extra.filter(isValidPermission)])] as Permission[];
}

export async function roleExists(role: string) {
  return (await getRoles()).some((r) => r.value === role);
}

/** Role values whose people should hear about something that needs `perm` (e.g. store team for material requests). */
export async function rolesWith(perm: Permission) {
  return (await getRoles()).filter((r) => r.permissions.includes("*") || r.permissions.includes(perm)).map((r) => r.value);
}

export async function saveRoles(roles: RoleDef[], userId: string) {
  const next = normalize(roles);
  // a role that still has people in it can't disappear
  const before = await getRoles();
  const dropped = before.filter((b) => !next.some((n) => n.value === b.value)).map((b) => b.value);
  if (dropped.length) {
    const inUse = await User.distinct("role", { role: { $in: dropped } });
    if (inUse.length) {
      const names = before.filter((b) => inUse.includes(b.value)).map((b) => b.label);
      throw new Error(`ROLE_IN_USE:${names.join(", ")}`);
    }
  }
  await Setting.updateOne({ _id: KEY }, { $set: { value: next, updatedBy: userId } }, { upsert: true });
  cache = null;
  return getRoles();
}

export async function resetRoles(userId: string) {
  return saveRoles(DEFAULT_ROLE_DEFS, userId);
}
