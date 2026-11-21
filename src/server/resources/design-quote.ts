/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from "mongoose";
import { z } from "zod";
import { DESIGN_STATUS, DESIGN_TOOLS, DESIGN_TYPES, QUOTE_STATUS, QUOTE_TYPES, labelOf, values } from "@/lib/constants";
import { crud } from "../crud";
import { api, assertId, badRequest, notFound, parseBody } from "../http";
import { Client, Design, Lead, Project, Quotation, serialize } from "../models";
import { assertProjectAccess, audit, computeItems, nextNumber, notify, projectScopedFilter, round2 } from "../services/core";
import { syncMilestones } from "../services/money";
import { getSetting } from "../services/settings";
import { zDate, zLineItem, zNum, zOptEnum, zRef, zRefs, zStr, zText } from "../validators";
import { advanceStageIf } from "./projects";

/* --------------------------------- Designs ------------------------------- */
const designBase = {
  project: z.string().regex(/^[a-f0-9]{24}$/i),
  type: z.enum(values(DESIGN_TYPES)),
  room: z.string().trim().max(50).optional(),
  title: zStr(200),
  tool: zOptEnum(values(DESIGN_TOOLS)),
  status: zOptEnum(values(DESIGN_STATUS)),
  files: zRefs,
  externalLink: z.preprocess((v) => (v === "" ? undefined : v), z.url().max(1000).optional()),
  description: zText(5000),
  clientFeedback: zText(5000),
  internalNotes: zText(5000),
};

export const designs = crud({
  model: Design,
  resource: "designs",
  entity: "Design",
  createSchema: z.object(designBase),
  updateSchema: z.object(designBase).partial().omit({ project: true }),
  search: ["title", "description", "clientFeedback"],
  filters: { project: "id", type: "list", room: "string", status: "list", isFinal: "bool" },
  sortable: ["createdAt", "version", "type"],
  populate: [
    { path: "files", select: "originalName mimeType size storageKey" },
    { path: "createdBy", select: "name" },
    { path: "approvedBy", select: "name" },
    { path: "project", select: "name projectNo" },
  ],
  ownerField: "createdBy",
  projectScoped: true,
  label: (d) => `${d.title} v${d.version}`,
  beforeCreate: async (data) => {
    data.room ||= "full_home";
    const last = await Design.findOne({ project: data.project, type: data.type, room: data.room }).sort("-version").select("version").lean<any>();
    data.version = (last?.version ?? 0) + 1;
    if (data.status === "shared") data.sharedAt = new Date();
    return data;
  },
  beforeUpdate: (data, existing) => {
    if (data.status === "shared" && existing.status !== "shared") data.sharedAt = new Date();
    if (data.status === "approved") throw badRequest("Use the Approve action to finalise a design");
    return data;
  },
});

const STAGE_AFTER_FINAL: Record<string, { from: string[]; to: string; note: string }> = {
  layout_2d: { from: ["site_visit", "design_2d"], to: "design_3d", note: "2D layout finalised" },
  model_3d: { from: ["design_3d"], to: "elevation", note: "3D design finalised" },
  render: { from: ["design_3d"], to: "elevation", note: "Renders finalised" },
  elevation: { from: ["elevation"], to: "quotation", note: "Elevations finalised" },
};

/** Mark a design version as the client-approved final; other versions of the same room/type are superseded. */
export const approveDesign = api({ perm: "designs:approve" }, async ({ req, params, user, ip }) => {
  const id = assertId(params.id);
  const { clientFeedback } = await parseBody(req, z.object({ clientFeedback: zText(5000) }));
  const d = await Design.findById(id);
  if (!d) throw notFound("Design not found");
  await assertProjectAccess(user, d.project);
  await Design.updateMany(
    { project: d.project, type: d.type, room: d.room, _id: { $ne: d._id }, status: { $nin: ["draft"] } },
    { $set: { isFinal: false, status: "superseded" } }
  );
  await Design.updateMany({ project: d.project, type: d.type, room: d.room, _id: { $ne: d._id } }, { $set: { isFinal: false } });
  d.isFinal = true;
  d.status = "approved";
  d.approvedAt = new Date();
  d.approvedBy = user.id;
  if (clientFeedback) d.clientFeedback = clientFeedback;
  await d.save();
  const rule = STAGE_AFTER_FINAL[d.type];
  if (rule) await advanceStageIf(d.project, rule.from, rule.to, user.id, rule.note);
  await audit(user, "approve", "Design", d._id, `Finalised ${labelOf(DESIGN_TYPES, d.type)} "${d.title}" v${d.version}`, { project: d.project, ip });
  const p = await Project.findById(d.project).select("manager supervisor projectNo");
  await notify([p?.manager, p?.supervisor], { title: `${p?.projectNo}: design finalised`, message: `${d.title} v${d.version}`, link: `/projects/${d.project}?tab=designs`, type: "design" }, user.id);
  return serialize(d.toJSON());
});

