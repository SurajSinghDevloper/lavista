import { FILE_CATEGORIES, values } from "@/lib/constants";
import { Schema } from "mongoose";
import { defineModel, makeSchema, ObjectId } from "./_base";

/* ------------------------------ Uploaded file ---------------------------- */
const FileSchema = makeSchema({
  originalName: { type: String, required: true },
  storageKey: { type: String, required: true, unique: true }, // relative path inside storage driver
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  category: { type: String, enum: values(FILE_CATEGORIES), default: "other", index: true },
  caption: String,
  project: { type: ObjectId, ref: "Project", index: true },
  entityType: { type: String, index: true }, // e.g. "Design", "Task", "Lead"
  entityId: { type: ObjectId, index: true },
  uploadedBy: { type: ObjectId, ref: "User" },
});
export const FileModel = defineModel("File", FileSchema);

/* ------------------------------ Notification ----------------------------- */
const NotificationSchema = makeSchema({
  user: { type: ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true },
  message: String,
  link: String,
  type: { type: String, default: "info" },
  read: { type: Boolean, default: false, index: true },
});
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
export const Notification = defineModel("Notification", NotificationSchema);

/* ------------------------------- Activity log ---------------------------- */
const AuditLogSchema = makeSchema({
  user: { type: ObjectId, ref: "User", index: true },
  userName: String,
  action: { type: String, required: true }, // create | update | delete | login | status ...
  entityType: { type: String, required: true, index: true },
  entityId: { type: ObjectId, index: true },
  project: { type: ObjectId, ref: "Project", index: true },
  message: String,
  changes: Schema.Types.Mixed,
  ip: String,
});
export const AuditLog = defineModel("AuditLog", AuditLogSchema);

/* -------------------------------- Settings ------------------------------- */
const SettingSchema = new Schema(
  { _id: String, value: Schema.Types.Mixed, updatedBy: { type: ObjectId, ref: "User" } },
  { timestamps: true, versionKey: false }
);
export const Setting = defineModel("Setting", SettingSchema);
