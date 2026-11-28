/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from "mongoose";
import { z } from "zod";
import { ATTENDANCE_STATUS, RECURRENCE, TASK_PRIORITY, TASK_STATUS, values } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { crud } from "../crud";
import { api, assertId, badRequest, conflict, forbidden, notFound, parseBody, type Ctx } from "../http";
import { Attendance, Project, Task, User, serialize } from "../models";
import { assertProjectAccess, audit, nextNumber, notify } from "../services/core";
import { istStartOfDay } from "../services/numbering";
import { aliasId, zBool, zDate, zId, zLocation, zOptEnum, zOptOption, zRef, zRefs, zStr, zText } from "../validators";

const TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";
export const localDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

/* ---------------------------------- Tasks -------------------------------- */
const checklistItem = z.preprocess(aliasId, z.object({ _id: zId.optional(), text: zStr(300), done: zBool }));

const taskBase = {
  title: zStr(300),
  description: zText(10000),
  project: zRef,
  lead: zRef,
  category: zOptOption,
  assignedTo: zRef,
  contractor: zRef,
  startDate: zDate,
  dueDate: zDate,
  priority: zOptEnum(values(TASK_PRIORITY)),
  status: zOptEnum(values(TASK_STATUS)),
  checklist: z.array(checklistItem).max(100).optional(),
  files: zRefs,
  recurrence: zOptEnum(values(RECURRENCE)),
};
const taskCreate = z.object(taskBase);
const taskUpdate = z.object(taskBase).partial();

function taskScope({ user }: Ctx) {
  if (can(user.permissions, "tasks:all")) return {};
  const uid = new Types.ObjectId(user.id);
  return { $or: [{ assignedTo: uid }, { assignedBy: uid }] };
}

const taskPopulate = [
  { path: "assignedTo", select: "name role" },
  { path: "assignedBy", select: "name" },
  { path: "project", select: "name projectNo status" },
  { path: "contractor", select: "name trade" },
  { path: "lead", select: "name leadNo" },
];

function nextDue(d: Date | undefined, rec: string) {
  const base = d ? new Date(d) : new Date();
  base.setDate(base.getDate() + (rec === "weekly" ? 7 : 1));
  return base;
}

async function spawnNextOccurrence(task: any, userId: string) {
  if (!task.recurrence || task.recurrence === "none") return;
  if (task.project) {
    const p = await Project.findById(task.project).select("status stage").lean<any>();
    if (!p || p.status !== "active" || p.stage === "closed") return; // stop when site closes
  }
  const exists = await Task.exists({ recurrenceParent: task.recurrenceParent ?? task._id, status: { $nin: ["done", "cancelled"] } });
  if (exists) return;
  await Task.create({
    taskNo: await nextNumber("TSK"),
    title: task.title,
    description: task.description,
    project: task.project,
    category: task.category,
    assignedTo: task.assignedTo,
    contractor: task.contractor,
    assignedBy: task.assignedBy ?? userId,
    priority: task.priority,
    dueDate: nextDue(task.dueDate, task.recurrence),
    startDate: nextDue(task.startDate ?? task.dueDate, task.recurrence),
    checklist: (task.checklist ?? []).map((c: any) => ({ text: c.text })),
    recurrence: task.recurrence,
    recurrenceParent: task.recurrenceParent ?? task._id,
  });
}

