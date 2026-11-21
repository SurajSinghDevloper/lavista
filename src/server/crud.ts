/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { Types } from "mongoose";
import type { ZodType } from "zod";
import type { Resource } from "@/lib/permissions";
import { api, assertId, created, escapeRegex, isObjectId, listParams, notFound, ok, parseBody, type Ctx } from "./http";
import type { AnyModel } from "./models/_base";
import { serialize } from "./models/_base";
import { assertProjectAccess, audit, diff, nextNumber, projectScopedFilter } from "./services/core";

export type FilterKind = "string" | "id" | "bool" | "list" | "number";

export type CrudConfig = {
  model: AnyModel;
  resource: Resource;
  entity: string; // name used in audit log
  createSchema?: ZodType<any>;
  updateSchema?: ZodType<any>;
  search?: string[];
  filters?: Record<string, FilterKind>;
  /** Field used for ?from=&to= date range filtering. */
  dateField?: string;
  sortable?: string[];
  defaultSort?: string;
  populate?: any;
  listPopulate?: any;
  listSelect?: string;
  numbering?: { field: string; prefix: string; fy?: boolean };
  /** Set to the current user on create (e.g. "createdBy"). */
  ownerField?: string;
  /** Extra restriction for list/get/update/delete. */
  scope?: (ctx: Ctx) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** Restrict by accessible sites through the `project` field. "optional" allows records without project. */
  projectScoped?: boolean | "optional";
  label?: (doc: any) => string;
  auditFields?: string[];
  beforeCreate?: (data: any, ctx: Ctx) => Promise<any> | any;
  afterCreate?: (doc: any, ctx: Ctx) => Promise<void> | void;
  beforeUpdate?: (data: any, existing: any, ctx: Ctx) => Promise<any> | any;
  afterUpdate?: (doc: any, before: any, ctx: Ctx) => Promise<void> | void;
  beforeDelete?: (doc: any, ctx: Ctx) => Promise<void> | void;
  afterDelete?: (doc: any, ctx: Ctx) => Promise<void> | void;
};

export async function scopeFor(cfg: CrudConfig, ctx: Ctx) {
  const parts: Record<string, unknown>[] = [];
  if (cfg.projectScoped) {
    const f = await projectScopedFilter(ctx.user, { allowNoProject: cfg.projectScoped === "optional" });
    if (Object.keys(f).length) parts.push(f);
  }
  if (cfg.scope) {
    const f = await cfg.scope(ctx);
    if (f && Object.keys(f).length) parts.push(f);
  }
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

export function buildListFilter(cfg: CrudConfig, ctx: Ctx) {
  const { q, sp } = listParams(ctx.req);
  const and: Record<string, unknown>[] = [];
  if (q && cfg.search?.length) {
    const rx = new RegExp(escapeRegex(q), "i");
    and.push({ $or: cfg.search.map((f) => ({ [f]: rx })) });
  }
  for (const [key, kind] of Object.entries(cfg.filters ?? {})) {
    const raw = sp.get(key);
    if (raw === null || raw === "") continue;
    if (kind === "id") {
      if (raw === "none") and.push({ [key]: null });
      else if (isObjectId(raw)) and.push({ [key]: new Types.ObjectId(raw) });
    } else if (kind === "bool") and.push({ [key]: raw === "true" });
    else if (kind === "number") {
      const n = Number(raw);
      if (Number.isFinite(n)) and.push({ [key]: n });
    } else if (kind === "list") {
      const vals = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30);
      and.push({ [key]: vals.length === 1 ? vals[0] : { $in: vals } });
    } else and.push({ [key]: String(raw).slice(0, 100) });
  }
  if (cfg.dateField) {
    const from = sp.get("from");
    const to = sp.get("to");
    const range: Record<string, Date> = {};
    if (from && !isNaN(Date.parse(from))) range.$gte = new Date(from);
    if (to && !isNaN(Date.parse(to))) {
      const d = new Date(to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) d.setHours(23, 59, 59, 999);
      range.$lte = d;
    }
    if (Object.keys(range).length) and.push({ [cfg.dateField]: range });
  }
  return and;
}

async function populated(cfg: CrudConfig, id: unknown) {
  let query = cfg.model.findById(id);
  if (cfg.populate) query = query.populate(cfg.populate);
  return serialize(await query.lean());
}

