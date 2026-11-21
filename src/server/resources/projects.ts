/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from "mongoose";
import { z } from "zod";
import {
  DEFAULT_PAYMENT_SCHEDULE,
  MILESTONE_STATUS,
  PROJECT_STAGES,
  PROJECT_STATUS,
  PROPERTY_CONFIGS,
  PROPERTY_TYPES,
  labelOf,
  values,
} from "@/lib/constants";
import { crud } from "../crud";
import { api, assertId, badRequest, notFound, parseBody } from "../http";
import {
  AuditLog,
  Checklist,
  DailyReport,
  Design,
  Expense,
  GRN,
  Invoice,
  MaterialRequest,
  Payment,
  Project,
  PurchaseOrder,
  Quotation,
  SiteVisit,
  Task,
  WorkOrder,
  serialize,
} from "../models";
import { assertProjectAccess, audit, notify, projectFilter, round2 } from "../services/core";
import { materialFromStockByProject, syncMilestones } from "../services/money";
import { getSetting } from "../services/settings";
import { aliasId, zDate, zId, zLocation, zMoney, zNum, zOptEnum, zPercent, zRef, zRefs, zStr, zTags, zText } from "../validators";

const milestone = z.preprocess(aliasId, z.object({
  _id: zId.optional(),
  name: zStr(150),
  percent: zPercent,
  amount: zMoney,
  dueDate: zDate,
  status: zOptEnum(values(MILESTONE_STATUS)),
  notes: zText(500),
}));

const base = {
  name: zStr(150),
  client: zId,
  lead: zRef,
  siteAddress: zText(500),
  city: zText(100),
  location: zLocation,
  propertyType: zOptEnum(values(PROPERTY_TYPES)),
  propertyConfig: zOptEnum(values(PROPERTY_CONFIGS)),
  areaSqft: zNum,
  scope: z.array(z.string().max(50)).max(20).optional(),
  description: zText(5000),
  status: zOptEnum(values(PROJECT_STATUS)),
  startDate: zDate,
  expectedEndDate: zDate,
  actualEndDate: zDate,
  contractValue: zMoney,
  budget: zMoney,
  progress: zPercent,
  manager: zRef,
  designer: zRef,
  supervisor: zRef,
  members: zRefs,
  paymentSchedule: z.array(milestone).max(30).optional(),
  coverImage: zRef,
  tags: zTags,
};

const people = [
  { path: "client", select: "name phone email clientNo address city gstin" },
  { path: "manager", select: "name role phone" },
  { path: "designer", select: "name role phone" },
  { path: "supervisor", select: "name role phone" },
  { path: "members", select: "name role" },
];

function applySchedule(schedule: any[], value: number) {
  return schedule.map((m) => ({
    ...m,
    amount: m.percent ? Math.round((value * m.percent) / 100) : m.amount ?? 0,
  }));
}