export const tasks = crud({
  model: Task,
  resource: "tasks",
  entity: "Task",
  createSchema: taskCreate,
  updateSchema: taskUpdate,
  search: ["title", "description", "taskNo"],
  filters: { project: "id", assignedTo: "id", assignedBy: "id", status: "list", priority: "list", category: "list", contractor: "id", lead: "id" },
  dateField: "dueDate",
  sortable: ["dueDate", "createdAt", "priority", "status", "updatedAt"],
  defaultSort: "dueDate",
  populate: [...taskPopulate, { path: "comments.by", select: "name" }, { path: "files", select: "originalName mimeType size storageKey" }, { path: "checklist.doneBy", select: "name" }],
  listPopulate: taskPopulate,
  listSelect: "-comments",
  numbering: { field: "taskNo", prefix: "TSK" },
  ownerField: "assignedBy",
  scope: taskScope,
  label: (d) => d.title,
  beforeCreate: async (data, ctx) => {
    if (data.project) await assertProjectAccess(ctx.user, data.project);
    data.assignedTo ??= ctx.user.id;
    if (data.status === "done") data.completedAt = new Date();
    return data;
  },
  afterCreate: async (doc, ctx) => {
    await notify([doc.assignedTo], { title: "New task assigned", message: doc.title, link: `/tasks?open=${doc._id}`, type: "task" }, ctx.user.id);
  },
  beforeUpdate: (data, existing, ctx) => {
    const manager = can(ctx.user.permissions, "tasks:all") || String(existing.assignedBy) === ctx.user.id;
    if (!manager) {
      // assignee may only progress the task
      for (const k of Object.keys(data)) if (!["status", "checklist", "files"].includes(k)) delete data[k];
    }
    if (data.status && data.status !== existing.status) {
      if (data.status === "in_progress" && !existing.startedAt) data.startedAt = new Date();
      if (data.status === "done") data.completedAt = new Date();
      else data.completedAt = null;
    }
    if (data.checklist) {
      const prev = new Map(existing.checklist.map((c: any) => [String(c._id), c]));
      data.checklist = data.checklist.map((c: any) => {
        const old: any = c._id ? prev.get(String(c._id)) : null;
        if (c.done && !old?.done) return { ...c, doneBy: ctx.user.id, doneAt: new Date() };
        if (c.done && old?.done) return { ...c, doneBy: old.doneBy, doneAt: old.doneAt };
        return { ...c, doneBy: null, doneAt: null };
      });
    }
    return data;
  },
  afterUpdate: async (doc, before, ctx) => {
    if (doc.status === "done" && before.status !== "done") {
      await spawnNextOccurrence(doc, ctx.user.id);
      await notify([doc.assignedBy], { title: "Task completed", message: `${doc.title} – by ${ctx.user.name}`, link: `/tasks?open=${doc._id}`, type: "task" }, ctx.user.id);
    }
    if (doc.status === "blocked" && before.status !== "blocked") {
      await notify([doc.assignedBy], { title: "Task blocked", message: doc.title, link: `/tasks?open=${doc._id}`, type: "alert" }, ctx.user.id);
    }
    if (doc.assignedTo && String(doc.assignedTo) !== String(before.assignedTo ?? "")) {
      await notify([doc.assignedTo], { title: "Task assigned to you", message: doc.title, link: `/tasks?open=${doc._id}`, type: "task" }, ctx.user.id);
    }
  },
  beforeDelete: (doc, ctx) => {
    if (!can(ctx.user.permissions, "tasks:all") && String(doc.assignedBy) !== ctx.user.id) throw forbidden("Only the creator can delete this task");
  },
});

export const addTaskComment = api({ perm: "tasks:read" }, async ({ req, params, user }) => {
  const id = assertId(params.id);
  const body = await parseBody(req, z.object({ text: zStr(5000), files: zRefs }));
  const t = await Task.findOne({ _id: id, ...taskScope({ user } as Ctx) });
  if (!t) throw notFound("Task not found");
  t.comments.push({ by: user.id, text: body.text, files: body.files ?? [], at: new Date() });
  await t.save();
  const others = [t.assignedTo, t.assignedBy].filter((u) => u && String(u) !== user.id);
  await notify(others, { title: `Comment on: ${t.title}`, message: body.text.slice(0, 140), link: `/tasks?open=${t._id}`, type: "comment" }, user.id);
  const fresh = await Task.findById(id).populate([{ path: "comments.by", select: "name" }]).select("comments").lean<any>();
  return serialize(fresh.comments);
});

async function loadTaskComment(ctx: Ctx) {
  const id = assertId(ctx.params.id);
  const commentId = assertId(ctx.params.commentId, "comment");
  const t = await Task.findOne({ _id: id, ...taskScope(ctx) });
  if (!t) throw notFound("Task not found");
  const c = t.comments.id(commentId);
  if (!c) throw notFound("This comment could not be found. It may have been deleted – please refresh.");
  return { t, c, id };
}

const freshComments = async (id: string) =>
  serialize((await Task.findById(id).populate([{ path: "comments.by", select: "name" }]).select("comments").lean<any>())?.comments ?? []);

/** Fix a typo in your own comment. */
export const updateTaskComment = api({ perm: "tasks:read" }, async (ctx) => {
  const { text } = await parseBody(ctx.req, z.object({ text: zStr(5000) }));
  const { t, c, id } = await loadTaskComment(ctx);
  if (String(c.by) !== ctx.user.id) throw forbidden("You can only edit your own comments.");
  c.text = text;
  await t.save();
  return freshComments(id);
});

/** Authors can remove their own comments; managers (tasks:all) can remove any. */
export const deleteTaskComment = api({ perm: "tasks:read" }, async (ctx) => {
  const { t, c, id } = await loadTaskComment(ctx);
  if (String(c.by) !== ctx.user.id && !can(ctx.user.permissions, "tasks:all")) throw forbidden("You can only delete your own comments.");
  c.deleteOne();
  await t.save();
  return freshComments(id);
});

/** Distribute many tasks at once (daily allotment). */
export const bulkTasks = api({ perm: "tasks:write" }, async ({ req, user, ip }) => {
  const body = await parseBody(req, z.object({ tasks: z.array(taskCreate).min(1).max(100) }));
  const projects = [...new Set(body.tasks.map((t) => t.project).filter(Boolean))];
  for (const p of projects) await assertProjectAccess(user, p);
  const docs = [];
  for (const t of body.tasks) {
    docs.push({ ...t, taskNo: await nextNumber("TSK"), assignedBy: user.id, assignedTo: t.assignedTo ?? user.id });
  }
  const created = await Task.insertMany(docs);
  const byUser = new Map<string, number>();
  for (const c of created) byUser.set(String(c.assignedTo), (byUser.get(String(c.assignedTo)) ?? 0) + 1);
  for (const [uid, n] of byUser) {
    await notify([uid], { title: `${n} new task(s) assigned`, message: `Assigned by ${user.name}`, link: "/tasks", type: "task" }, user.id);
  }
  await audit(user, "bulk_create", "Task", null, `Allotted ${created.length} task(s)`, { ip });
  return { created: created.length };
});

