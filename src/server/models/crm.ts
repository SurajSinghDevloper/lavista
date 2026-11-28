import { FOLLOWUP_STATUS, LEAD_PRIORITY, LEAD_STATUS, SITE_VISIT_STATUS, values } from "@/lib/constants";
import { Schema } from "mongoose";
import { defineModel, LocationSchema, makeSchema, ObjectId } from "./_base";

/* ---------------------------------- Lead --------------------------------- */
const LeadSchema = makeSchema({
  leadNo: { type: String, unique: true, sparse: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true, index: true },
  alternatePhone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  address: String,
  city: { type: String, trim: true },
  location: LocationSchema,
  propertyType: { type: String },
  propertyConfig: { type: String },
  areaSqft: Number,
  scope: { type: [String], default: [] },
  budget: Number,
  expectedStart: Date,
  source: { type: String, default: "other", index: true },
  sourceDetails: String,
  referredBy: String,
  externalId: { type: String, index: true }, // e.g. Meta leadgen_id
  status: { type: String, enum: values(LEAD_STATUS), default: "new", index: true },
  priority: { type: String, enum: values(LEAD_PRIORITY), default: "warm" },
  assignedTo: { type: ObjectId, ref: "User", index: true },
  nextFollowUpAt: { type: Date, index: true },
  lastContactedAt: Date,
  lostReason: String,
  notes: String,
  tags: { type: [String], default: [] },
  client: { type: ObjectId, ref: "Client" },
  project: { type: ObjectId, ref: "Project" },
  convertedAt: Date,
  createdBy: { type: ObjectId, ref: "User" },
});
LeadSchema.index({ name: "text", phone: "text", email: "text", city: "text" });
export const Lead = defineModel("Lead", LeadSchema);

/* -------------------------------- Follow up ------------------------------ */
const FollowUpSchema = makeSchema({
  lead: { type: ObjectId, ref: "Lead", index: true },
  project: { type: ObjectId, ref: "Project", index: true },
  type: { type: String, default: "call" },
  scheduledAt: { type: Date, required: true, index: true },
  status: { type: String, enum: values(FOLLOWUP_STATUS), default: "pending", index: true },
  purpose: String,
  outcome: String,
  completedAt: Date,
  assignedTo: { type: ObjectId, ref: "User", index: true },
  createdBy: { type: ObjectId, ref: "User" },
});
export const FollowUp = defineModel("FollowUp", FollowUpSchema);

/* -------------------------------- Site visit ----------------------------- */
const MeasurementSchema = new Schema(
  {
    room: String,
    item: String, // e.g. "Wall A", "Window", "Kitchen counter"
    length: Number,
    width: Number,
    height: Number,
    unit: { type: String, default: "ft" },
    notes: String,
  },
  { _id: true }
);

const SiteVisitSchema = makeSchema({
  lead: { type: ObjectId, ref: "Lead", index: true },
  project: { type: ObjectId, ref: "Project", index: true },
  scheduledAt: { type: Date, required: true, index: true },
  visitedAt: Date,
  status: { type: String, enum: values(SITE_VISIT_STATUS), default: "scheduled", index: true },
  visitedBy: [{ type: ObjectId, ref: "User" }],
  address: String,
  location: LocationSchema,
  measurements: { type: [MeasurementSchema], default: [] },
  requirements: String,
  notes: String,
  photos: [{ type: ObjectId, ref: "File" }],
  createdBy: { type: ObjectId, ref: "User" },
});
export const SiteVisit = defineModel("SiteVisit", SiteVisitSchema);

/* --------------------------------- Client -------------------------------- */
const ClientSchema = makeSchema({
  clientNo: { type: String, unique: true, sparse: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true, index: true },
  alternatePhone: String,
  email: { type: String, trim: true, lowercase: true },
  address: String,
  city: String,
  gstin: { type: String, trim: true, uppercase: true },
  pan: { type: String, trim: true, uppercase: true },
  lead: { type: ObjectId, ref: "Lead" },
  notes: String,
  createdBy: { type: ObjectId, ref: "User" },
});
ClientSchema.index({ name: "text", phone: "text", email: "text" });
export const Client = defineModel("Client", ClientSchema);
