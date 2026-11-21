/* eslint-disable @typescript-eslint/no-explicit-any */
import { badRequest, notFound } from "../http";
import { Material, StockTxn } from "../models";
import { round2 } from "./core";

type Ref = { refType: string; refId?: unknown; refNo?: string; project?: unknown; date?: Date; notes?: string; issuedTo?: string; userId?: string };

/** Factory stock IN with weighted average cost. */
export async function stockIn(materialId: unknown, qty: number, rate: number, ref: Ref, type: "in" | "return" | "adjust" = "in") {
  if (qty <= 0) return;
  const m = await Material.findById(materialId);
  if (!m) throw notFound("Material not found");
  const useRate = type === "in" ? rate : m.avgCost || rate;
  const newQty = round2((m.stockQty ?? 0) + qty);
  const newAvg = newQty > 0 ? round2(((m.stockQty ?? 0) * (m.avgCost ?? 0) + qty * useRate) / newQty) : useRate;
  const updated = await Material.findOneAndUpdate(
    { _id: materialId, stockQty: m.stockQty },
    { $set: { stockQty: newQty, avgCost: newAvg } },
    { returnDocument: "after" }
  );
  if (!updated) return stockIn(materialId, qty, rate, ref, type); // concurrent update – retry
  await StockTxn.create({
    material: materialId,
    type,
    qty,
    rate: useRate,
    value: round2(qty * useRate),
    balanceAfter: newQty,
    project: ref.project,
    refType: ref.refType,
    refId: ref.refId,
    refNo: ref.refNo,
    date: ref.date ?? new Date(),
    notes: ref.notes,
    createdBy: ref.userId,
  });
}

/** Factory stock OUT (issue to site / negative adjustment). Fails if stock is insufficient. */
export async function stockOut(materialId: unknown, qty: number, ref: Ref, type: "issue" | "adjust" = "issue") {
  if (qty <= 0) return;
  const m = await Material.findOneAndUpdate(
    { _id: materialId, stockQty: { $gte: qty } },
    { $inc: { stockQty: -qty } },
    { returnDocument: "after" }
  );
  if (!m) {
    const cur = await Material.findById(materialId).select("name stockQty unit").lean<any>();
    if (!cur) throw notFound("Material not found");
    throw badRequest(`Insufficient stock for ${cur.name}: available ${cur.stockQty} ${cur.unit}, requested ${qty}`);
  }
  await StockTxn.create({
    material: materialId,
    type,
    qty: -qty,
    rate: m.avgCost ?? 0,
    value: round2(-qty * (m.avgCost ?? 0)),
    balanceAfter: m.stockQty,
    project: ref.project,
    refType: ref.refType,
    refId: ref.refId,
    refNo: ref.refNo,
    issuedTo: ref.issuedTo,
    date: ref.date ?? new Date(),
    notes: ref.notes,
    createdBy: ref.userId,
  });
}

/** Material delivered directly to a site (no factory stock change) – kept for consumption tracking. */
export async function siteReceipt(materialId: unknown, qty: number, rate: number, ref: Ref) {
  if (qty <= 0 || !materialId) return;
  await StockTxn.create({
    material: materialId,
    type: "site_receipt",
    qty,
    rate,
    value: round2(qty * rate),
    project: ref.project,
    refType: ref.refType,
    refId: ref.refId,
    refNo: ref.refNo,
    date: ref.date ?? new Date(),
    notes: ref.notes,
    createdBy: ref.userId,
  });
}