/** Team workload: open / overdue / due today / done today per member. */
export const taskWorkload = api({ perm: "tasks:read" }, async ({ user }) => {
  // "today" is the India day, whatever timezone the server runs in
  const start = istStartOfDay();
  const end = istStartOfDay(new Date(), 1);
  const match = can(user.permissions, "tasks:all") ? { assignedTo: { $ne: null } } : { assignedTo: new Types.ObjectId(user.id) };
  const rows = await Task.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$assignedTo",
        open: { $sum: { $cond: [{ $in: ["$status", ["todo", "in_progress", "review", "blocked"]] }, 1, 0] } },
        blocked: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
        overdue: { $sum: { $cond: [{ $and: [{ $in: ["$status", ["todo", "in_progress", "review", "blocked"]] }, { $lt: ["$dueDate", start] }, { $ne: ["$dueDate", null] }] }, 1, 0] } },
        dueToday: { $sum: { $cond: [{ $and: [{ $in: ["$status", ["todo", "in_progress", "review", "blocked"]] }, { $gte: ["$dueDate", start] }, { $lt: ["$dueDate", end] }] }, 1, 0] } },
        doneToday: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "done"] }, { $gte: ["$completedAt", start] }] }, 1, 0] } },
      },
    },
  ]);
  const users = await User.find({ _id: { $in: rows.map((r: any) => r._id) } }).select("name role designation").lean<any[]>();
  const map = new Map(users.map((u) => [String(u._id), u]));
  return rows
    .map((r: any) => ({ user: { id: String(r._id), name: map.get(String(r._id))?.name ?? "—", role: map.get(String(r._id))?.role }, ...r, _id: undefined }))
    .sort((a: any, b: any) => b.open - a.open);
});

/* -------------------------------- Attendance ----------------------------- */
function attScope({ user }: Ctx) {
  return can(user.permissions, "attendance:all") ? {} : { user: new Types.ObjectId(user.id) };
}

export const attendance = crud({
  model: Attendance,
  resource: "attendance",
  entity: "Attendance",
  createSchema: z.object({
    user: zId,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(values(ATTENDANCE_STATUS)),
    project: zRef,
    notes: zText(500),
  }),
  updateSchema: z.object({ status: zOptEnum(values(ATTENDANCE_STATUS)), notes: zText(500), checkIn: zDate, checkOut: zDate, project: zRef }),
  filters: { user: "id", date: "string", status: "list", project: "id" },
  sortable: ["date", "createdAt"],
  defaultSort: "-date",
  populate: [
    { path: "user", select: "name role" },
    { path: "project", select: "name projectNo" },
  ],
  ownerField: "markedBy",
  scope: attScope,
  label: (d) => d.date,
  beforeCreate: async (data, ctx) => {
    if (!can(ctx.user.permissions, "attendance:all")) throw forbidden("Only managers can mark attendance for others");
    if (await Attendance.exists({ user: data.user, date: data.date })) throw conflict("Attendance already marked for this day");
    return data;
  },
  beforeUpdate: (data, _e, ctx) => {
    if (!can(ctx.user.permissions, "attendance:all")) throw forbidden();
    return data;
  },
});

const geo = z.object({ location: zLocation, project: zRef, notes: zText(500) });

export const checkIn = api({ perm: "attendance:write" }, async ({ req, user }) => {
  const body = await parseBody(req, geo);
  const date = localDate();
  const existing = await Attendance.findOne({ user: user.id, date });
  if (existing?.checkIn) throw badRequest("Already checked in today");
  const doc = existing ?? new Attendance({ user: user.id, date });
  doc.set({ status: "present", checkIn: new Date(), checkInLocation: body.location ?? undefined, project: body.project ?? undefined, notes: body.notes, markedBy: user.id });
  await doc.save();
  return serialize(doc.toJSON());
});

export const checkOut = api({ perm: "attendance:write" }, async ({ req, user }) => {
  const body = await parseBody(req, geo);
  const doc = await Attendance.findOne({ user: user.id, date: localDate() });
  if (!doc?.checkIn) throw badRequest("You have not checked in today");
  if (doc.checkOut) throw badRequest("Already checked out today");
  doc.checkOut = new Date();
  if (body.location) doc.checkOutLocation = body.location;
  if (body.notes) doc.notes = [doc.notes, body.notes].filter(Boolean).join(" | ");
  const hours = (doc.checkOut.getTime() - doc.checkIn.getTime()) / 36e5;
  if (hours < 4) doc.status = "half_day";
  await doc.save();
  return serialize(doc.toJSON());
});

export const myAttendanceToday = api({ perm: "attendance:read" }, async ({ user }) => {
  const doc = await Attendance.findOne({ user: user.id, date: localDate() }).lean();
  return doc ? serialize(doc) : null;
});
