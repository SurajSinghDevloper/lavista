/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from "mongoose";
import { can } from "@/lib/permissions";
import { api } from "../http";
import {
  Attendance,
  AuditLog,
  Expense,
  FollowUp,
  Lead,
  Material,
  MaterialRequest,
  Payment,
  Project,
  PurchaseOrder,
  SiteVisit,
  Task,
  serialize,
} from "../models";
import { accessibleProjectIds, projectFilter, round2 } from "../services/core";
import { materialFromStockByProject } from "../services/money";
import { IST_TZ, istParts, istStartOfDay, istStartOfMonth, parseIstDate } from "../services/numbering";

// All day / month boundaries below are India time (see services/numbering), never the server TZ.
const DAY_MS = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS); // IST has no DST
const sum = async (model: any, match: any) => {
  const [r] = await model.aggregate([{ $match: match }, { $group: { _id: null, t: { $sum: "$amount" } } }]);
  return round2(r?.t ?? 0);
};

/** Received (client payments) vs spent (expenses) per India month, for dates in [from, to). At most 60 months (the latest). */
async function cashflowByMonth(from: Date, to: Date, projectIds: Types.ObjectId[] | null) {
  const pm = projectIds ? { project: { $in: projectIds } } : {};
  const agg = (model: any) =>
    model.aggregate([
      { $match: { date: { $gte: from, $lt: to }, ...pm } },
      { $group: { _id: { $dateToString: { date: "$date", format: "%Y-%m", timezone: IST_TZ } }, t: { $sum: "$amount" } } },
    ]);
  const [inn, out] = await Promise.all([agg(Payment), agg(Expense)]);
  const I = new Map(inn.map((r: any) => [r._id, r.t]));
  const O = new Map(out.map((r: any) => [r._id, r.t]));
  const first = istParts(from);
  const last = istParts(new Date(to.getTime() - 1));
  const months = (last.year - first.year) * 12 + (last.month - first.month) + 1;
  const res = [];
  for (let i = Math.max(0, months - 60); i < months; i++) {
    const d = new Date(Date.UTC(first.year, first.month + i, 1));
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    res.push({ month: k, received: round2(Number(I.get(k) ?? 0)), spent: round2(Number(O.get(k) ?? 0)) });
  }
  return res;
}

