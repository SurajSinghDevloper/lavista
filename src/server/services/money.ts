/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared money calculations (models only – safe to import from any resource without cycles).
 *
 * Site-wise accounting used everywhere (accounts page, site summary, reports):
 *   A  received          = client payments for the site
 *   B  cost              = cash spent on the site (expenses tagged to it)
 *                        + material issued from factory stock at average cost (net of returns)
 *   C  balance           = A − B
 * Factory stock purchases are paid as expenses without a site; they are shown separately
 * ("factory stock purchases") and are NOT counted as office overheads, because their cost reaches
 * the sites when the material is issued.
 */
import { Types } from "mongoose";
import { Payment, Project, StockTxn } from "../models";
import { round2 } from "./core";

/** Expense categories that mean "material bought" (factory stock when no site is set). */
export const MATERIAL_EXPENSE_CATEGORIES = ["material", "vendor_payment"];

/** Net value of factory stock issued to each site (issues − returns), keyed by project id. */
export async function materialFromStockByProject(projectIds: Types.ObjectId[]) {
  const rows = await StockTxn.aggregate([
    { $match: { project: { $in: projectIds }, type: { $in: ["issue", "return"] } } },
    { $group: { _id: "$project", v: { $sum: "$value" } } },
  ]);
  // issue rows carry negative value, returns positive → negate to get a cost
  return new Map<string, number>(rows.map((r: any) => [String(r._id), round2(-r.v)]));
}

/**
 * Recalculate milestone statuses from total received.
 * Milestones are settled in order; a partial payment never skips ahead.
 */
export async function syncMilestones(projectId: unknown) {
  const p = await Project.findById(projectId);
  if (!p) return;
  const [r] = await Payment.aggregate([{ $match: { project: p._id } }, { $group: { _id: null, t: { $sum: "$amount" } } }]);
  let remaining = r?.t ?? 0;
  let prevPaid = true;
  const now = new Date();
  for (const m of p.paymentSchedule) {
    const amt = m.amount ?? 0;
    if (amt > 0 && remaining + 0.5 >= amt) {
      m.status = "paid";
      remaining -= amt;
    } else {
      m.status = prevPaid || (m.dueDate && m.dueDate < now) ? "due" : "upcoming";
      prevPaid = false;
      remaining = 0;
    }
  }
  await p.save();
}
