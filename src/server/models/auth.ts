import { Schema } from "mongoose";
import { DEPARTMENTS, ROLES, values } from "@/lib/constants";
import { defineModel, makeSchema, ObjectId } from "./_base";

/* ---------------------------------- User --------------------------------- */
const UserSchema = makeSchema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: values(ROLES), default: "staff", index: true },
  designation: { type: String, trim: true },
  department: { type: String, enum: values(DEPARTMENTS) },
  extraPermissions: { type: [String], default: [] },
  avatar: { type: ObjectId, ref: "File" },
  isActive: { type: Boolean, default: true, index: true },
  mustChangePassword: { type: Boolean, default: false },
  lastLoginAt: Date,
  failedLogins: { type: Number, default: 0, select: false },
  lockUntil: { type: Date, select: false },
  tokenVersion: { type: Number, default: 0 },
  joiningDate: Date,
  address: String,
  emergencyContact: String,
  notes: String,
});
export const User = defineModel("User", UserSchema);

/* ------------------------- Session (refresh tokens) ---------------------- */
const SessionSchema = makeSchema({
  user: { type: ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  family: { type: String, required: true, index: true }, // rotation family – reuse ⇒ revoke all
  client: { type: String, enum: ["web", "mobile"], default: "web" },
  deviceName: String,
  userAgent: String,
  ip: String,
  lastUsedAt: Date,
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  revokedReason: String,
});
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Session = defineModel("Session", SessionSchema);

/* --------------------------- Counter (doc numbers) ----------------------- */
const CounterSchema = new Schema({ _id: { type: String }, seq: { type: Number, default: 0 } }, { versionKey: false });
export const Counter = defineModel("Counter", CounterSchema);

/* ------------------------------- Rate limit ------------------------------ */
const RateLimitSchema = new Schema(
  { _id: String, count: { type: Number, default: 0 }, expiresAt: { type: Date, required: true } },
  { versionKey: false }
);
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RateLimit = defineModel("RateLimit", RateLimitSchema);