/* ------------------------------- Quotations ------------------------------ */
const quoteBase = {
  type: zOptEnum(values(QUOTE_TYPES)),
  title: zStr(200),
  project: zRef,
  lead: zRef,
  customerName: zText(150),
  customerPhone: zText(20),
  customerAddress: zText(500),
  date: zDate,
  validUntil: zDate,
  items: z.array(zLineItem).max(1000).default([]),
  discountType: z.enum(["percent", "amount"]).optional(),
  discountValue: zNum,
  taxRate: z.coerce.number().min(0).max(28).optional(),
  terms: zText(10000),
  notes: zText(5000),
  clientFeedback: zText(5000),
  changeSummary: zText(2000),
};

export function quoteTotals(q: any) {
  const items = computeItems(q.items ?? []);
  const subtotal = round2(items.reduce((s, i) => s + i.amount, 0));
  const dv = Number(q.discountValue) || 0;
  const discountAmount = round2(q.discountType === "percent" ? (subtotal * Math.min(dv, 100)) / 100 : Math.min(dv, subtotal));
  const taxableAmount = round2(subtotal - discountAmount);
  const taxRate = q.taxRate ?? 18;
  const taxAmount = round2((taxableAmount * taxRate) / 100);
  return { items, subtotal, discountAmount, taxableAmount, taxRate, taxAmount, total: round2(taxableAmount + taxAmount) };
}

async function quoteScope(ctx: any) {
  // Lead quotations (no project) are visible to anyone with quotations:read; site quotations are site-scoped.
  return projectScopedFilter(ctx.user, { allowNoProject: true });
}

export const quotations = crud({
  model: Quotation,
  resource: "quotations",
  entity: "Quotation",
  createSchema: z.object(quoteBase).refine((d) => d.project || d.lead || d.customerName, "Select a site, a lead or enter a customer name"),
  updateSchema: z.object(quoteBase).partial(),
  search: ["quoteNo", "title", "customerName"],
  filters: { project: "id", lead: "id", client: "id", status: "list", type: "list", isFinal: "bool", root: "id" },
  dateField: "date",
  sortable: ["createdAt", "date", "total", "version"],
  populate: [
    { path: "project", select: "name projectNo siteAddress city" },
    { path: "client", select: "name phone email address city gstin" },
    { path: "lead", select: "name phone address leadNo" },
    { path: "createdBy", select: "name" },
    { path: "approvedBy", select: "name" },
  ],
  listSelect: "-items",
  ownerField: "createdBy",
  scope: quoteScope,
  label: (d) => `${d.quoteNo} v${d.version}`,
  beforeCreate: async (data, ctx) => {
    if (data.project) {
      await assertProjectAccess(ctx.user, data.project);
      const p = await Project.findById(data.project).select("client lead").lean<any>();
      data.client = p?.client;
      data.lead ??= p?.lead;
    }
    if (data.lead && !data.customerName) {
      const l = await Lead.findById(data.lead).select("name phone address").lean<any>();
      Object.assign(data, { customerName: l?.name, customerPhone: l?.phone, customerAddress: l?.address });
    }
    if (data.client && !data.customerName) {
      const c = await Client.findById(data.client).select("name phone address").lean<any>();
      Object.assign(data, { customerName: c?.name, customerPhone: c?.phone, customerAddress: c?.address });
    }
    data.terms ??= await getSetting<string>("quotationTerms");
    data.taxRate ??= (await getSetting<number>("defaultGstRate")) ?? 18;
    data.quoteNo = await nextNumber("QT");
    data.version = 1;
    data._id = new Types.ObjectId();
    data.root = data._id;
    return { ...data, ...quoteTotals(data) };
  },
  beforeUpdate: (data, existing) => {
    if (["approved", "superseded"].includes(existing.status)) {
      throw badRequest("Approved/superseded quotations are locked. Create a revision instead.");
    }
    delete data.status;
    const merged = { ...existing.toObject(), ...data };
    return { ...data, ...quoteTotals(merged) };
  },
  beforeDelete: (doc) => {
    if (doc.status === "approved") throw badRequest("Approved quotations cannot be deleted");
  },
});