export const dashboard = api({ perm: "dashboard:read" }, async ({ user }) => {
  const P = user.permissions;
  const uid = new Types.ObjectId(user.id);
  const now = new Date();
  const today = istStartOfDay(now); // 00:00 IST today
  const tomorrow = addDays(today, 1);
  const monthStart = istStartOfMonth(now); // 00:00 IST on the 1st
  const out: Record<string, any> = {};

  // ---- my work (everyone)
  const myOpen = { assignedTo: uid, status: { $in: ["todo", "in_progress", "review", "blocked"] } };
  const [myTasks, myOverdue, myDueToday] = await Promise.all([
    Task.find(myOpen).sort({ dueDate: 1 }).limit(8).populate({ path: "project", select: "name projectNo" }).select("title dueDate priority status project taskNo").lean(),
    Task.countDocuments({ ...myOpen, dueDate: { $lt: today } }),
    Task.countDocuments({ ...myOpen, dueDate: { $gte: today, $lt: tomorrow } }),
  ]);
  out.myWork = { tasks: serialize(myTasks), overdue: myOverdue, dueToday: myDueToday };

  // ---- sales pipeline
  if (can(P, "leads:read")) {
    const scope = can(P, "leads:all") ? {} : { $or: [{ assignedTo: uid }, { createdBy: uid }] };
    const [byStatus, newThisMonth, wonThisMonth, followups, visits] = await Promise.all([
      Lead.aggregate([{ $match: scope }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
      Lead.countDocuments({ ...scope, createdAt: { $gte: monthStart } }),
      Lead.countDocuments({ ...scope, status: "won", convertedAt: { $gte: monthStart } }),
      FollowUp.find({ status: "pending", scheduledAt: { $lt: tomorrow }, ...(can(P, "followups:all") ? {} : { assignedTo: uid }) })
        .sort("scheduledAt")
        .limit(10)
        .populate([{ path: "lead", select: "name phone leadNo" }, { path: "assignedTo", select: "name" }])
        .lean(),
      SiteVisit.find({ status: "scheduled", scheduledAt: { $gte: today, $lt: addDays(today, 7) } })
        .sort("scheduledAt")
        .limit(8)
        .populate([{ path: "lead", select: "name phone" }, { path: "project", select: "name projectNo" }, { path: "visitedBy", select: "name" }])
        .lean(),
    ]);
    const counts = Object.fromEntries(byStatus.map((s: any) => [s._id, s.n]));
    const won = counts.won ?? 0;
    const lost = counts.lost ?? 0;
    out.sales = {
      byStatus: counts,
      open: Object.entries(counts).filter(([k]) => !["won", "lost"].includes(k)).reduce((a, [, v]) => a + (v as number), 0),
      newThisMonth,
      wonThisMonth,
      conversionRate: won + lost ? Math.round((won / (won + lost)) * 100) : 0,
      followups: serialize(followups),
      siteVisits: serialize(visits),
    };
  }

  // ---- sites
  if (can(P, "projects:read")) {
    const pf = projectFilter(user);
    const [byStage, active] = await Promise.all([
      Project.aggregate([{ $match: { ...pf, status: "active" } }, { $group: { _id: "$stage", n: { $sum: 1 } } }]),
      Project.find({ ...pf, status: "active" })
        .sort("-updatedAt")
        .limit(12)
        .select("name projectNo stage progress expectedEndDate contractValue city")
        .populate({ path: "supervisor", select: "name" })
        .lean(),
    ]);
    out.sites = {
      active: byStage.reduce((a: number, s: any) => a + s.n, 0),
      byStage: Object.fromEntries(byStage.map((s: any) => [s._id, s.n])),
      list: serialize(active),
      delayed: active.filter((p: any) => p.expectedEndDate && new Date(p.expectedEndDate) < today).length,
    };
  }

  // ---- team tasks
  if (can(P, "tasks:all")) {
    const open = { status: { $in: ["todo", "in_progress", "review", "blocked"] } };
    const [openAll, overdueAll, doneToday, blocked] = await Promise.all([
      Task.countDocuments(open),
      Task.countDocuments({ ...open, dueDate: { $lt: today } }),
      Task.countDocuments({ status: "done", completedAt: { $gte: today } }),
      Task.countDocuments({ status: "blocked" }),
    ]);
    out.team = { open: openAll, overdue: overdueAll, doneToday, blocked };
  }

  // ---- money
  if (can(P, "accounts:read")) {
    const ids = await accessibleProjectIds(user);
    const pm = ids ? { project: { $in: ids } } : {};
    const live = await Project.find({ ...(ids ? { _id: { $in: ids } } : {}), status: { $ne: "cancelled" } })
      .select("name projectNo contractValue paymentSchedule client")
      .populate({ path: "client", select: "name phone" })
      .lean<any[]>();
    const [recMonth, spentMonth, recBySite, poDue] = await Promise.all([
      sum(Payment, { ...pm, date: { $gte: monthStart } }),
      sum(Expense, { date: { $gte: monthStart } }),
      Payment.aggregate([{ $match: { project: { $in: live.map((p) => p._id) } } }, { $group: { _id: "$project", t: { $sum: "$amount" } } }]),
      // per PO, never let one over-paid PO hide another PO's dues
      PurchaseOrder.aggregate([
        { $match: { status: { $nin: ["cancelled", "draft"] } } },
        { $group: { _id: null, t: { $sum: { $max: [0, { $subtract: [{ $ifNull: ["$total", 0] }, { $ifNull: ["$paidAmount", 0] }] }] } } } },
      ]),
    ]);
    const rec = new Map(recBySite.map((r: any) => [String(r._id), r.t]));
    // per site, never let one over-paid site hide another site's dues
    const receivables = live.reduce((a, p) => a + Math.max(0, (p.contractValue ?? 0) - Number(rec.get(String(p._id)) ?? 0)), 0);
    // amount = what is still to collect on the milestone (a part payment is already taken off)
    const dueMilestones = live
      .flatMap((p) =>
        (p.paymentSchedule ?? [])
          .map((m: any) => ({ m, left: round2((m.amount ?? 0) - (m.paidAmount ?? 0)) }))
          .filter(({ m, left }: any) => m.status === "due" && left > 0)
          .map(({ m, left }: any) => ({
            projectId: String(p._id),
            projectNo: p.projectNo,
            project: p.name,
            client: p.client?.name,
            phone: p.client?.phone,
            milestone: m.name,
            amount: left,
            milestoneAmount: m.amount ?? 0,
            paidAmount: round2(m.paidAmount ?? 0),
            dueDate: m.dueDate ?? null,
          }))
      )
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
    out.money = {
      receivedThisMonth: recMonth,
      spentThisMonth: spentMonth,
      receivables: round2(receivables),
      vendorPayables: round2(poDue[0]?.t ?? 0),
      dueMilestones,
      cashflow: await cashflowByMonth(istStartOfMonth(now, -5), istStartOfMonth(now, 1), ids), // last 6 India months
    };
  }

  // ---- store / procurement
  if (can(P, "material_requests:read") || can(P, "inventory:read")) {
    const [pendingMR, openPO, lowStock] = await Promise.all([
      MaterialRequest.countDocuments({ status: { $in: ["pending", "approved"] } }),
      PurchaseOrder.countDocuments({ status: { $in: ["ordered", "partially_received"] } }),
      Material.find({ isActive: true, minStock: { $gt: 0 }, $expr: { $lte: ["$stockQty", "$minStock"] } }).limit(10).select("name stockQty minStock unit").lean(),
    ]);
    out.store = { pendingMaterialRequests: pendingMR, openPurchaseOrders: openPO, lowStock: serialize(lowStock) };
  }

  if (can(P, "attendance:all")) {
    const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata" }).format(new Date());
    out.attendance = { presentToday: await Attendance.countDocuments({ date: dateStr, status: { $in: ["present", "half_day"] } }) };
  }

  if (P.includes("*")) {
    out.activity = serialize(await AuditLog.find({ action: { $ne: "login" } }).sort("-createdAt").limit(12).lean());
  }
  return out;
});

/* --------------------------------- Reports ------------------------------- */
export const reports = api({ perm: "reports:read" }, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const now = new Date();
  // "YYYY-MM-DD" = that India day; `to` is inclusive, so query up to 00:00 IST of the next day
  const fromQ = parseIstDate(sp.get("from"));
  const toQ = parseIstDate(sp.get("to"));
  const hasRange = Boolean(fromQ || toQ); // no range → sites are lifetime figures, cash flow the last 12 months
  const from = fromQ ?? istStartOfMonth(now, -11);
  const to = toQ ? addDays(toQ, 1) : addDays(istStartOfDay(now), 1);
  const range = { $gte: from, $lt: to };
  const ids = await accessibleProjectIds(user);
  const pm = ids ? { project: { $in: ids } } : {};

  const [leadSources, leadMonthly, lostReasons, expenseByCat, receiptsByMode, taskByUser, sites] = await Promise.all([
    Lead.aggregate([
      { $match: { createdAt: range } },
      { $group: { _id: "$source", total: { $sum: 1 }, won: { $sum: { $cond: [{ $eq: ["$status", "won"] }, 1, 0] } }, lost: { $sum: { $cond: [{ $eq: ["$status", "lost"] }, 1, 0] } } } },
      { $sort: { total: -1 } },
    ]),
    Lead.aggregate([
      { $match: { createdAt: range } },
      { $group: { _id: { $dateToString: { date: "$createdAt", format: "%Y-%m", timezone: IST_TZ } }, total: { $sum: 1 }, won: { $sum: { $cond: [{ $eq: ["$status", "won"] }, 1, 0] } } } },
      { $sort: { _id: 1 } },
    ]),
    Lead.aggregate([{ $match: { createdAt: range, status: "lost", lostReason: { $nin: [null, ""] } } }, { $group: { _id: "$lostReason", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }]),
    Expense.aggregate([{ $match: { date: range, ...pm } }, { $group: { _id: "$category", t: { $sum: "$amount" } } }, { $sort: { t: -1 } }]),
    Payment.aggregate([{ $match: { date: range, ...pm } }, { $group: { _id: "$mode", t: { $sum: "$amount" }, n: { $sum: 1 } } }, { $sort: { t: -1 } }]),
    Task.aggregate([
      { $match: { createdAt: range, assignedTo: { $ne: null } } },
      {
        $group: {
          _id: "$assignedTo",
          total: { $sum: 1 },
          done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
          // late = finished on a later India calendar day than the due day (due day itself is on time)
          late: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "done"] },
                    { $eq: [{ $type: "$dueDate" }, "date"] },
                    { $eq: [{ $type: "$completedAt" }, "date"] },
                    {
                      $gt: [
                        { $dateToString: { date: "$completedAt", format: "%Y-%m-%d", timezone: IST_TZ } },
                        { $dateToString: { date: "$dueDate", format: "%Y-%m-%d", timezone: IST_TZ } },
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u" } },
      { $unwind: "$u" },
      { $project: { name: "$u.name", role: "$u.role", total: 1, done: 1, late: 1 } },
      { $sort: { done: -1 } },
    ]),
    (async () => {
      const projects = await Project.find(ids ? { _id: { $in: ids } } : {}).select("name projectNo stage status progress contractValue startDate expectedEndDate actualEndDate createdAt closedAt").lean<any[]>();
      const pids = projects.map((p) => p._id);
      // with a range: money received / spent / issued from stock within the period only
      const inRange = hasRange ? { date: range } : {};
      const g = (m: any) => m.aggregate([{ $match: { project: { $in: pids }, ...inRange } }, { $group: { _id: "$project", t: { $sum: "$amount" } } }]);
      const [r, e, stock] = await Promise.all([g(Payment), g(Expense), materialFromStockByProject(pids, hasRange ? range : undefined)]);
      const R = new Map(r.map((x: any) => [String(x._id), x.t]));
      const E = new Map(e.map((x: any) => [String(x._id), x.t]));
      const rows = projects.map((p) => {
        const received = round2(Number(R.get(String(p._id)) ?? 0));
        const spent = round2(Number(E.get(String(p._id)) ?? 0));
        const materialFromStock = stock.get(String(p._id)) ?? 0;
        const cost = round2(spent + materialFromStock);
        const margin = round2(received - cost);
        return { id: String(p._id), projectNo: p.projectNo, name: p.name, stage: p.stage, status: p.status, progress: p.progress, contractValue: p.contractValue, received, spent, materialFromStock, cost, margin, marginPct: received ? Math.round((margin / received) * 100) : 0, startDate: p.startDate, expectedEndDate: p.expectedEndDate, actualEndDate: p.actualEndDate };
      });
      if (!hasRange) return rows;
      // only sites that had money movement in the period, or were running during it
      return rows.filter((row, i) => {
        const p = projects[i];
        const running = p.status !== "cancelled" && (!p.createdAt || new Date(p.createdAt) < to) && (!p.closedAt || new Date(p.closedAt) >= from);
        return running || row.received !== 0 || row.spent !== 0 || row.materialFromStock !== 0;
      });
    })(),
  ]);

  return {
    range: { from, to: addDays(to, -1) },
    leads: {
      bySource: leadSources.map((s: any) => ({ source: s._id, total: s.total, won: s.won, lost: s.lost, rate: s.total ? Math.round((s.won / s.total) * 100) : 0 })),
      monthly: leadMonthly.map((m: any) => ({ month: m._id, total: m.total, won: m.won })),
      lostReasons: lostReasons.map((r: any) => ({ reason: r._id, count: r.n })),
    },
    finance: {
      expenseByCategory: expenseByCat.map((e: any) => ({ category: e._id, amount: round2(e.t) })),
      receiptsByMode: receiptsByMode.map((e: any) => ({ mode: e._id, amount: round2(e.t), count: e.n })),
      // chosen period, month by month (India months); default = last 12 months incl. this one
      cashflow: hasRange ? await cashflowByMonth(from, to, ids) : await cashflowByMonth(istStartOfMonth(now, -11), istStartOfMonth(now, 1), ids),
    },
    team: taskByUser.map((t: any) => ({ ...t, id: String(t._id), _id: undefined })),
    sites,
  };
});
