/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from "mongoose";
import { z } from "zod";
import { EXPENSE_CATEGORIES, INVOICE_STATUS, INVOICE_TYPES, PAYMENT_MODES, RECEIPT_TYPES, values } from "@/lib/constants";
import { crud } from "../crud";
import { api, assertId, badRequest, notFound, parseBody } from "../http";
import { Contractor, Expense, Invoice, Payment, Project, PurchaseOrder, Vendor, WorkOrder, serialize } from "../models";
import { accessibleProjectIds, assertProjectAccess, audit, computeItems, notify, round2 } from "../services/core";
import { MATERIAL_EXPENSE_CATEGORIES, materialFromStockByProject, syncMilestones } from "../services/money";
import { getSetting } from "../services/settings";
import { zDate, zId, zLineItem, zMoney, zOptEnum, zRef, zRefs, zText } from "../validators";
import { syncPoPayment } from "./procurement";
import { advanceStageIf } from "./projects";
import { syncWorkOrderPaid } from "./site";

/* -------------------------- Milestone / invoice sync --------------------- */
export { syncMilestones };

export async function syncInvoice(invoiceId: unknown) {
  if (!invoiceId) return;
  const inv = await Invoice.findById(invoiceId);
  if (!inv) return;
  const [r] = await Payment.aggregate([{ $match: { invoice: inv._id } }, { $group: { _id: null, t: { $sum: "$amount" } } }]);
  inv.amountPaid = round2(r?.t ?? 0);
  inv.balance = round2(inv.total - inv.amountPaid);
  if (inv.status !== "cancelled" && inv.status !== "draft") {
    inv.status = inv.amountPaid <= 0 ? "issued" : inv.balance <= 0.5 ? "paid" : "partially_paid";
  }
  await inv.save();
}

/* --------------------------------- Payments ------------------------------ */
const payBase = {
  project: zId,
  invoice: zRef,
  milestone: zRef,
  type: zOptEnum(values(RECEIPT_TYPES)),
  amount: z.coerce.number().positive().max(1e11),
  date: zDate,
  mode: zOptEnum(values(PAYMENT_MODES)),
  reference: zText(100),
  notes: zText(2000),
  files: zRefs,
};

export const payments = crud({
  model: Payment,
  resource: "payments",
  entity: "Payment",
  createSchema: z.object(payBase),
  updateSchema: z.object(payBase).partial().omit({ project: true }),
  search: ["receiptNo", "reference", "notes"],
  filters: { project: "id", client: "id", invoice: "id", type: "list", mode: "list" },
  dateField: "date",
  sortable: ["date", "amount", "createdAt"],
  defaultSort: "-date",
  populate: [
    { path: "project", select: "name projectNo siteAddress" },
    { path: "client", select: "name phone address gstin" },
    { path: "invoice", select: "invoiceNo" },
    { path: "receivedBy", select: "name" },
  ],
  numbering: { field: "receiptNo", prefix: "RCPT", fy: true },
  ownerField: "receivedBy",
  projectScoped: true,
  label: (d) => `${d.receiptNo} ₹${d.amount}`,
  beforeCreate: async (data) => {
    const p = await Project.findById(data.project).select("client").lean<any>();
    if (!p) throw notFound("Site not found");
    data.client = p.client;
    if (data.invoice) {
      const inv = await Invoice.findById(data.invoice).select("project status").lean<any>();
      if (!inv || String(inv.project) !== String(data.project)) throw badRequest("Invoice does not belong to this site");
      if (inv.status === "cancelled") throw badRequest("Invoice is cancelled");
    }
    return data;
  },
  afterCreate: async (doc, ctx) => {
    await Promise.all([syncInvoice(doc.invoice), syncMilestones(doc.project)]);
    const p = await Project.findById(doc.project).select("manager projectNo");
    await notify([p?.manager], { title: `Payment received – ${p?.projectNo}`, message: `₹${doc.amount.toLocaleString("en-IN")} (${doc.receiptNo})`, link: `/projects/${doc.project}?tab=finance`, type: "payment" }, ctx.user.id);
  },
  afterUpdate: async (doc, before) => {
    await Promise.all([syncInvoice(doc.invoice), syncInvoice(before.invoice), syncMilestones(doc.project)]);
  },
  afterDelete: async (doc) => {
    await Promise.all([syncInvoice(doc.invoice), syncMilestones(doc.project)]);
  },
});