/** Create the next version (v2, v3 …) from any version. */
export const reviseQuotation = api({ perm: "quotations:write" }, async ({ req, params, user, ip }) => {
  const id = assertId(params.id);
  const { changeSummary } = await parseBody(req, z.object({ changeSummary: zText(2000) }));
  const q = await Quotation.findById(id).lean<any>();
  if (!q) throw notFound("Quotation not found");
  if (q.project) await assertProjectAccess(user, q.project);
  const last = await Quotation.findOne({ root: q.root }).sort("-version").select("version").lean<any>();
  const { _id, createdAt, updatedAt, sentAt, approvedAt, approvedBy, ...rest } = q;
  void _id; void createdAt; void updatedAt; void sentAt; void approvedAt; void approvedBy;
  const next = await Quotation.create({
    ...rest,
    items: rest.items.map(({ _id: _i, ...it }: any) => (void _i, it)),
    version: (last?.version ?? q.version) + 1,
    status: "draft",
    isFinal: false,
    clientFeedback: undefined,
    changeSummary,
    date: new Date(),
    createdBy: user.id,
  });
  await Quotation.updateMany({ root: q.root, _id: { $ne: next._id }, status: { $in: ["draft", "sent", "changes_requested"] } }, { $set: { status: "superseded" } });
  await audit(user, "revise", "Quotation", next._id, `${q.quoteNo} revised to v${next.version}`, { project: q.project, ip });
  return serialize(next.toJSON());
});

/** Sum of final approved quotations → site contract value (working + additional; else preliminary). */
export async function recomputeContractValue(projectId: unknown) {
  const finals = await Quotation.find({ project: projectId, isFinal: true }).select("type total").lean<any[]>();
  const main = finals.filter((f) => f.type !== "preliminary");
  const list = main.length ? main : finals;
  const value = round2(list.reduce((s, f) => s + (f.total ?? 0), 0));
  const p = await Project.findById(projectId);
  if (!p) return;
  p.contractValue = value;
  p.paymentSchedule = p.paymentSchedule.map((m: any) => {
    const o = m.toObject();
    return { ...o, amount: o.percent ? Math.round((value * o.percent) / 100) : o.amount };
  });
  await p.save();
  await syncMilestones(projectId);
}

const statusBody = z.object({
  status: z.enum(values(QUOTE_STATUS)).refine((s) => s !== "superseded", "Invalid status"),
  clientFeedback: zText(5000),
});

export const quotationStatus = api({ perm: "quotations:write" }, async ({ req, params, user, ip }) => {
  const id = assertId(params.id);
  const { status, clientFeedback } = await parseBody(req, statusBody);
  const q = await Quotation.findById(id);
  if (!q) throw notFound("Quotation not found");
  if (q.project) await assertProjectAccess(user, q.project);
  if (q.status === "superseded") throw badRequest("This version is superseded – work on the latest version");
  if (status === "approved" && !user.permissions.includes("*") && !user.permissions.includes("quotations:approve")) {
    throw badRequest("Only managers/admin can approve quotations");
  }
  q.status = status;
  if (clientFeedback) q.clientFeedback = clientFeedback;
  if (status === "sent") {
    q.sentAt = new Date();
    if (q.lead) await Lead.updateOne({ _id: q.lead, status: { $nin: ["won", "lost", "negotiation"] } }, { $set: { status: "design_quotation" } });
  }
  if (status === "changes_requested" && q.lead) {
    await Lead.updateOne({ _id: q.lead, status: { $nin: ["won", "lost"] } }, { $set: { status: "negotiation" } });
  }
  if (status === "approved") {
    q.isFinal = true;
    q.approvedAt = new Date();
    q.approvedBy = user.id;
    await Quotation.updateMany({ root: q.root, _id: { $ne: q._id } }, { $set: { isFinal: false, status: "superseded" } });
  } else q.isFinal = false;
  await q.save();
  if (q.project) {
    await recomputeContractValue(q.project);
    if (status === "approved" && q.type === "working") {
      await advanceStageIf(q.project, ["site_visit", "design_2d", "design_3d", "elevation", "quotation"], "contractor_selection", user.id, `Quotation ${q.quoteNo} v${q.version} approved`);
    }
  }
  await audit(user, "status", "Quotation", q._id, `${q.quoteNo} v${q.version} → ${labelOf(QUOTE_STATUS, status)}`, { project: q.project, ip });
  return serialize(q.toJSON());
});