export function crud(cfg: CrudConfig) {
  const label = (d: any) => cfg.label?.(d) ?? d?.name ?? d?.title ?? d?.[cfg.numbering?.field ?? "_id"] ?? "";

  const list = api({ perm: `${cfg.resource}:read` }, async (ctx) => {
    const { page, limit, skip } = listParams(ctx.req);
    const { sort } = listParams(ctx.req, { sortable: cfg.sortable, defaultSort: cfg.defaultSort });
    const scope = await scopeFor(cfg, ctx);
    const and = [...buildListFilter(cfg, ctx), ...(Object.keys(scope).length ? [scope] : [])];
    const filter = and.length ? { $and: and } : {};
    let query = cfg.model.find(filter).sort(sort).skip(skip).limit(limit);
    if (cfg.listSelect) query = query.select(cfg.listSelect);
    const pop = cfg.listPopulate ?? cfg.populate;
    if (pop) query = query.populate(pop);
    const [rows, total] = await Promise.all([query.lean(), cfg.model.countDocuments(filter)]);
    return ok(serialize(rows), { meta: { page, limit, total, pages: Math.ceil(total / limit) } });
  });

  const get = api({ perm: `${cfg.resource}:read` }, async (ctx) => {
    const id = assertId(ctx.params.id);
    const scope = await scopeFor(cfg, ctx);
    let query = cfg.model.findOne({ _id: id, ...scope });
    if (cfg.populate) query = query.populate(cfg.populate);
    const doc = await query.lean();
    if (!doc) throw notFound(`This ${cfg.entity.toLowerCase()} could not be found. It may have been deleted, or you may not have access to it.`);
    return serialize(doc);
  });

  const create = api({ perm: `${cfg.resource}:write` }, async (ctx) => {
    if (!cfg.createSchema) throw notFound();
    let data: any = await parseBody(ctx.req, cfg.createSchema);
    if (cfg.projectScoped && data.project) await assertProjectAccess(ctx.user, data.project);
    if (cfg.numbering && !data[cfg.numbering.field]) {
      data[cfg.numbering.field] = await nextNumber(cfg.numbering.prefix, { fy: cfg.numbering.fy });
    }
    if (cfg.ownerField) data[cfg.ownerField] = ctx.user.id;
    if (cfg.beforeCreate) data = await cfg.beforeCreate(data, ctx);
    const doc = await cfg.model.create(data);
    if (cfg.afterCreate) await cfg.afterCreate(doc, ctx);
    await audit(ctx.user, "create", cfg.entity, doc._id, `Created ${cfg.entity} ${label(doc)}`.trim(), {
      project: doc.project,
      ip: ctx.ip,
    });
    return created(await populated(cfg, doc._id));
  });

  const update = api({ perm: `${cfg.resource}:write` }, async (ctx) => {
    if (!cfg.updateSchema) throw notFound();
    const id = assertId(ctx.params.id);
    let data: any = await parseBody(ctx.req, cfg.updateSchema);
    const scope = await scopeFor(cfg, ctx);
    const doc = await cfg.model.findOne({ _id: id, ...scope });
    if (!doc) throw notFound(`This ${cfg.entity.toLowerCase()} could not be found. It may have been deleted, or you may not have access to it.`);
    if (cfg.projectScoped && data.project && String(data.project) !== String(doc.project)) {
      await assertProjectAccess(ctx.user, data.project);
    }
    const before = doc.toObject();
    if (cfg.beforeUpdate) data = await cfg.beforeUpdate(data, doc, ctx);
    if (cfg.numbering) delete data[cfg.numbering.field];
    if (cfg.ownerField) delete data[cfg.ownerField];
    doc.set(data);
    await doc.save();
    if (cfg.afterUpdate) await cfg.afterUpdate(doc, before, ctx);
    const keys = cfg.auditFields ?? Object.keys(data).filter((k) => !["items", "measurements"].includes(k));
    const changes = diff(before, doc.toObject(), keys);
    if (Object.keys(changes).length || data.items) {
      await audit(ctx.user, "update", cfg.entity, doc._id, `Updated ${cfg.entity} ${label(doc)}`.trim(), {
        project: doc.project,
        changes,
        ip: ctx.ip,
      });
    }
    return populated(cfg, doc._id);
  });

  const remove = api({ perm: `${cfg.resource}:delete` }, async (ctx) => {
    const id = assertId(ctx.params.id);
    const scope = await scopeFor(cfg, ctx);
    const doc = await cfg.model.findOne({ _id: id, ...scope });
    if (!doc) throw notFound(`This ${cfg.entity.toLowerCase()} could not be found. It may have been deleted, or you may not have access to it.`);
    if (cfg.beforeDelete) await cfg.beforeDelete(doc, ctx);
    await doc.deleteOne();
    if (cfg.afterDelete) await cfg.afterDelete(doc, ctx);
    await audit(ctx.user, "delete", cfg.entity, doc._id, `Deleted ${cfg.entity} ${label(doc)}`.trim(), {
      project: doc.project,
      ip: ctx.ip,
    });
    return { id };
  });

  return { list, get, create, update, remove };
}