/* --------------------------------- Invoices ------------------------------ */
const invBase = {
  type: zOptEnum(values(INVOICE_TYPES)),
  project: zId,
  quotation: zRef,
  date: zDate,
  dueDate: zDate,
  items: z.array(zLineItem).min(1).max(1000),
  discountAmount: zMoney,
  interState: z.boolean().optional(),
  notes: zText(5000),
  terms: zText(5000),
};

export function invoiceTotals(data: any) {
  const items = computeItems(data.items ?? []);
  const subtotal = round2(items.reduce((s, i) => s + i.amount, 0));
  const discount = Math.min(Number(data.discountAmount) || 0, subtotal);
  const taxableAmount = round2(subtotal - discount);
  const ratio = subtotal > 0 ? taxableAmount / subtotal : 0;
  const taxAmount = round2(items.reduce((s, i: any) => s + (i.amount * ratio * (Number(i.gstRate) || 0)) / 100, 0));
  const half = round2(taxAmount / 2);
  const exact = round2(taxableAmount + taxAmount);
  const total = Math.round(exact); // bills are rounded to the nearest rupee
  return {
    items,
    subtotal,
    discountAmount: discount,
    taxableAmount,
    taxAmount,
    igst: data.interState ? taxAmount : 0,
    cgst: data.interState ? 0 : half,
    sgst: data.interState ? 0 : round2(taxAmount - half),
    roundOff: round2(total - exact),
    total,
    balance: round2(total - (Number(data.amountPaid) || 0)),
  };
}

export const invoices = crud({
  model: Invoice,
  resource: "invoices",
  entity: "Invoice",
  createSchema: z.object(invBase),
  updateSchema: z.object(invBase).partial().omit({ project: true }),
  search: ["invoiceNo", "notes"],
  filters: { project: "id", client: "id", status: "list", type: "list" },
  dateField: "date",
  sortable: ["date", "total", "createdAt", "dueDate"],
  defaultSort: "-date",
  populate: [
    { path: "project", select: "name projectNo siteAddress city" },
    { path: "client", select: "name phone email address city gstin" },
    { path: "quotation", select: "quoteNo version" },
    { path: "createdBy", select: "name" },
  ],
  listSelect: "-items",
  numbering: { field: "invoiceNo", prefix: "INV", fy: true },
  ownerField: "createdBy",
  projectScoped: true,
  label: (d) => d.invoiceNo,
  beforeCreate: async (data) => {
    const p = await Project.findById(data.project).select("client").lean<any>();
    if (!p) throw notFound("Site not found");
    data.client = p.client;
    data.terms ??= await getSetting<string>("invoiceTerms");
    return { ...data, ...invoiceTotals(data) };
  },
  afterCreate: async (doc, ctx) => {
    await advanceStageIf(doc.project, ["execution"], "billing", ctx.user.id, `Bill ${doc.invoiceNo} generated`);
  },
  beforeUpdate: (data, existing) => {
    if (["paid", "cancelled"].includes(existing.status)) throw badRequest("Paid/cancelled invoices cannot be edited");
    const merged = { ...existing.toObject(), ...data };
    return { ...data, ...invoiceTotals(merged) };
  },
  beforeDelete: async (doc) => {
    if (await Payment.exists({ invoice: doc._id })) throw badRequest("Invoice has payments – cancel it instead");
  },
});

export const invoiceStatus = api({ perm: "invoices:write" }, async ({ req, params, user, ip }) => {
  const id = assertId(params.id);
  const { status } = await parseBody(req, z.object({ status: z.enum(values(INVOICE_STATUS)) }));
  const inv = await Invoice.findById(id);
  if (!inv) throw notFound("Invoice not found");
  await assertProjectAccess(user, inv.project);
  if (!["draft", "issued", "cancelled"].includes(status)) throw badRequest("Paid status is set automatically from payments");
  if (status === "cancelled" && (await Payment.exists({ invoice: inv._id }))) throw badRequest("Invoice has payments");
  inv.status = status;
  await inv.save();
  if (status === "issued") await syncInvoice(inv._id);
  await audit(user, "status", "Invoice", inv._id, `${inv.invoiceNo} → ${status}`, { project: inv.project, ip });
  return serialize((await Invoice.findById(id).lean()));
});

/* --------------------------------- Expenses ------------------------------ */
const expBase = {
  project: zRef,
  category: z.enum(values(EXPENSE_CATEGORIES)),
  vendor: zRef,
  contractor: zRef,
  purchaseOrder: zRef,
  workOrder: zRef,
  payee: zText(150),
  amount: z.coerce.number().positive().max(1e11),
  date: zDate,
  mode: zOptEnum(values(PAYMENT_MODES)),
  reference: zText(100),
  description: zText(2000),
  files: zRefs,
};

