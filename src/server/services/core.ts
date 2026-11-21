/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { Types } from "mongoose";
import { can } from "@/lib/permissions";
import type { AuthUser } from "../auth";
import { forbidden, notFound } from "../http";
import { AuditLog, Notification, Project } from "../models";

/* ---------------------------- Document numbers -------------------------- */
export { financialYear, nextNumber } from "./numbering";

/* --------------------------------- Audit --------------------------------- */
export async function audit(
  user: Pick<AuthUser, "id" | "name"> | null,
  action: string,
  entityType: string,
  entityId: unknown,
  message?: string,
  extra: { project?: unknown; changes?: unknown; ip?: string } = {}
) {
  try {
    await AuditLog.create({
      user: user?.id,
      userName: user?.name,
      action,
      entityType,
      entityId,
      message,
      project: extra.project,
      changes: extra.changes,
      ip: extra.ip,
    });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}

/** Shallow diff of changed fields for the audit trail. */
export function diff(before: Record<string, any>, after: Record<string, any>, keys: string[]) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of keys) {
    const a = before?.[k];
    const b = after?.[k];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) changes[k] = { from: a, to: b };
  }
  return changes;
}

/* ------------------------------ Notifications ---------------------------- */
export async function notify(
  userIds: (string | Types.ObjectId | null | undefined)[],
  n: { title: string; message?: string; link?: string; type?: string },
  exclude?: string
) {
  const ids = [...new Set(userIds.filter(Boolean).map(String))].filter((id) => id !== exclude);
  if (!ids.length) return;
  try {
    await Notification.insertMany(ids.map((user) => ({ user, ...n })));
  } catch (e) {
    console.error("[notify] failed", e);
  }
}

/* ------------------------------ Data scoping ----------------------------- */
/** Mongo filter of projects the user can see (empty = all). */
export function projectFilter(user: AuthUser): Record<string, unknown> {
  if (can(user.permissions, "projects:all")) return {};
  const uid = new Types.ObjectId(user.id);
  return { $or: [{ manager: uid }, { designer: uid }, { supervisor: uid }, { members: uid }, { createdBy: uid }] };
}

/** null ⇒ all projects; otherwise list of accessible project ids. */
export async function accessibleProjectIds(user: AuthUser): Promise<Types.ObjectId[] | null> {
  if (can(user.permissions, "projects:all")) return null;
  const rows = await Project.find(projectFilter(user)).select("_id").lean<{ _id: Types.ObjectId }[]>();
  return rows.map((r) => r._id);
}

export async function assertProjectAccess(user: AuthUser, projectId: unknown) {
  if (!projectId) return;
  const exists = await Project.exists({ _id: projectId, ...projectFilter(user) });
  if (!exists) {
    const any = await Project.exists({ _id: projectId });
    throw any ? forbidden("You are not assigned to this site") : notFound("Site not found");
  }
}

/** Filter for a collection with a `project` field, restricted to accessible projects. */
export async function projectScopedFilter(user: AuthUser, opts: { allowNoProject?: boolean } = {}) {
  const ids = await accessibleProjectIds(user);
  if (ids === null) return {};
  if (opts.allowNoProject) return { $or: [{ project: { $in: ids } }, { project: null }] };
  return { project: { $in: ids } };
}

/* -------------------------------- Money ---------------------------------- */
export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

type Item = { qty?: number; rate?: number; gstRate?: number; amount?: number };
export function computeItems<T extends Item>(items: T[]) {
  return items.map((it) => ({ ...it, amount: round2((Number(it.qty) || 0) * (Number(it.rate) || 0)) }));
}
