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
import { monthlyCashflow } from "./finance";

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const sum = async (model: any, match: any) => {
  const [r] = await model.aggregate([{ $match: match }, { $group: { _id: null, t: { $sum: "$amount" } } }]);
  return round2(r?.t ?? 0);
};

export const dashboard = api({ perm: "dashboard:read" }, async ({ user }) => {
  const P = user.permissions;
  const uid = new Types.ObjectId(user.id);
  const today = startOfDay();
  const tomorrow = addDays(today, 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
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
    const [recMonth, spentMonth, recAll, contract, poDue] = await Promise.all([
      sum(Payment, { ...pm, date: { $gte: monthStart } }),
      sum(Expense, { date: { $gte: monthStart } }),
      sum(Payment, pm),
      Project.aggregate([{ $match: { ...(ids ? { _id: { $in: ids } } : {}), status: { $ne: "cancelled" } } }, { $group: { _id: null, t: { $sum: "$contractValue" } } }]),
      PurchaseOrder.aggregate([{ $match: { status: { $nin: ["cancelled", "draft"] } } }, { $group: { _id: null, t: { $sum: { $subtract: ["$total", "$paidAmount"] } } } }]),
    ]);
    out.money = {
      receivedThisMonth: recMonth,
      spentThisMonth: spentMonth,
      receivables: round2((contract[0]?.t ?? 0) - recAll),
      vendorPayables: round2(poDue[0]?.t ?? 0),
      cashflow: await monthlyCashflow(6, ids),
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
  const from = sp.get("from") ? new Date(sp.get("from")!) : new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1);
  const to = sp.get("to") ? addDays(new Date(sp.get("to")!), 1) : addDays(startOfDay(), 1);
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
      { $group: { _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } }, total: { $sum: 1 }, won: { $sum: { $cond: [{ $eq: ["$status", "won"] }, 1, 0] } } } },
      { $sort: { "_id.y": 1, "_id.m": 1 } },
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
          late: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "done"] }, { $gt: ["$completedAt", "$dueDate"] }, { $ne: ["$dueDate", null] }] }, 1, 0] } },
        },
      },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u" } },
      { $unwind: "$u" },
      { $project: { name: "$u.name", role: "$u.role", total: 1, done: 1, late: 1 } },
      { $sort: { done: -1 } },
    ]),
    (async () => {
      const projects = await Project.find(ids ? { _id: { $in: ids } } : {}).select("name projectNo stage status progress contractValue startDate expectedEndDate actualEndDate").lean<any[]>();
      const pids = projects.map((p) => p._id);
      const g = (m: any) => m.aggregate([{ $match: { project: { $in: pids } } }, { $group: { _id: "$project", t: { $sum: "$amount" } } }]);
      const [r, e] = await Promise.all([g(Payment), g(Expense)]);
      const R = new Map(r.map((x: any) => [String(x._id), x.t]));
      const E = new Map(e.map((x: any) => [String(x._id), x.t]));
      return projects.map((p) => {
        const received = round2(Number(R.get(String(p._id)) ?? 0));
        const spent = round2(Number(E.get(String(p._id)) ?? 0));
        return { id: String(p._id), projectNo: p.projectNo, name: p.name, stage: p.stage, status: p.status, progress: p.progress, contractValue: p.contractValue, received, spent, margin: round2(received - spent), marginPct: received ? Math.round(((received - spent) / received) * 100) : 0, startDate: p.startDate, expectedEndDate: p.expectedEndDate, actualEndDate: p.actualEndDate };
      });
    })(),
  ]);

  return {
    range: { from, to: addDays(to, -1) },
    leads: {
      bySource: leadSources.map((s: any) => ({ source: s._id, total: s.total, won: s.won, lost: s.lost, rate: s.total ? Math.round((s.won / s.total) * 100) : 0 })),
      monthly: leadMonthly.map((m: any) => ({ month: `${m._id.y}-${String(m._id.m).padStart(2, "0")}`, total: m.total, won: m.won })),
      lostReasons: lostReasons.map((r: any) => ({ reason: r._id, count: r.n })),
    },
    finance: {
      expenseByCategory: expenseByCat.map((e: any) => ({ category: e._id, amount: round2(e.t) })),
      receiptsByMode: receiptsByMode.map((e: any) => ({ mode: e._id, amount: round2(e.t), count: e.n })),
      cashflow: await monthlyCashflow(12, ids),
    },
    team: taskByUser.map((t: any) => ({ ...t, id: String(t._id), _id: undefined })),
    sites,
  };
});
