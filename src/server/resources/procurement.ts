/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from "mongoose";
import { z } from "zod";
import { DELIVERY_LOCATIONS, MATERIAL_CATEGORIES, PO_STATUS, TRADES, UNITS, values } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { crud } from "../crud";
import { api, assertId, badRequest, forbidden, notFound, parseBody } from "../http";
import { Expense, GRN, Material, MaterialRequest, Project, PurchaseOrder, StockTxn, User, Vendor, serialize } from "../models";
import { assertProjectAccess, audit, computeItems, nextNumber, notify, projectFilter, round2 } from "../services/core";
import { getSetting } from "../services/settings";
import { siteReceipt, stockIn, stockOut } from "../services/stock";
import {
  aliasId,
  zBool,
  zDate,
  zEmail,
  zId,
  zLineItem,
  zMoney,
  zNum,
  zOptEnum,
  zOptPhone,
  zRef,
  zRefs,
  zStr,
  zText,
} from "../validators";
import { advanceStageIf } from "./projects";

/* --------------------------------- Vendors ------------------------------- */
const bank = z
  .object({ accountName: zText(100), accountNo: zText(30), ifsc: zText(15), bankName: zText(100), upi: zText(100) })
  .partial()
  .optional();

const vendorBase = {
  name: zStr(150),
  contactPerson: zText(100),
  phone: zOptPhone,
  email: zEmail,
  address: zText(500),
  city: zText(100),
  gstin: zText(20),
  categories: z.array(z.enum(values(MATERIAL_CATEGORIES))).max(20).optional(),
  paymentTerms: zText(300),
  creditDays: zNum,
  bank,
  rating: z.coerce.number().min(0).max(5).optional(),
  isActive: zBool,
  notes: zText(5000),
};

export const vendors = crud({
  model: Vendor,
  resource: "vendors",
  entity: "Vendor",
  createSchema: z.object(vendorBase),
  updateSchema: z.object(vendorBase).partial(),
  search: ["name", "contactPerson", "phone", "city", "vendorNo", "gstin"],
  filters: { categories: "list", isActive: "bool", city: "string" },
  sortable: ["name", "createdAt", "rating"],
  defaultSort: "name",
  numbering: { field: "vendorNo", prefix: "VEN" },
  ownerField: "createdBy",
  beforeDelete: async (doc) => {
    if (await PurchaseOrder.exists({ vendor: doc._id })) throw badRequest("Vendor has purchase orders – deactivate instead");
  },
});

/* -------------------------------- Materials ------------------------------ */
const materialBase = {
  code: zText(30),
  name: zStr(200),
  category: z.enum(values(MATERIAL_CATEGORIES)),
  unit: z.enum(values(UNITS)).default("nos"),
  brand: zText(100),
  specification: zText(1000),
  hsn: zText(20),
  gstRate: z.coerce.number().min(0).max(28).optional(),
  defaultRate: zMoney,
  minStock: zNum,
  preferredVendor: zRef,
  isActive: zBool,
  notes: zText(2000),
};

export const materials = crud({
  model: Material,
  resource: "materials",
  entity: "Material",
  createSchema: z.object({ ...materialBase, openingStock: zNum, openingRate: zMoney }),
  updateSchema: z.object(materialBase).partial(),
  search: ["name", "code", "brand", "specification"],
  filters: { category: "list", isActive: "bool", preferredVendor: "id" },
  sortable: ["name", "category", "stockQty", "createdAt"],
  defaultSort: "name",
  populate: { path: "preferredVendor", select: "name" },
  scope: ({ req }) =>
    req.nextUrl.searchParams.get("lowStock") === "true" ? { minStock: { $gt: 0 }, $expr: { $lte: ["$stockQty", "$minStock"] } } : {},
  beforeCreate: (data, ctx) => {
    if (!data.code) delete data.code;
    (ctx as any).opening = { qty: data.openingStock, rate: data.openingRate ?? data.defaultRate ?? 0 };
    delete data.openingStock;
    delete data.openingRate;
    return data;
  },
  afterCreate: async (doc, ctx) => {
    const o = (ctx as any).opening;
    if (o?.qty > 0) await stockIn(doc._id, o.qty, o.rate, { refType: "opening", refNo: "Opening stock", userId: ctx.user.id }, "adjust");
  },
  beforeUpdate: (data) => {
    if (data.code === "") delete data.code;
    return data;
  },
  beforeDelete: async (doc) => {
    if (await StockTxn.exists({ material: doc._id })) throw badRequest("Material has stock history – deactivate instead");
  },
});