async function expenseLinks(data: any) {
  if (data.purchaseOrder) {
    const po = await PurchaseOrder.findById(data.purchaseOrder).select("vendor project").lean<any>();
    if (!po) throw notFound("PO not found");
    data.vendor = po.vendor;
    data.project ??= po.project;
    data.category = "vendor_payment";
  }
  if (data.workOrder) {
    const wo = await WorkOrder.findById(data.workOrder).select("contractor project").lean<any>();
    if (!wo) throw notFound("Work order not found");
    data.contractor = wo.contractor;
    data.project = wo.project;
    data.category = "contractor_payment";
  }
  if (!data.payee) {
    if (data.vendor) data.payee = (await Vendor.findById(data.vendor).select("name").lean<any>())?.name;
    else if (data.contractor) data.payee = (await Contractor.findById(data.contractor).select("name").lean<any>())?.name;
  }
  return data;
}

export const expenses = crud({
  model: Expense,
  resource: "expenses",
  entity: "Expense",
  createSchema: z.object(expBase),
  updateSchema: z.object(expBase).partial(),
  search: ["expenseNo", "payee", "description", "reference"],
  filters: { project: "id", category: "list", vendor: "id", contractor: "id", purchaseOrder: "id", workOrder: "id", mode: "list" },
  dateField: "date",
  sortable: ["date", "amount", "createdAt"],
  defaultSort: "-date",
  populate: [
    { path: "project", select: "name projectNo" },
    { path: "vendor", select: "name" },
    { path: "contractor", select: "name trade" },
    { path: "purchaseOrder", select: "poNo" },
    { path: "workOrder", select: "woNo" },
    { path: "paidBy", select: "name" },
  ],
  numbering: { field: "expenseNo", prefix: "EXP" },
  ownerField: "paidBy",
  projectScoped: "optional",
  label: (d) => `${d.expenseNo} ₹${d.amount}`,
  beforeCreate: expenseLinks,
  afterCreate: async (doc) => Promise.all([syncPoPayment(doc.purchaseOrder), syncWorkOrderPaid(doc.workOrder)]).then(() => undefined),
  beforeUpdate: async (data) => expenseLinks(data),
  afterUpdate: async (doc, before) =>
    Promise.all([syncPoPayment(doc.purchaseOrder), syncPoPayment(before.purchaseOrder), syncWorkOrderPaid(doc.workOrder), syncWorkOrderPaid(before.workOrder)]).then(() => undefined),
  afterDelete: async (doc) => Promise.all([syncPoPayment(doc.purchaseOrder), syncWorkOrderPaid(doc.workOrder)]).then(() => undefined),
});