export const projects = crud({
  model: Project,
  resource: "projects",
  entity: "Site",
  createSchema: z.object({ ...base, stage: zOptEnum(values(PROJECT_STAGES)) }),
  updateSchema: z.object(base).partial(),
  search: ["name", "projectNo", "siteAddress", "city"],
  filters: { stage: "list", status: "list", client: "id", manager: "id", designer: "id", supervisor: "id" },
  sortable: ["createdAt", "name", "startDate", "expectedEndDate", "contractValue", "progress", "updatedAt"],
  populate: [...people, { path: "coverImage", select: "storageKey mimeType" }],
  listPopulate: people.slice(0, 4),
  numbering: { field: "projectNo", prefix: "PRJ" },
  ownerField: "createdBy",
  scope: ({ user }) => projectFilter(user),
  beforeCreate: async (data, ctx) => {
    data.stage ??= "site_visit";
    data.stageHistory = [{ stage: data.stage, by: ctx.user.id, note: "Site created" }];
    if (!data.paymentSchedule?.length) {
      const sched = (await getSetting<any[]>("paymentSchedule")) ?? DEFAULT_PAYMENT_SCHEDULE;
      data.paymentSchedule = applySchedule(sched, data.contractValue ?? 0);
    }
    data.manager ??= ctx.user.id;
    return data;
  },
  afterCreate: async (doc, ctx) => {
    await notify(
      [doc.manager, doc.designer, doc.supervisor, ...(doc.members ?? [])],
      { title: "You were added to a site", message: `${doc.projectNo} – ${doc.name}`, link: `/projects/${doc._id}`, type: "project" },
      ctx.user.id
    );
  },
  beforeUpdate: (data, existing) => {
    if (data.contractValue !== undefined && data.contractValue !== existing.contractValue && !data.paymentSchedule) {
      data.paymentSchedule = applySchedule(existing.paymentSchedule.map((m: any) => m.toObject()), data.contractValue);
    }
    return data;
  },
  afterUpdate: async (doc, before, ctx) => {
    if (doc.contractValue !== before.contractValue || JSON.stringify(doc.paymentSchedule) !== JSON.stringify(before.paymentSchedule)) {
      await syncMilestones(doc._id);
    }
    const was = new Set([before.manager, before.designer, before.supervisor, ...(before.members ?? [])].filter(Boolean).map(String));
    const added = [doc.manager, doc.designer, doc.supervisor, ...(doc.members ?? [])].filter((u) => u && !was.has(String(u)));
    await notify(added, { title: "You were added to a site", message: `${doc.projectNo} – ${doc.name}`, link: `/projects/${doc._id}`, type: "project" }, ctx.user.id);
  },
  beforeDelete: async (doc) => {
    const [pay, exp] = await Promise.all([Payment.exists({ project: doc._id }), Expense.exists({ project: doc._id })]);
    if (pay || exp) throw badRequest("Site has payments/expenses. Mark it Cancelled instead of deleting.");
    await Promise.all([
      Design.deleteMany({ project: doc._id }),
      Task.deleteMany({ project: doc._id }),
      DailyReport.deleteMany({ project: doc._id }),
      Checklist.deleteMany({ project: doc._id }),
      SiteVisit.deleteMany({ project: doc._id }),
    ]);
  },
});

/* -------------------------------- Stage move ----------------------------- */
const stageBody = z.object({ stage: z.enum(values(PROJECT_STAGES)), note: zText(500) });

export async function moveStage(projectId: unknown, stage: string, userId: string, note?: string) {
  const p = await Project.findById(projectId);
  if (!p || p.stage === stage) return p;
  p.stage = stage;
  p.stageHistory.push({ stage, by: userId, note, at: new Date() });
  if (stage === "closed") {
    p.status = "completed";
    p.closedAt = new Date();
    p.actualEndDate ??= new Date();
    p.progress = 100;
  } else if (p.status === "completed") p.status = "active";
  await p.save();
  return p;
}

/** Advance only if the site is currently at `from` (used by auto-transitions). */
export async function advanceStageIf(projectId: unknown, from: string[], to: string, userId: string, note: string) {
  const p = await Project.findById(projectId).select("stage");
  if (p && from.includes(p.stage)) await moveStage(projectId, to, userId, note);
}

export const changeStage = api({ perm: "projects:write" }, async ({ req, params, user, ip }) => {
  const id = assertId(params.id);
  await assertProjectAccess(user, id);
  const { stage, note } = await parseBody(req, stageBody);
  const p = await moveStage(id, stage, user.id, note);
  if (!p) throw notFound("Site not found");
  await audit(user, "stage", "Site", id, `Stage → ${labelOf(PROJECT_STAGES, stage)}${note ? ` (${note})` : ""}`, { project: id, ip });
  await notify([p.manager, p.designer, p.supervisor], { title: `${p.projectNo}: ${labelOf(PROJECT_STAGES, stage)}`, message: note, link: `/projects/${id}`, type: "project" }, user.id);
  return serialize(p.toJSON());
});

/* --------------------------------- Summary ------------------------------- */
const sumBy = async (model: any, match: any, field: string) => {
  const [r] = await model.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: `$${field}` } } }]);
  return round2(r?.total ?? 0);
};

