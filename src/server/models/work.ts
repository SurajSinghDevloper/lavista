import { ATTENDANCE_STATUS, RECURRENCE, TASK_CATEGORIES, TASK_PRIORITY, TASK_STATUS, values } from "@/lib/constants";
import { Schema } from "mongoose";
import { defineModel, LocationSchema, makeSchema, ObjectId } from "./_base";

/* ---------------------------------- Task --------------------------------- */
const TaskChecklistSchema = new Schema(
  {
    text: { type: String, required: true },
    done: { type: Boolean, default: false },
    doneBy: { type: ObjectId, ref: "User" },
    doneAt: Date,
  },
  { _id: true }
);

const TaskCommentSchema = new Schema(
  {
    by: { type: ObjectId, ref: "User" },
    text: String,
    files: [{ type: ObjectId, ref: "File" }],
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const TaskSchema = makeSchema({
  taskNo: { type: String, unique: true, sparse: true },
  title: { type: String, required: true, trim: true },
  description: String,
  project: { type: ObjectId, ref: "Project", index: true },
  lead: { type: ObjectId, ref: "Lead" },
  category: { type: String, enum: values(TASK_CATEGORIES), default: "site", index: true },
  assignedTo: { type: ObjectId, ref: "User", index: true },
  contractor: { type: ObjectId, ref: "Contractor" },
  assignedBy: { type: ObjectId, ref: "User", index: true },
  startDate: Date,
  dueDate: { type: Date, index: true },
  priority: { type: String, enum: values(TASK_PRIORITY), default: "medium" },
  status: { type: String, enum: values(TASK_STATUS), default: "todo", index: true },
  checklist: { type: [TaskChecklistSchema], default: [] },
  comments: { type: [TaskCommentSchema], default: [] },
  files: [{ type: ObjectId, ref: "File" }],
  recurrence: { type: String, enum: values(RECURRENCE), default: "none" },
  recurrenceParent: { type: ObjectId, ref: "Task" },
  startedAt: Date,
  completedAt: Date,
});
TaskSchema.index({ assignedTo: 1, status: 1, dueDate: 1 });
export const Task = defineModel("Task", TaskSchema);

/* ------------------------------- Attendance ------------------------------ */
const AttendanceSchema = makeSchema({
  user: { type: ObjectId, ref: "User", required: true, index: true },
  date: { type: String, required: true }, // YYYY-MM-DD (local)
  status: { type: String, enum: values(ATTENDANCE_STATUS), default: "present" },
  checkIn: Date,
  checkOut: Date,
  checkInLocation: LocationSchema,
  checkOutLocation: LocationSchema,
  project: { type: ObjectId, ref: "Project" }, // site where the person checked in
  notes: String,
  markedBy: { type: ObjectId, ref: "User" },
});
AttendanceSchema.index({ user: 1, date: 1 }, { unique: true });
export const Attendance = defineModel("Attendance", AttendanceSchema);