/* -------------------------- Accounts: site-wise view --------------------- */
export const accountsSummary = api({ perm: "accounts:read" }, async ({ user }) => {
  const ids = await accessibleProjectIds(user);
  const pMatch: any = ids ? { _id: { $in: ids } } : {};
  const projects = await Project.find(pMatch)
    .select("name projectNo status stage contractValue client paymentSchedule")
    .populate({ path: "client", select: "name" })
    .sort("-createdAt")
    .lean<any[]>();
  const pids = projects.map((p) => p._id);
  const group = (model: any, field: string, extra: any = {}) =>
    model.aggregate([{ $match: { project: { $in: pids }, ...extra } }, { $group: { _id: "$project", t: { $sum: `$${field}` }, last: { $max: "$date" } } }]);
  const [rec, exp, inv, stock] = await Promise.all([
    group(Payment, "amount"),
    group(Expense, "amount"),
    group(Invoice, "total", { status: { $nin: ["cancelled", "draft"] } }),
    materialFromStockByProject(pids),
  ]);
  const m = (rows: any[]) => new Map(rows.map((r) => [String(r._id), r]));
  const R = m(rec), E = m(exp), I = m(inv);
  const sites = projects.map((p) => {
    const received = round2(R.get(String(p._id))?.t ?? 0);
    const spent = round2(E.get(String(p._id))?.t ?? 0);
    const materialFromStock = stock.get(String(p._id)) ?? 0;
    const cost = round2(spent + materialFromStock);
    const due = p.paymentSchedule?.find((x: any) => x.status === "due");
    return {
      id: String(p._id),
      projectNo: p.projectNo,
      name: p.name,
      client: p.client?.name,
      status: p.status,
      stage: p.stage,
      contractValue: p.contractValue ?? 0,
      invoiced: round2(I.get(String(p._id))?.t ?? 0),
      received,
      spent,
      materialFromStock,
      cost,
      balance: round2(received - cost),
      outstanding: round2((p.contractValue ?? 0) - received),
      lastPaymentAt: R.get(String(p._id))?.last ?? null,
      nextMilestone: due ? { name: due.name, amount: due.amount } : null,
    };
  });
  const noSite = await Expense.aggregate([
    { $match: { project: null } },
    { $group: { _id: { $in: ["$category", MATERIAL_EXPENSE_CATEGORIES] }, t: { $sum: "$amount" } } },
  ]);
  const totals = sites.reduce(
    (a, s) => ({
      contractValue: a.contractValue + s.contractValue,
      received: a.received + s.received,
      spent: a.spent + s.spent,
      materialFromStock: a.materialFromStock + s.materialFromStock,
      cost: a.cost + s.cost,
      outstanding: a.outstanding + Math.max(0, s.outstanding),
      invoiced: a.invoiced + s.invoiced,
    }),
    { contractValue: 0, received: 0, spent: 0, materialFromStock: 0, cost: 0, outstanding: 0, invoiced: 0 }
  );
  const r2 = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])) as typeof totals;
  return {
    sites,
    totals: {
      ...r2,
      balance: round2(totals.received - totals.cost),
      officeOverheads: round2(noSite.find((x: any) => x._id === false)?.t ?? 0),
      factoryPurchases: round2(noSite.find((x: any) => x._id === true)?.t ?? 0),
    },
  };
});

/** What we owe: vendors (PO value − paid) and contractors (WO value − paid). */
export const payables = api({ perm: "accounts:read" }, async () => {
  const [vend, cont] = await Promise.all([
    PurchaseOrder.aggregate([
      { $match: { status: { $nin: ["cancelled", "draft"] } } },
      { $group: { _id: "$vendor", total: { $sum: "$total" }, paid: { $sum: "$paidAmount" }, orders: { $sum: 1 } } },
      { $lookup: { from: "vendors", localField: "_id", foreignField: "_id", as: "v" } },
      { $unwind: "$v" },
      { $project: { name: "$v.name", phone: "$v.phone", total: 1, paid: 1, orders: 1, due: { $subtract: ["$total", "$paid"] } } },
      { $match: { due: { $gt: 0.5 } } },
      { $sort: { due: -1 } },
    ]),
    WorkOrder.aggregate([
      { $match: { status: { $ne: "terminated" } } },
      { $group: { _id: "$contractor", total: { $sum: "$amount" }, paid: { $sum: "$paidAmount" }, orders: { $sum: 1 } } },
      { $lookup: { from: "contractors", localField: "_id", foreignField: "_id", as: "c" } },
      { $unwind: "$c" },
      { $project: { name: "$c.name", trade: "$c.trade", phone: "$c.phone", total: 1, paid: 1, orders: 1, due: { $subtract: ["$total", "$paid"] } } },
      { $match: { due: { $gt: 0.5 } } },
      { $sort: { due: -1 } },
    ]),
  ]);
  const fix = (r: any) => ({ ...r, id: String(r._id), _id: undefined, due: round2(r.due) });
  return { vendors: vend.map(fix), contractors: cont.map(fix) };
});

export async function monthlyCashflow(months = 12, projectIds: Types.ObjectId[] | null = null) {
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1), 1);
  since.setHours(0, 0, 0, 0);
  const pm = projectIds ? { project: { $in: projectIds } } : {};
  const agg = (model: any) =>
    model.aggregate([
      { $match: { date: { $gte: since }, ...pm } },
      { $group: { _id: { y: { $year: "$date" }, m: { $month: "$date" } }, t: { $sum: "$amount" } } },
    ]);
  const [inn, out] = await Promise.all([agg(Payment), agg(Expense)]);
  const key = (r: any) => `${r._id.y}-${String(r._id.m).padStart(2, "0")}`;
  const I = new Map(inn.map((r: any) => [key(r), r.t]));
  const O = new Map(out.map((r: any) => [key(r), r.t]));
  const res = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(since);
    d.setMonth(since.getMonth() + i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    res.push({ month: k, received: round2(Number(I.get(k) ?? 0)), spent: round2(Number(O.get(k) ?? 0)) });
  }
  return res;
}
