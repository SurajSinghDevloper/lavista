import {
  CHECKLIST_STATUS,
  DESIGN_STATUS,
  DESIGN_TYPES,
  MILESTONE_STATUS,
  PROJECT_STAGES,
  PROJECT_STATUS,
  QUOTE_STATUS,
  QUOTE_TYPES,
  values,
} from "@/lib/constants";
import { Schema } from "mongoose";
import { defineModel, LineItemSchema, LocationSchema, makeSchema, ObjectId } from "./_base";

/* ------------------------------ Project / Site --------------------------- */
const MilestoneSchema = new Schema(
  {
    name: { type: String, required: true },
    percent: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 }, // set by syncMilestones; still to collect = amount − paidAmount
    dueDate: Date,
    status: { type: String, enum: values(MILESTONE_STATUS), default: "upcoming" },
    notes: String,
  },
  { _id: true }
);

const StageHistorySchema = new Schema(
  {
    stage: String,
    at: { type: Date, default: Date.now },
    by: { type: ObjectId, ref: "User" },
    note: String,
  },
  { _id: false }
);

const ProjectSchema = makeSchema({
  projectNo: { type: String, unique: true, sparse: true },
  name: { type: String, required: true, trim: true },
  client: { type: ObjectId, ref: "Client", required: true, index: true },
  lead: { type: ObjectId, ref: "Lead" },
  siteAddress: String,
  city: String,
  location: LocationSchema,
  propertyType: { type: String },
  propertyConfig: { type: String },
  areaSqft: Number,
  scope: { type: [String], default: [] },
  description: String,
  stage: { type: String, enum: values(PROJECT_STAGES), default: "site_visit", index: true },
  stageHistory: { type: [StageHistorySchema], default: [] },
  status: { type: String, enum: values(PROJECT_STATUS), default: "active", index: true },
  startDate: Date,
  expectedEndDate: Date,
  actualEndDate: Date,
  contractValue: { type: Number, default: 0 }, // from approved working quotation
  budget: { type: Number, default: 0 }, // internal cost budget
  progress: { type: Number, default: 0, min: 0, max: 100 },
  manager: { type: ObjectId, ref: "User", index: true },
  designer: { type: ObjectId, ref: "User", index: true },
  supervisor: { type: ObjectId, ref: "User", index: true },
  members: [{ type: ObjectId, ref: "User", index: true }],
  paymentSchedule: { type: [MilestoneSchema], default: [] },
  coverImage: { type: ObjectId, ref: "File" },
  tags: { type: [String], default: [] },
  closedAt: Date,
  createdBy: { type: ObjectId, ref: "User" },
});
export const Project = defineModel("Project", ProjectSchema);

/* ----------------------- Design (2D / 3D / renders) ---------------------- */
const DesignSchema = makeSchema({
  project: { type: ObjectId, ref: "Project", required: true, index: true },
  type: { type: String, enum: values(DESIGN_TYPES), required: true, index: true },
  room: { type: String, default: "full_home" },
  title: { type: String, required: true, trim: true },
  version: { type: Number, default: 1 },
  tool: { type: String },
  status: { type: String, enum: values(DESIGN_STATUS), default: "draft", index: true },
  isFinal: { type: Boolean, default: false },
  files: [{ type: ObjectId, ref: "File" }],
  externalLink: String, // e.g. Enscape panorama / Google Drive link
  description: String,
  clientFeedback: String,
  internalNotes: String,
  sharedAt: Date,
  approvedAt: Date,
  approvedBy: { type: ObjectId, ref: "User" },
  createdBy: { type: ObjectId, ref: "User" },
});
DesignSchema.index({ project: 1, type: 1, room: 1, version: -1 });
export const Design = defineModel("Design", DesignSchema);

/* -------------------------------- Quotation ------------------------------ */
const QuotationSchema = makeSchema({
  quoteNo: { type: String, index: true },
  root: { type: ObjectId, ref: "Quotation", index: true }, // first version id; groups revisions
  version: { type: Number, default: 1 },
  type: { type: String, enum: values(QUOTE_TYPES), default: "working" },
  title: { type: String, required: true, trim: true },
  project: { type: ObjectId, ref: "Project", index: true },
  lead: { type: ObjectId, ref: "Lead", index: true },
  client: { type: ObjectId, ref: "Client", index: true },
  customerName: String, // for lead quotations before a client exists
  customerPhone: String,
  customerAddress: String,
  date: { type: Date, default: Date.now },
  validUntil: Date,
  items: { type: [LineItemSchema], default: [] },
  subtotal: { type: Number, default: 0 },
  discountType: { type: String, enum: ["percent", "amount"], default: "amount" },
  discountValue: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  taxableAmount: { type: Number, default: 0 },
  taxRate: { type: Number, default: 18 },
  taxAmount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  status: { type: String, enum: values(QUOTE_STATUS), default: "draft", index: true },
  isFinal: { type: Boolean, default: false },
  terms: String,
  notes: String,
  clientFeedback: String,
  changeSummary: String, // what changed vs previous version
  sentAt: Date,
  approvedAt: Date,
  approvedBy: { type: ObjectId, ref: "User" },
  createdBy: { type: ObjectId, ref: "User" },
});
export const Quotation = defineModel("Quotation", QuotationSchema);

/* ------------------------- Checklist (QC / templates) -------------------- */
const ChecklistItemSchema = new Schema(
  {
    text: { type: String, required: true },
    checked: { type: Boolean, default: false },
    checkedBy: { type: ObjectId, ref: "User" },
    checkedAt: Date,
    remark: String,
    photo: { type: ObjectId, ref: "File" },
  },
  { _id: true }
);

const ChecklistSchema = makeSchema({
  name: { type: String, required: true, trim: true },
  isTemplate: { type: Boolean, default: false, index: true },
  trade: String,
  stage: String,
  project: { type: ObjectId, ref: "Project", index: true },
  template: { type: ObjectId, ref: "Checklist" },
  items: { type: [ChecklistItemSchema], default: [] },
  status: { type: String, enum: values(CHECKLIST_STATUS), default: "open" },
  assignedTo: { type: ObjectId, ref: "User" },
  completedAt: Date,
  createdBy: { type: ObjectId, ref: "User" },
});
export const Checklist = defineModel("Checklist", ChecklistSchema);

/* ----------------------- Daily site report (supervisor) ------------------ */
const DailyReportSchema = makeSchema({
  project: { type: ObjectId, ref: "Project", required: true, index: true },
  date: { type: Date, required: true, index: true },
  workDone: { type: String, required: true },
  manpower: {
    type: [
      new Schema(
        { trade: String, contractor: { type: ObjectId, ref: "Contractor" }, count: Number },
        { _id: false }
      ),
    ],
    default: [],
  },
  materialsUsed: String,
  issues: String,
  nextDayPlan: String,
  progress: { type: Number, min: 0, max: 100 },
  photos: [{ type: ObjectId, ref: "File" }],
  reportedBy: { type: ObjectId, ref: "User" },
});
DailyReportSchema.index({ project: 1, date: -1 });
export const DailyReport = defineModel("DailyReport", DailyReportSchema);
