/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";
import { CHECKLIST_STATUS, RATE_TYPES, TRADES, WORK_ORDER_STATUS, values } from "@/lib/constants";
import { crud } from "../crud";
import { api, assertId, badRequest, notFound, parseBody } from "../http";
import { Checklist, Contractor, DailyReport, Expense, Project, WorkOrder, serialize } from "../models";
import { assertProjectAccess, computeItems, notify, round2 } from "../services/core";
import { aliasId, zBool, zDate, zId, zLineItem, zMoney, zNum, zOptEnum, zOptPhone, zPercent, zRef, zRefs, zStr, zText } from "../validators";
import { advanceStageIf } from "./projects";

/* -------------------------------- Checklists ----------------------------- */
const item = z.preprocess(aliasId, z.object({
  _id: zId.optional(),
  text: zStr(500),
  checked: zBool,
  remark: zText(1000),
  photo: zRef,
}));

const checklistBase = {
  name: zStr(200),
  isTemplate: zBool,
  trade: zText(50),
  stage: zText(50),
  project: zRef,
  items: z.array(item).max(300).optional(),
  status: zOptEnum(values(CHECKLIST_STATUS)),
  assignedTo: zRef,
};

export const checklists = crud({
  model: Checklist,
  resource: "checklists",
  entity: "Checklist",
  createSchema: z
    .object(checklistBase)
    .refine((d) => d.isTemplate || d.project, "Select a site (or mark as template)"),
  updateSchema: z.object(checklistBase).partial(),
  search: ["name", "trade"],
  filters: { project: "id", isTemplate: "bool", trade: "string", status: "list", assignedTo: "id" },
  sortable: ["createdAt", "name"],
  populate: [
    { path: "project", select: "name projectNo" },
    { path: "assignedTo", select: "name" },
    { path: "items.checkedBy", select: "name" },
  ],
  ownerField: "createdBy",
  projectScoped: "optional",
  beforeCreate: (data) => {
    if (data.isTemplate) data.project = null;
    return data;
  },
});

/** Create a site checklist from a template. */
export const applyChecklist = api({ perm: "checklists:write" }, async ({ req, params, user }) => {
  const id = assertId(params.id);
  const body = await parseBody(req, z.object({ project: zId, assignedTo: zRef, name: zText(200) }));
  await assertProjectAccess(user, body.project);
  const t = await Checklist.findOne({ _id: id, isTemplate: true }).lean<any>();
  if (!t) throw notFound("Template not found");
  const doc = await Checklist.create({
    name: body.name || t.name,
    trade: t.trade,
    stage: t.stage,
    project: body.project,
    template: t._id,
    assignedTo: body.assignedTo,
    items: t.items.map((i: any) => ({ text: i.text })),
    createdBy: user.id,
  });
  await notify([body.assignedTo], { title: "Checklist assigned", message: doc.name, link: `/projects/${body.project}?tab=checklists`, type: "checklist" }, user.id);
  return serialize(doc.toJSON());
});

/** Tick / untick a checklist item (records who and when). */
export const toggleChecklistItem = api({ perm: "checklists:write" }, async ({ req, params, user }) => {
  const id = assertId(params.id);
  const itemId = assertId(params.itemId, "item");
  const body = await parseBody(req, z.object({ checked: z.boolean(), remark: zText(1000), photo: zRef }));
  const c = await Checklist.findById(id);
  if (!c) throw notFound("Checklist not found");
  if (c.project) await assertProjectAccess(user, c.project);
  const it = c.items.id(itemId);
  if (!it) throw notFound("Item not found");
  it.checked = body.checked;
  it.checkedBy = body.checked ? user.id : undefined;
  it.checkedAt = body.checked ? new Date() : undefined;
  if (body.remark !== undefined) it.remark = body.remark;
  if (body.photo !== undefined) it.photo = body.photo ?? undefined;
  await saveChecklist(c);
  return serialize(c.toJSON());
});

async function saveChecklist(c: any) {
  const allDone = !c.isTemplate && c.items.length > 0 && c.items.every((i: any) => i.checked);
  c.status = allDone ? "completed" : "open";
  c.completedAt = allDone ? new Date() : undefined;
  await c.save();
}

async function loadChecklist(user: any, id: string) {
  const c = await Checklist.findById(id);
  if (!c) throw notFound("Checklist not found");
  if (c.project) await assertProjectAccess(user, c.project);
  return c;
}

/** Add a site-specific check to an existing checklist (keeps who/when on the other items). */
export const addChecklistItem = api({ perm: "checklists:write" }, async ({ req, params, user }) => {
  const c = await loadChecklist(user, assertId(params.id));
  const { text } = await parseBody(req, z.object({ text: zStr(500) }));
  c.items.push({ text });
  await saveChecklist(c);
  return serialize(c.toJSON());
});

export const removeChecklistItem = api({ perm: "checklists:write" }, async ({ params, user }) => {
  const c = await loadChecklist(user, assertId(params.id));
  const it = c.items.id(assertId(params.itemId, "item"));
  if (!it) throw notFound("Item not found");
  it.deleteOne();
  await saveChecklist(c);
  return serialize(c.toJSON());
});

/* ------------------------------ Daily reports ---------------------------- */
const drBase = {
  project: zId,
  date: z.coerce.date(),
  workDone: zStr(10000),
  manpower: z
    .array(z.object({ trade: zText(50), contractor: zRef, count: z.coerce.number().min(0).max(1000) }))
    .max(50)
    .optional(),
  materialsUsed: zText(5000),
  issues: zText(5000),
  nextDayPlan: zText(5000),
  progress: zPercent,
  photos: zRefs,
};

