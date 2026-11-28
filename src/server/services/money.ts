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

/**
 * Net value of factory stock issued to each site (issues − returns), keyed by project id.
 * `date` optionally limits it to stock movements in a period, e.g. { $gte: from, $lt: to }.
 */
export async function materialFromStockByProject(projectIds: Types.ObjectId[], date?: { $gte?: Date; $lt?: Date; $lte?: Date }) {
  const rows = await StockTxn.aggregate([
    { $match: { project: { $in: projectIds }, type: { $in: ["issue", "return"] }, ...(date ? { date } : {}) } },
    { $group: { _id: "$project", v: { $sum: "$value" } } },
  ]);
  // issue rows carry negative value, returns positive → negate to get a cost
  return new Map<string, number>(rows.map((r: any) => [String(r._id), round2(-r.v)]));
}

/**
 * Rupee amount of each milestone. Percent milestones get their share of the contract value
 * (rounded to the rupee); when the percents add up to 100 the last percent milestone takes the
 * rounding difference, so the amounts add up exactly to the rounded contract value.
 * Milestones without a percent keep their fixed amount.
 */
export function scheduleAmounts(schedule: { percent?: number | null; amount?: number | null }[], contractValue: number): number[] {
  const value = Math.round(Number(contractValue) || 0);
  const pct = (m: { percent?: number | null }) => Number(m.percent) || 0;
  const amounts = schedule.map((m) => (pct(m) > 0 ? Math.round((value * pct(m)) / 100) : Number(m.amount) || 0));
  const pctRows = schedule.flatMap((m, i) => (pct(m) > 0 ? [i] : []));
  const pctTotal = pctRows.reduce((s, i) => s + pct(schedule[i]), 0);
  if (pctRows.length && Math.abs(pctTotal - 100) < 0.001) {
    const last = pctRows[pctRows.length - 1];
    const others = pctRows.slice(0, -1).reduce((s, i) => s + amounts[i], 0);
    amounts[last] = Math.max(0, value - others);
  }
  return amounts;
}

/** A milestone counts as paid when what is left is at most this much short (rounding / paise). */
const MILESTONE_TOLERANCE = 1;

/**
 * Recalculate milestone amounts, statuses and `paidAmount` from total received.
 * Milestones are settled in order; a partial payment never skips ahead. ₹0 milestones are skipped
 * (they never block later ones): "paid" once everything before them is paid, else "upcoming".
 */
export async function syncMilestones(projectId: unknown) {
  const p = await Project.findById(projectId);
  if (!p) return;
  const [r] = await Payment.aggregate([{ $match: { project: p._id } }, { $group: { _id: null, t: { $sum: "$amount" } } }]);
  const received = round2(r?.t ?? 0);
  const amounts = scheduleAmounts(p.paymentSchedule, p.contractValue ?? 0);
  let remaining = received;
  let prevPaid = true;
  const now = new Date();
  p.paymentSchedule.forEach((m: any, i: number) => {
    const amt = amounts[i];
    m.amount = amt;
    if (amt <= 0) {
      m.status = prevPaid && received > 0 && (p.contractValue ?? 0) > 0 ? "paid" : "upcoming";
      m.paidAmount = 0;
    } else if (prevPaid && remaining + MILESTONE_TOLERANCE >= amt) {
      m.status = "paid";
      m.paidAmount = amt;
      remaining = round2(remaining - amt); // may go slightly negative: the next milestone must make it up
    } else {
      m.status = prevPaid || (m.dueDate && m.dueDate < now) ? "due" : "upcoming";
      m.paidAmount = round2(Math.min(amt, Math.max(0, remaining))); // part payment sits on the first unpaid one
      prevPaid = false;
      remaining = 0;
    }
  });
  await p.save();
}
