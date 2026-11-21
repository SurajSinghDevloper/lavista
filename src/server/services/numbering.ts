import { Counter } from "../models/auth";

/** Indian financial year, e.g. "2026-27" (April → March). */
export function financialYear(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

/** LD-0001, PRJ-0001 … or INV/2026-27/0001 when `fy` is set (resets every April). Atomic. */
export async function nextNumber(prefix: string, opts: { fy?: boolean; pad?: number } = {}) {
  const fy = opts.fy ? financialYear() : null;
  const key = fy ? `${prefix}:${fy}` : prefix;
  const c = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" }).lean<{
    seq: number;
  }>();
  const n = String(c!.seq).padStart(opts.pad ?? 4, "0");
  return fy ? `${prefix}/${fy}/${n}` : `${prefix}-${n}`;
}
