import { Counter } from "../models/auth";

/* ----------------------------- India-time calendar ----------------------------- */
// India has no daylight saving: IST is always UTC+05:30. These helpers never use the process TZ,
// so day / month / financial-year boundaries stay right even if the container's TZ is not set.
// Dates typed in date inputs ("YYYY-MM-DD") are stored as 00:00 UTC = 05:30 IST of the same day.
export const IST_OFFSET_MS = 330 * 60_000;
/** Timezone argument for MongoDB date operators ($month, $dateToString …). */
export const IST_TZ = "+05:30";
const DAY_MS = 86_400_000;

/** Calendar date of an instant as seen in India (month is 0-based, like Date#getMonth). */
export function istParts(d: Date = new Date()) {
  const x = new Date(d.getTime() + IST_OFFSET_MS);
  return { year: x.getUTCFullYear(), month: x.getUTCMonth(), day: x.getUTCDate() };
}

/** 00:00 IST of an India calendar date (month 0-based; overflowing month/day roll over like Date.UTC). */
export function istMidnight(year: number, month: number, day = 1) {
  return new Date(Date.UTC(year, month, day) - IST_OFFSET_MS);
}

/** 00:00 IST of the India day containing `d`, optionally moved by whole days. */
export function istStartOfDay(d: Date = new Date(), addDays = 0) {
  const p = istParts(d);
  return istMidnight(p.year, p.month, p.day + addDays);
}

/** 00:00 IST on the 1st of the India month containing `d`, optionally moved by whole months. */
export function istStartOfMonth(d: Date = new Date(), addMonths = 0) {
  const p = istParts(d);
  return istMidnight(p.year, p.month + addMonths, 1);
}

/**
 * Parse a query / form date. A date-only "YYYY-MM-DD" means that India day: 00:00 IST, or
 * 23:59:59.999 IST with `endOfDay`. Any other string Date can parse is taken as an exact instant.
 * Returns null when empty or invalid.
 */
export function parseIstDate(s: string | null | undefined, endOfDay = false): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (m) {
    const start = istMidnight(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return endOfDay ? new Date(start.getTime() + DAY_MS - 1) : start;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

/* ----------------------------------- Numbering --------------------------------- */
/** Indian financial year of a date in IST, e.g. "2026-27" (April → March). */
export function financialYear(d: Date = new Date()) {
  const { year, month } = istParts(d);
  const y = month >= 3 ? year : year - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

/**
 * LD-0001, PRJ-0001 … or INV/2026-27/0001 when `fy` is set (resets every April). Atomic.
 * `date` = the document date, so a bill dated 31 March gets last year's series even if it is
 * entered on 2 April (defaults to now).
 */
export async function nextNumber(prefix: string, opts: { fy?: boolean; pad?: number; date?: Date | string | null } = {}) {
  let when = opts.date != null && opts.date !== "" ? new Date(opts.date) : new Date();
  if (Number.isNaN(when.getTime())) when = new Date();
  const fy = opts.fy ? financialYear(when) : null;
  const key = fy ? `${prefix}:${fy}` : prefix;
  const c = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" }).lean<{
    seq: number;
  }>();
  const n = String(c!.seq).padStart(opts.pad ?? 4, "0");
  return fy ? `${prefix}/${fy}/${n}` : `${prefix}-${n}`;
}
