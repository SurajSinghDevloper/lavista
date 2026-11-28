/* eslint-disable @typescript-eslint/no-explicit-any */
import { badRequest, conflict, notFound } from "../http";
import { Material, StockTxn } from "../models";
import { round2 } from "./core";

type Ref = { refType: string; refId?: unknown; refNo?: string; project?: unknown; date?: Date; notes?: string; issuedTo?: string; userId?: string };

/** Quantities are kept to 3 decimals (kg / m / sqft); money to 2. Avoids 1 − 0.9 = 0.09999… */
const roundQty = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;
/** Half the smallest quantity step – absorbs float noise in stock already stored before rounding. */
const QTY_EPS = 0.0005;

/** Factory stock IN with weighted average cost. */
export async function stockIn(materialId: unknown, qty: number, rate: number, ref: Ref, type: "in" | "return" | "adjust" = "in") {
  qty = roundQty(qty);
  if (qty <= 0) return;
  const m = await Material.findById(materialId);
  if (!m) throw notFound("Material not found");
  const useRate = type === "in" ? rate : m.avgCost || rate;
  const curQty = roundQty(m.stockQty ?? 0);
  const newQty = roundQty(curQty + qty);
  const newAvg = newQty > 0 ? round2((curQty * (m.avgCost ?? 0) + qty * useRate) / newQty) : useRate;
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
  qty = roundQty(qty);
  if (qty <= 0) return;
  let m: any = null;
  for (let attempt = 0; attempt < 10 && !m; attempt++) {
    const cur = await Material.findById(materialId).select("name stockQty unit").lean<any>();
    if (!cur) throw notFound("Material not found");
    const available = roundQty(cur.stockQty ?? 0);
    if (available + QTY_EPS < qty) throw badRequest(`Insufficient stock for ${cur.name}: available ${available} ${cur.unit ?? ""}, requested ${qty}`);
    // compare-and-set on the exact value read, so two issues at the same time can never overdraw
    m = await Material.findOneAndUpdate(
      { _id: materialId, stockQty: cur.stockQty },
      { $set: { stockQty: Math.max(0, roundQty(available - qty)) } },
      { returnDocument: "after" }
    );
  }
  if (!m) throw conflict("This material's stock was being updated at the same moment. Please try again.");
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
  qty = roundQty(qty);
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