export const dailyReports = crud({
  model: DailyReport,
  resource: "daily_reports",
  entity: "Daily report",
  createSchema: z.object(drBase),
  updateSchema: z.object(drBase).partial().omit({ project: true }),
  search: ["workDone", "issues"],
  filters: { project: "id", reportedBy: "id" },
  dateField: "date",
  sortable: ["date", "createdAt"],
  defaultSort: "-date",
  populate: [
    { path: "project", select: "name projectNo" },
    { path: "reportedBy", select: "name" },
    { path: "photos", select: "originalName mimeType size storageKey" },
    { path: "manpower.contractor", select: "name trade" },
  ],
  ownerField: "reportedBy",
  projectScoped: true,
  label: (d) => new Date(d.date).toDateString(),
  afterCreate: async (doc, ctx) => {
    const p = await Project.findById(doc.project).select("manager projectNo progress stage");
    if (p && doc.progress != null) {
      p.progress = doc.progress;
      await p.save();
    }
    await advanceStageIf(doc.project, ["contractor_selection", "procurement"], "execution", ctx.user.id, "First daily site report");
    await notify([p?.manager], { title: `${p?.projectNo}: daily report`, message: String(doc.workDone).slice(0, 120), link: `/projects/${doc.project}?tab=reports`, type: "report" }, ctx.user.id);
    if (doc.issues) {
      await notify([p?.manager], { title: `${p?.projectNo}: site issue reported`, message: String(doc.issues).slice(0, 160), link: `/projects/${doc.project}?tab=reports`, type: "alert" }, ctx.user.id);
    }
  },
  afterUpdate: async (doc) => {
    if (doc.progress != null) await Project.updateOne({ _id: doc.project }, { $set: { progress: doc.progress } });
  },
});

/* ------------------------------- Contractors ----------------------------- */
const bank = z
  .object({ accountName: zText(100), accountNo: zText(30), ifsc: zText(15), bankName: zText(100), upi: zText(100) })
  .partial()
  .optional();

const contractorBase = {
  name: zStr(150),
  trade: z.enum(values(TRADES)),
  phone: zOptPhone,
  alternatePhone: zOptPhone,
  address: zText(500),
  teamSize: zNum,
  rateType: zOptEnum(values(RATE_TYPES)),
  rate: zMoney,
  idProof: zText(100),
  bank,
  rating: z.coerce.number().min(0).max(5).optional(),
  isActive: zBool,
  notes: zText(5000),
};

export const contractors = crud({
  model: Contractor,
  resource: "contractors",
  entity: "Contractor",
  createSchema: z.object(contractorBase),
  updateSchema: z.object(contractorBase).partial(),
  search: ["name", "phone", "contractorNo"],
  filters: { trade: "list", isActive: "bool" },
  sortable: ["name", "createdAt", "rating"],
  defaultSort: "name",
  numbering: { field: "contractorNo", prefix: "CON" },
  ownerField: "createdBy",
  beforeDelete: async (doc) => {
    if (await WorkOrder.exists({ contractor: doc._id })) throw badRequest("Contractor has work orders – deactivate instead");
  },
});

/* ------------------------------- Work orders ----------------------------- */
const woBase = {
  project: zId,
  contractor: zId,
  trade: zOptEnum(values(TRADES)),
  scope: zText(10000),
  items: z.array(zLineItem).max(500).optional(),
  amount: zMoney,
  startDate: zDate,
  endDate: zDate,
  status: zOptEnum(values(WORK_ORDER_STATUS)),
  terms: zText(5000),
  notes: zText(5000),
};

function woTotals(data: any) {
  if (data.items?.length) {
    data.items = computeItems(data.items);
    data.amount = round2(data.items.reduce((s: number, i: any) => s + i.amount, 0));
  }
  return data;
}

export const workOrders = crud({
  model: WorkOrder,
  resource: "workorders",
  entity: "Work order",
  createSchema: z.object(woBase),
  updateSchema: z.object(woBase).partial().omit({ project: true }),
  search: ["woNo", "scope"],
  filters: { project: "id", contractor: "id", status: "list", trade: "list" },
  sortable: ["createdAt", "amount", "startDate"],
  populate: [
    { path: "project", select: "name projectNo" },
    { path: "contractor", select: "name trade phone" },
    { path: "createdBy", select: "name" },
  ],
  numbering: { field: "woNo", prefix: "WO" },
  ownerField: "createdBy",
  projectScoped: true,
  label: (d) => d.woNo,
  beforeCreate: async (data) => {
    if (!data.trade) {
      const c = await Contractor.findById(data.contractor).select("trade").lean<any>();
      data.trade = c?.trade;
    }
    return woTotals(data);
  },
  afterCreate: async (doc, ctx) => {
    await advanceStageIf(doc.project, ["quotation", "contractor_selection"], "procurement", ctx.user.id, "Contractors selected");
  },
  beforeUpdate: (data) => woTotals(data),
  beforeDelete: async (doc) => {
    if (await Expense.exists({ workOrder: doc._id })) throw badRequest("Work order has payments – mark it Terminated instead");
  },
});

export async function syncWorkOrderPaid(woId: unknown) {
  if (!woId) return;
  const [r] = await Expense.aggregate([{ $match: { workOrder: woId } }, { $group: { _id: null, t: { $sum: "$amount" } } }]);
  await WorkOrder.updateOne({ _id: woId }, { $set: { paidAmount: round2(r?.t ?? 0) } });
}
