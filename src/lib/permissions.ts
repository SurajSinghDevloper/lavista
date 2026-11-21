import type { Role } from "./constants";

/**
 * Permission strings are `<resource>:<action>`.
 *   read   – list / view
 *   write  – create / update
 *   delete – delete
 *   approve– approve quotations, material requests, designs etc.
 *   all    – see every record (otherwise data is scoped to the user / assigned sites)
 */
export const RESOURCES = [
  "dashboard",
  "leads",
  "followups",
  "site_visits",
  "clients",
  "projects",
  "designs",
  "quotations",
  "vendors",
  "contractors",
  "workorders",
  "materials",
  "inventory",
  "material_requests",
  "purchase_orders",
  "grn",
  "tasks",
  "daily_reports",
  "checklists",
  "payments",
  "invoices",
  "expenses",
  "accounts",
  "reports",
  "users",
  "attendance",
  "settings",
  "files",
  "audit",
] as const;
export type Resource = (typeof RESOURCES)[number];
export type Action = "read" | "write" | "delete" | "approve" | "all";
export type Permission = `${Resource}:${Action}` | "*";

const rw = (r: Resource): Permission[] => [`${r}:read`, `${r}:write`];
const rwd = (r: Resource): Permission[] => [`${r}:read`, `${r}:write`, `${r}:delete`];
const full = (r: Resource): Permission[] => [`${r}:read`, `${r}:write`, `${r}:delete`, `${r}:approve`, `${r}:all`];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ["*"],
  manager: [
    "dashboard:read",
    ...full("leads"),
    ...full("followups"),
    ...full("site_visits"),
    ...full("clients"),
    ...full("projects"),
    ...full("designs"),
    ...full("quotations"),
    ...full("vendors"),
    ...full("contractors"),
    ...full("workorders"),
    ...full("materials"),
    ...full("inventory"),
    ...full("material_requests"),
    ...full("purchase_orders"),
    ...full("grn"),
    ...full("tasks"),
    ...full("daily_reports"),
    ...full("checklists"),
    "payments:read",
    "payments:all",
    "invoices:read",
    "invoices:all",
    ...rw("expenses"),
    "expenses:all",
    "accounts:read",
    "reports:read",
    "users:read",
    ...rw("attendance"),
    "attendance:all",
    ...rwd("files"),
    "files:all",
    "settings:read",
  ],
  designer: [
    "dashboard:read",
    "leads:read",
    ...rw("followups"),
    ...rw("site_visits"),
    "clients:read",
    "projects:read",
    ...rwd("designs"),
    "designs:approve",
    ...rw("quotations"),
    "materials:read",
    ...rw("material_requests"),
    ...rw("tasks"),
    "daily_reports:read",
    "checklists:read",
    ...rw("files"),
    ...rw("attendance"),
    "users:read",
    "settings:read",
  ],
  supervisor: [
    "dashboard:read",
    "projects:read",
    "designs:read",
    ...rw("site_visits"),
    "contractors:read",
    "workorders:read",
    "materials:read",
    "inventory:read",
    ...rw("material_requests"),
    "purchase_orders:read",
    ...rw("grn"),
    ...rw("tasks"),
    ...rw("daily_reports"),
    ...rw("checklists"),
    ...rw("files"),
    ...rw("attendance"),
    "users:read",
    "settings:read",
  ],
  accountant: [
    "dashboard:read",
    "clients:read",
    "projects:read",
    "projects:all",
    "quotations:read",
    "quotations:all",
    "vendors:read",
    "vendors:all",
    "contractors:read",
    "contractors:all",
    "workorders:read",
    "workorders:all",
    "purchase_orders:read",
    "purchase_orders:all",
    "grn:read",
    "grn:all",
    ...full("payments"),
    ...full("invoices"),
    ...full("expenses"),
    "accounts:read",
    "reports:read",
    ...rw("tasks"),
    ...rw("files"),
    ...rw("attendance"),
    "users:read",
    "settings:read",
  ],
  store: [
    "dashboard:read",
    "projects:read",
    "projects:all",
    "vendors:read",
    "vendors:all",
    ...full("materials"),
    ...full("inventory"),
    "material_requests:read",
    "material_requests:write",
    "material_requests:all",
    ...rw("purchase_orders"),
    "purchase_orders:all",
    ...rw("grn"),
    "grn:all",
    ...rw("tasks"),
    ...rw("files"),
    ...rw("attendance"),
    "users:read",
    "settings:read",
  ],
  staff: [
    "dashboard:read",
    ...rw("leads"),
    "leads:all",
    ...rw("followups"),
    "followups:all",
    ...rw("site_visits"),
    "site_visits:all",
    ...rw("clients"),
    "clients:all",
    "projects:read",
    "quotations:read",
    "vendors:read",
    "vendors:all",
    "contractors:read",
    "contractors:all",
    ...rw("tasks"),
    ...rw("files"),
    ...rw("attendance"),
    "users:read",
    "settings:read",
  ],
};

export function permissionsFor(role: Role, extra: string[] = []): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? []), ...(extra as Permission[])];
}

export function can(perms: readonly string[] | undefined, required: Permission | Permission[]) {
  if (!perms) return false;
  if (perms.includes("*")) return true;
  const list = Array.isArray(required) ? required : [required];
  return list.every((p) => perms.includes(p));
}

export function canAny(perms: readonly string[] | undefined, required: Permission[]) {
  if (!perms) return false;
  if (perms.includes("*")) return true;
  return required.some((p) => perms.includes(p));
}