/** Stock ledger listing. */
export const stockLedger = api({ perm: "inventory:read" }, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const filter: any = {};
  for (const k of ["material", "project"]) {
    const v = sp.get(k);
    if (v) filter[k] = new Types.ObjectId(assertId(v, k));
  }
  const type = sp.get("type");
  if (type) filter.type = { $in: type.split(",").slice(0, 10) };
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(200, Number(sp.get("limit")) || 50);
  const [rows, total] = await Promise.all([
    StockTxn.find(filter)
      .sort("-date -createdAt")
      .skip((page - 1) * limit)
      .limit(limit)
      .populate([{ path: "material", select: "name unit code" }, { path: "project", select: "name projectNo" }, { path: "createdBy", select: "name" }])
      .lean(),
    StockTxn.countDocuments(filter),
  ]);
  return Response.json({ success: true, data: serialize(rows), meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

/** Material consumed per site (issued from factory − returned + direct deliveries). */
export const siteConsumption = api({ perm: "inventory:read" }, async ({ req, user }) => {
  const project = assertId(req.nextUrl.searchParams.get("project") ?? undefined, "project");
  await assertProjectAccess(user, project);
  const rows = await StockTxn.aggregate([
    { $match: { project: new Types.ObjectId(project), type: { $in: ["issue", "return", "site_receipt"] } } },
    {
      $group: {
        _id: "$material",
        issued: { $sum: { $cond: [{ $eq: ["$type", "issue"] }, { $abs: "$qty" }, 0] } },
        returned: { $sum: { $cond: [{ $eq: ["$type", "return"] }, "$qty", 0] } },
        direct: { $sum: { $cond: [{ $eq: ["$type", "site_receipt"] }, "$qty", 0] } },
        value: { $sum: { $cond: [{ $eq: ["$type", "site_receipt"] }, "$value", { $multiply: ["$value", -1] }] } },
      },
    },
    { $lookup: { from: "materials", localField: "_id", foreignField: "_id", as: "m" } },
    { $unwind: "$m" },
    { $project: { material: { id: "$_id", name: "$m.name", unit: "$m.unit", category: "$m.category" }, issued: 1, returned: 1, direct: 1, value: 1 } },
    { $sort: { "material.name": 1 } },
  ]);
  return rows.map((r: any) => ({ ...r, _id: undefined, material: { ...r.material, id: String(r.material.id) }, net: round2(r.issued - r.returned + r.direct), value: round2(r.value) }));
});

const moveBody = z.object({
  project: zId,
  materialRequest: zRef,
  issuedTo: zText(100),
  date: zDate,
  notes: zText(1000),
  items: z.array(z.object({ material: zId, qty: z.coerce.number().positive().max(1e6), mrItem: zRef })).min(1).max(200),
});

/** Issue factory stock to a site (e.g. 10 ply sheets from factory to site). */
export const issueStock = api({ perm: "inventory:write" }, async ({ req, user, ip }) => {
  const body = await parseBody(req, moveBody);
  await assertProjectAccess(user, body.project);
  const refNo = await nextNumber("ISS");
  const done: { material: string; qty: number }[] = [];
  try {
    for (const it of body.items) {
      await stockOut(it.material, it.qty, { refType: "issue", refNo, project: body.project, issuedTo: body.issuedTo, date: body.date ?? undefined, notes: body.notes, userId: user.id });
      done.push(it);
    }
  } catch (e) {
    // roll back what was already issued in this batch
    for (const d of done) await stockIn(d.material, d.qty, 0, { refType: "rollback", refNo, project: body.project, userId: user.id }, "return");
    throw e;
  }
  if (body.materialRequest) {
    const mr = await MaterialRequest.findById(body.materialRequest);
    if (mr) {
      for (const it of body.items) {
        const line = it.mrItem ? mr.items.id(it.mrItem) : mr.items.find((x: any) => String(x.material) === String(it.material));
        if (line) line.issuedQty = round2((line.issuedQty ?? 0) + it.qty);
      }
      const complete = mr.items.every((x: any) => (x.issuedQty ?? 0) + (x.orderedQty ?? 0) >= x.qty);
      mr.status = complete ? "fulfilled" : "issued";
      await mr.save();
      await notify([mr.requestedBy], { title: `Material issued (${mr.mrNo})`, message: `${body.items.length} item(s) issued from store`, link: `/procurement/requests`, type: "material" }, user.id);
    }
  }
  await audit(user, "issue", "Stock", null, `Issued ${body.items.length} item(s) to site (${refNo})`, { project: body.project, ip });
  return { refNo, issued: body.items.length };
});

/** Return unused material from site back to factory. */
export const returnStock = api({ perm: "inventory:write" }, async ({ req, user, ip }) => {
  const body = await parseBody(req, moveBody);
  await assertProjectAccess(user, body.project);
  const refNo = await nextNumber("RET");
  for (const it of body.items) {
    await stockIn(it.material, it.qty, 0, { refType: "return", refNo, project: body.project, date: body.date ?? undefined, notes: body.notes, userId: user.id }, "return");
  }
  await audit(user, "return", "Stock", null, `Returned ${body.items.length} item(s) from site (${refNo})`, { project: body.project, ip });
  return { refNo };
});

/** Manual stock correction (damage, physical count). */
export const adjustStock = api({ perm: "inventory:approve" }, async ({ req, user, ip }) => {
  const body = await parseBody(
    req,
    z.object({ material: zId, qty: z.coerce.number().refine((n) => n !== 0, "Qty cannot be 0"), rate: zMoney, notes: zStr(500) })
  );
  if (body.qty > 0) await stockIn(body.material, body.qty, body.rate ?? 0, { refType: "adjust", notes: body.notes, userId: user.id }, "adjust");
  else await stockOut(body.material, -body.qty, { refType: "adjust", notes: body.notes, userId: user.id }, "adjust");
  await audit(user, "adjust", "Material", body.material, `Stock adjusted by ${body.qty}: ${body.notes}`, { ip });
  return serialize(await Material.findById(body.material).lean());
});

/* ---------------------------- Material requests -------------------------- */
const mrItem = z.preprocess(aliasId, z.object({
  _id: zId.optional(),
  material: zRef,
  description: zStr(300),
  category: zText(50),
  qty: z.coerce.number().positive().max(1e6),
  unit: z.string().max(20).default("nos"),
  notes: zText(500),
}));
const mrBase = {
  project: zId,
  trade: zOptEnum(values(TRADES)),
  requiredBy: zDate,
  priority: z.enum(["normal", "urgent"]).optional(),
  items: z.array(mrItem).min(1).max(200),
  notes: zText(2000),
};

export const materialRequests = crud({
  model: MaterialRequest,
  resource: "material_requests",
  entity: "Material request",
  createSchema: z.object(mrBase),
  updateSchema: z.object(mrBase).partial().omit({ project: true }),
  search: ["mrNo", "notes", "items.description"],
  filters: { project: "id", status: "list", trade: "list", requestedBy: "id", priority: "string" },
  dateField: "createdAt",
  sortable: ["createdAt", "requiredBy"],
  populate: [
    { path: "project", select: "name projectNo" },
    { path: "requestedBy", select: "name" },
    { path: "approvedBy", select: "name" },
    { path: "items.material", select: "name unit stockQty code" },
  ],
  numbering: { field: "mrNo", prefix: "MR" },
  ownerField: "requestedBy",
  projectScoped: true,
  label: (d) => d.mrNo,
  afterCreate: async (doc, ctx) => {
    const p = await Project.findById(doc.project).select("manager projectNo");
    const store = await User.find({ role: { $in: ["store", "admin"] }, isActive: true }).select("_id").lean();
    await notify(
      [p?.manager, ...store.map((s: any) => s._id)],
      { title: `Material request ${doc.mrNo}`, message: `${p?.projectNo}: ${doc.items.length} item(s)${doc.priority === "urgent" ? " – URGENT" : ""}`, link: "/procurement/requests", type: "material" },
      ctx.user.id
    );
  },
  beforeUpdate: (data, existing) => {
    if (existing.status !== "pending") throw badRequest("Only pending requests can be edited");
    return data;
  },
});

export const decideMaterialRequest = api({ perm: "material_requests:approve" }, async ({ req, params, user, ip }) => {
  const id = assertId(params.id);
  const body = await parseBody(req, z.object({ action: z.enum(["approve", "reject"]), reason: zText(500) }));
  const mr = await MaterialRequest.findById(id);
  if (!mr) throw notFound("Request not found");
  await assertProjectAccess(user, mr.project);
  if (mr.status !== "pending") throw badRequest("Request already processed");
  mr.status = body.action === "approve" ? "approved" : "rejected";
  mr.approvedBy = user.id;
  mr.approvedAt = new Date();
  if (body.action === "reject") mr.rejectionReason = body.reason;
  await mr.save();
  await notify([mr.requestedBy], { title: `${mr.mrNo} ${mr.status}`, message: body.reason, link: "/procurement/requests", type: "material" }, user.id);
  await audit(user, body.action, "Material request", mr._id, `${mr.mrNo} ${mr.status}`, { project: mr.project, ip });
  return serialize(mr.toJSON());
});

/* ----------------------------- Purchase orders --------------------------- */
const poBase = {
  vendor: zId,
  project: zRef,
  materialRequest: zRef,
  deliverTo: zOptEnum(values(DELIVERY_LOCATIONS)),
  category: zOptEnum(values(MATERIAL_CATEGORIES)),
  date: zDate,
  expectedDate: zDate,
  items: z.array(zLineItem).min(1).max(500),
  freight: zMoney,
  status: z.enum(["draft", "ordered"]).optional(),
  terms: zText(5000),
  notes: zText(5000),
};

export function poTotals(data: any) {
  const items = computeItems(data.items ?? []);
  const subtotal = round2(items.reduce((s, i) => s + i.amount, 0));
  const taxAmount = round2(items.reduce((s, i: any) => s + (i.amount * (Number(i.gstRate) || 0)) / 100, 0));
  return { items, subtotal, taxAmount, total: round2(subtotal + taxAmount + (Number(data.freight) || 0)) };
}

async function poScope(ctx: any) {
  if (can(ctx.user.permissions, "purchase_orders:all")) return {};
  const ids = (await Project.find(projectFilter(ctx.user)).select("_id").lean()).map((p: any) => p._id);
  return { project: { $in: ids } };
}

export const purchaseOrders = crud({
  model: PurchaseOrder,
  resource: "purchase_orders",
  entity: "Purchase order",
  createSchema: z.object(poBase),
  updateSchema: z.object(poBase).partial(),
  search: ["poNo", "notes", "items.description"],
  filters: { vendor: "id", project: "id", status: "list", paymentStatus: "list", deliverTo: "string", category: "list" },
  dateField: "date",
  sortable: ["createdAt", "date", "total", "expectedDate"],
  populate: [
    { path: "vendor", select: "name phone address gstin contactPerson" },
    { path: "project", select: "name projectNo siteAddress" },
    { path: "materialRequest", select: "mrNo" },
    { path: "createdBy", select: "name" },
  ],
  numbering: { field: "poNo", prefix: "PO" },
  ownerField: "createdBy",
  scope: poScope,
  label: (d) => d.poNo,
  beforeCreate: async (data, ctx) => {
    if (data.project) await assertProjectAccess(ctx.user, data.project);
    data.deliverTo ??= data.project ? "site" : "factory";
    data.terms ??= await getSetting<string>("poTerms");
    return { ...data, ...poTotals(data) };
  },
  afterCreate: async (doc, ctx) => {
    if (doc.materialRequest) {
      const mr = await MaterialRequest.findById(doc.materialRequest);
      if (mr) {
        for (const it of doc.items) {
          const line = mr.items.find((x: any) => (it.material && String(x.material) === String(it.material)) || x.description === it.description);
          if (line) line.orderedQty = round2((line.orderedQty ?? 0) + it.qty);
        }
        mr.status = "ordered";
        await mr.save();
      }
    }
    if (doc.project) await advanceStageIf(doc.project, ["quotation", "contractor_selection"], "procurement", ctx.user.id, `PO ${doc.poNo} raised`);
  },
  beforeUpdate: (data, existing) => {
    if (["received", "partially_received", "cancelled"].includes(existing.status) && data.items) {
      throw badRequest("Items cannot be changed after material is received / PO cancelled");
    }
    const merged = { ...existing.toObject(), ...data };
    return data.items || data.freight !== undefined ? { ...data, ...poTotals(merged) } : data;
  },
  beforeDelete: async (doc) => {
    if (await GRN.exists({ purchaseOrder: doc._id })) throw badRequest("PO has GRNs – cancel it instead");
    if (await Expense.exists({ purchaseOrder: doc._id })) throw badRequest("PO has payments – cancel it instead");
  },
});

export const poStatus = api({ perm: "purchase_orders:write" }, async ({ req, params, user, ip }) => {
  const id = assertId(params.id);
  const { status } = await parseBody(req, z.object({ status: z.enum(values(PO_STATUS)) }));
  const po = await PurchaseOrder.findById(id);
  if (!po) throw notFound("PO not found");
  if (!["ordered", "cancelled", "draft"].includes(status)) throw badRequest("Received status is set automatically by GRN");
  if (status === "cancelled" && (await GRN.exists({ purchaseOrder: po._id }))) throw badRequest("PO has GRNs and cannot be cancelled");
  po.status = status;
  await po.save();
  await audit(user, "status", "Purchase order", po._id, `${po.poNo} → ${status}`, { project: po.project, ip });
  return serialize(po.toJSON());
});

export async function syncPoPayment(poId: unknown) {
  if (!poId) return;
  const [r] = await Expense.aggregate([{ $match: { purchaseOrder: new Types.ObjectId(String(poId)) } }, { $group: { _id: null, t: { $sum: "$amount" } } }]);
  const po = await PurchaseOrder.findById(poId);
  if (!po) return;
  po.paidAmount = round2(r?.t ?? 0);
  po.paymentStatus = po.paidAmount <= 0 ? "unpaid" : po.paidAmount + 0.5 >= po.total ? "paid" : "partial";
  await po.save();
}

/* ---------------------------------- GRN ---------------------------------- */
const grnItem = z.object({
  poItem: zRef,
  material: zRef,
  description: zStr(300),
  unit: zText(20),
  orderedQty: zNum,
  receivedQty: z.coerce.number().min(0).max(1e6),
  rejectedQty: z.coerce.number().min(0).max(1e6).default(0),
  rate: zMoney,
  remarks: zText(500),
});
const grnBody = z.object({
  purchaseOrder: zRef,
  vendor: zRef,
  project: zRef,
  location: zOptEnum(values(DELIVERY_LOCATIONS)),
  category: zOptEnum(values(MATERIAL_CATEGORIES)),
  receivedAt: zDate,
  items: z.array(grnItem).min(1).max(500),
  vendorInvoiceNo: zText(50),
  vendorInvoiceAmount: zMoney,
  vehicleNo: zText(30),
  photos: zRefs,
  notes: zText(2000),
});

export const grns = crud({
  model: GRN,
  resource: "grn",
  entity: "GRN",
  search: ["grnNo", "vendorInvoiceNo", "items.description"],
  filters: { purchaseOrder: "id", vendor: "id", project: "id", location: "string", category: "list" },
  dateField: "receivedAt",
  sortable: ["createdAt", "receivedAt"],
  populate: [
    { path: "vendor", select: "name" },
    { path: "project", select: "name projectNo" },
    { path: "purchaseOrder", select: "poNo" },
    { path: "receivedBy", select: "name" },
    { path: "photos", select: "originalName mimeType size storageKey" },
  ],
  scope: poScope,
});

/** Receive goods: updates PO received quantities/status and factory stock. */
export const createGrn = api({ perm: "grn:write" }, async ({ req, user, ip }) => {
  const body = await parseBody(req, grnBody);
  let po: any = null;
  if (body.purchaseOrder) {
    po = await PurchaseOrder.findById(body.purchaseOrder);
    if (!po) throw notFound("PO not found");
    if (po.status === "cancelled") throw badRequest("PO is cancelled");
    if (po.status === "draft") po.status = "ordered";
    body.vendor ??= String(po.vendor);
    body.project ??= po.project ? String(po.project) : null;
    body.location ??= po.deliverTo;
    body.category ??= po.category;
  }
  if (!body.vendor) throw badRequest("Vendor is required");
  if (body.project) await assertProjectAccess(user, body.project);
  const location = body.location ?? (body.project ? "site" : "factory");
  if (location === "site" && !body.project) throw badRequest("Select the site where material was received");
  // Receiving into factory stock is a store/manager job – site staff only receive at their own sites.
  if (location === "factory" && !can(user.permissions, "grn:all")) throw forbidden("Only store / managers can receive goods into factory stock");

  // Never accept more than is still pending on the PO line (prevents phantom stock).
  if (po) {
    for (const it of body.items) {
      if (!it.poItem) continue;
      const line = po.items.id(it.poItem);
      if (!line) throw badRequest(`Item "${it.description}" is not on ${po.poNo}`);
      const accepted = Math.max(0, it.receivedQty - (it.rejectedQty ?? 0));
      const pending = round2(line.qty - (line.receivedQty ?? 0));
      if (accepted > pending + 1e-6) {
        throw badRequest(`${line.description}: only ${pending} ${line.unit} pending on ${po.poNo}, cannot accept ${accepted}`);
      }
    }
  }

  const grn = await GRN.create({ ...body, location, grnNo: await nextNumber("GRN"), receivedBy: user.id });

  for (const it of grn.items) {
    const accepted = Math.max(0, (it.receivedQty ?? 0) - (it.rejectedQty ?? 0));
    if (po && it.poItem) {
      const line = po.items.id(it.poItem);
      if (line) {
        line.receivedQty = round2((line.receivedQty ?? 0) + accepted);
        it.rate ||= line.rate;
        it.material ??= line.material;
      }
    }
    const ref = { refType: "grn", refId: grn._id, refNo: grn.grnNo, project: grn.project, date: grn.receivedAt, userId: user.id };
    if (it.material && accepted > 0) {
      if (location === "factory") await stockIn(it.material, accepted, it.rate ?? 0, ref, "in");
      else await siteReceipt(it.material, accepted, it.rate ?? 0, ref);
    }
  }
  await grn.save();
  if (po) {
    const all = po.items.every((l: any) => (l.receivedQty ?? 0) >= l.qty);
    po.status = all ? "received" : "partially_received";
    await po.save();
    if (all && po.materialRequest) await MaterialRequest.updateOne({ _id: po.materialRequest, status: { $in: ["ordered", "issued", "approved"] } }, { $set: { status: "fulfilled" } });
  }
  await audit(user, "create", "GRN", grn._id, `${grn.grnNo} received${po ? ` against ${po.poNo}` : ""}`, { project: grn.project, ip });
  return serialize((await GRN.findById(grn._id).populate([{ path: "vendor", select: "name" }, { path: "purchaseOrder", select: "poNo" }]).lean()));
});

/** Delete a GRN and reverse its stock / PO effects. */
export const deleteGrn = api({ perm: "grn:delete" }, async ({ params, user, ip }) => {
  const id = assertId(params.id);
  const grn = await GRN.findById(id);
  if (!grn) throw notFound("GRN not found");
  if (grn.location === "factory") {
    for (const it of grn.items) {
      const accepted = Math.max(0, (it.receivedQty ?? 0) - (it.rejectedQty ?? 0));
      if (it.material && accepted > 0) await stockOut(it.material, accepted, { refType: "grn_reversal", refNo: grn.grnNo, userId: user.id }, "adjust");
    }
  }
  await StockTxn.deleteMany({ refId: grn._id, type: "site_receipt" });
  if (grn.purchaseOrder) {
    const po = await PurchaseOrder.findById(grn.purchaseOrder);
    if (po) {
      for (const it of grn.items) {
        const line = it.poItem ? po.items.id(it.poItem) : null;
        if (line) line.receivedQty = Math.max(0, round2((line.receivedQty ?? 0) - Math.max(0, it.receivedQty - (it.rejectedQty ?? 0))));
      }
      const any = po.items.some((l: any) => (l.receivedQty ?? 0) > 0);
      po.status = any ? "partially_received" : "ordered";
      await po.save();
    }
  }
  await grn.deleteOne();
  await audit(user, "delete", "GRN", grn._id, `Deleted ${grn.grnNo} (stock reversed)`, { project: grn.project, ip });
  return { id };
});