export async function projectFinance(projectId: Types.ObjectId) {
  const match = { project: projectId };
  const [received, spent, invoiced, poValue, woValue, stock] = await Promise.all([
    sumBy(Payment, match, "amount"),
    sumBy(Expense, match, "amount"),
    sumBy(Invoice, { ...match, status: { $nin: ["cancelled", "draft"] } }, "total"),
    sumBy(PurchaseOrder, { ...match, status: { $nin: ["cancelled", "draft"] } }, "total"),
    sumBy(WorkOrder, { ...match, status: { $ne: "terminated" } }, "amount"),
    materialFromStockByProject([projectId]),
  ]);
  // B = cash spent on site + material issued from factory stock; C = A − B
  const materialFromStock = stock.get(String(projectId)) ?? 0;
  const cost = round2(spent + materialFromStock);
  return { received, spent, materialFromStock, siteMaterialValue: materialFromStock, cost, invoiced, poValue, woValue, balance: round2(received - cost) };
}

export const projectSummary = api({ perm: "projects:read" }, async ({ params, user }) => {
  const id = assertId(params.id);
  await assertProjectAccess(user, id);
  const pid = new Types.ObjectId(id);
  const p = await Project.findById(pid).select("contractValue budget").lean<any>();
  if (!p) throw notFound();
  const [finance, tasks, designs, quotes, mrs, pos, grns, reports, checklists, workorders] = await Promise.all([
    projectFinance(pid),
    Task.aggregate([{ $match: { project: pid } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Design.aggregate([{ $match: { project: pid } }, { $group: { _id: "$type", n: { $sum: 1 }, final: { $sum: { $cond: ["$isFinal", 1, 0] } } } }]),
    Quotation.countDocuments({ project: pid }),
    MaterialRequest.countDocuments({ project: pid, status: "pending" }),
    PurchaseOrder.countDocuments({ project: pid }),
    GRN.countDocuments({ project: pid }),
    DailyReport.countDocuments({ project: pid }),
    Checklist.aggregate([
      { $match: { project: pid } },
      { $project: { total: { $size: "$items" }, done: { $size: { $filter: { input: "$items", cond: "$$this.checked" } } } } },
      { $group: { _id: null, total: { $sum: "$total" }, done: { $sum: "$done" } } },
    ]),
    WorkOrder.countDocuments({ project: pid }),
  ]);
  const overdue = await Task.countDocuments({ project: pid, status: { $nin: ["done", "cancelled"] }, dueDate: { $lt: new Date() } });
  return {
    contractValue: p.contractValue ?? 0,
    budget: p.budget ?? 0,
    outstanding: round2((p.contractValue ?? 0) - finance.received),
    finance,
    tasks: Object.fromEntries(tasks.map((t: any) => [t._id, t.n])),
    overdueTasks: overdue,
    designs: designs.map((d: any) => ({ type: d._id, count: d.n, final: d.final })),
    counts: { quotations: quotes, pendingMaterialRequests: mrs, purchaseOrders: pos, grns, dailyReports: reports, workOrders: workorders },
    checklist: { total: checklists[0]?.total ?? 0, done: checklists[0]?.done ?? 0 },
  };
});

/* ------------------------------ Activity feed ---------------------------- */
export const activity = api({}, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const filter: any = {};
  const project = sp.get("project");
  if (project) {
    await assertProjectAccess(user, assertId(project, "project"));
    filter.project = project;
  } else if (!user.permissions.includes("*") && !user.permissions.includes("audit:read")) {
    filter.user = user.id; // non-admins only see their own trail
  }
  const entityId = sp.get("entityId");
  if (entityId) filter.entityId = assertId(entityId, "entityId");
  const entityType = sp.get("entityType");
  if (entityType) filter.entityType = entityType.slice(0, 50);
  const limit = Math.min(200, Number(sp.get("limit")) || 50);
  const rows = await AuditLog.find(filter).sort("-createdAt").limit(limit).lean();
  return serialize(rows);
});
