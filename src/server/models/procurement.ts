import { DELIVERY_LOCATIONS, MR_STATUS, PAYMENT_STATUS, PO_STATUS, STOCK_TXN_TYPES, values, WORK_ORDER_STATUS } from "@/lib/constants";
import { Schema } from "mongoose";
import { defineModel, LineItemSchema, makeSchema, ObjectId } from "./_base";

const BankSchema = new Schema(
  { accountName: String, accountNo: String, ifsc: String, bankName: String, upi: String },
  { _id: false }
);

/* --------------------------------- Vendor -------------------------------- */
const VendorSchema = makeSchema({
  vendorNo: { type: String, unique: true, sparse: true },
  name: { type: String, required: true, trim: true },
  contactPerson: String,
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  address: String,
  city: String,
  gstin: { type: String, trim: true, uppercase: true },
  categories: { type: [String], default: [] },
  paymentTerms: String,
  creditDays: Number,
  bank: BankSchema,
  rating: { type: Number, min: 0, max: 5 },
  isActive: { type: Boolean, default: true },
  notes: String,
  createdBy: { type: ObjectId, ref: "User" },
});
export const Vendor = defineModel("Vendor", VendorSchema);

/* ------------------------------- Contractor ------------------------------ */
/** One line of a contractor's rate card – the same person can charge differently per trade / work. */
const ContractorRateSchema = new Schema(
  {
    trade: { type: String, required: true },
    work: { type: String, trim: true }, // e.g. "Wall putty + 2 coats", "Kitchen carcass"
    rateType: String,
    rate: { type: Number, min: 0 },
    notes: String,
  },
  { _id: true }
);

const ContractorSchema = makeSchema({
  contractorNo: { type: String, unique: true, sparse: true },
  name: { type: String, required: true, trim: true },
  trade: { type: String, required: true, index: true },
  phone: { type: String, trim: true },
  alternatePhone: String,
  address: String,
  teamSize: Number,
  rateType: { type: String }, // main rate (kept in sync with the first line of the rate card)
  rate: Number,
  rates: { type: [ContractorRateSchema], default: [] },
  idProof: String,
  bank: BankSchema,
  rating: { type: Number, min: 0, max: 5 },
  isActive: { type: Boolean, default: true },
  notes: String,
  createdBy: { type: ObjectId, ref: "User" },
});
ContractorSchema.index({ "rates.trade": 1 });
export const Contractor = defineModel("Contractor", ContractorSchema);

/* ----------------------- Work order (contractor ↔ site) ------------------ */
const WorkOrderSchema = makeSchema({
  woNo: { type: String, unique: true, sparse: true },
  project: { type: ObjectId, ref: "Project", required: true, index: true },
  contractor: { type: ObjectId, ref: "Contractor", required: true, index: true },
  trade: { type: String },
  scope: String,
  items: { type: [LineItemSchema], default: [] },
  amount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  startDate: Date,
  endDate: Date,
  status: { type: String, enum: values(WORK_ORDER_STATUS), default: "selected", index: true },
  terms: String,
  notes: String,
  createdBy: { type: ObjectId, ref: "User" },
});
export const WorkOrder = defineModel("WorkOrder", WorkOrderSchema);

/* ----------------------------- Material master --------------------------- */
const MaterialSchema = makeSchema({
  code: { type: String, unique: true, sparse: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true, index: true },
  unit: { type: String, default: "nos" },
  brand: String,
  specification: String,
  hsn: String,
  gstRate: { type: Number, default: 18 },
  defaultRate: { type: Number, default: 0 },
  minStock: { type: Number, default: 0 },
  stockQty: { type: Number, default: 0 }, // factory / store stock
  avgCost: { type: Number, default: 0 },
  preferredVendor: { type: ObjectId, ref: "Vendor" },
  isActive: { type: Boolean, default: true },
  notes: String,
});
MaterialSchema.index({ name: 1 });
export const Material = defineModel("Material", MaterialSchema);

/* ------------------------------ Stock ledger ----------------------------- */
const StockTxnSchema = makeSchema({
  material: { type: ObjectId, ref: "Material", required: true, index: true },
  type: { type: String, enum: values(STOCK_TXN_TYPES), required: true, index: true },
  qty: { type: Number, required: true }, // + in, - out (signed for factory balance)
  rate: { type: Number, default: 0 },
  value: { type: Number, default: 0 },
  balanceAfter: Number,
  project: { type: ObjectId, ref: "Project", index: true },
  refType: String, // grn | issue | return | adjust
  refId: { type: ObjectId },
  refNo: String,
  date: { type: Date, default: Date.now, index: true },
  issuedTo: String,
  notes: String,
  createdBy: { type: ObjectId, ref: "User" },
});
export const StockTxn = defineModel("StockTxn", StockTxnSchema);

/* --------------------------- Material request ---------------------------- */
const MRItemSchema = new Schema(
  {
    material: { type: ObjectId, ref: "Material" },
    description: { type: String, required: true },
    category: String,
    qty: { type: Number, required: true, min: 0 },
    unit: { type: String, default: "nos" },
    issuedQty: { type: Number, default: 0 },
    orderedQty: { type: Number, default: 0 },
    notes: String,
  },
  { _id: true }
);

const MaterialRequestSchema = makeSchema({
  mrNo: { type: String, unique: true, sparse: true },
  project: { type: ObjectId, ref: "Project", required: true, index: true },
  trade: { type: String },
  requiredBy: Date,
  priority: { type: String, enum: ["normal", "urgent"], default: "normal" },
  items: { type: [MRItemSchema], default: [] },
  status: { type: String, enum: values(MR_STATUS), default: "pending", index: true },
  notes: String,
  rejectionReason: String,
  requestedBy: { type: ObjectId, ref: "User" },
  approvedBy: { type: ObjectId, ref: "User" },
  approvedAt: Date,
});
export const MaterialRequest = defineModel("MaterialRequest", MaterialRequestSchema);

/* ----------------------------- Purchase order ---------------------------- */
const PurchaseOrderSchema = makeSchema({
  poNo: { type: String, unique: true, sparse: true },
  vendor: { type: ObjectId, ref: "Vendor", required: true, index: true },
  project: { type: ObjectId, ref: "Project", index: true }, // empty ⇒ factory stock / independent
  materialRequest: { type: ObjectId, ref: "MaterialRequest" },
  deliverTo: { type: String, enum: values(DELIVERY_LOCATIONS), default: "site" },
  category: { type: String },
  date: { type: Date, default: Date.now },
  expectedDate: Date,
  items: { type: [LineItemSchema], default: [] },
  subtotal: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  freight: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  status: { type: String, enum: values(PO_STATUS), default: "draft", index: true },
  paymentStatus: { type: String, enum: values(PAYMENT_STATUS), default: "unpaid" },
  paidAmount: { type: Number, default: 0 },
  terms: String,
  notes: String,
  createdBy: { type: ObjectId, ref: "User" },
});
export const PurchaseOrder = defineModel("PurchaseOrder", PurchaseOrderSchema);

/* --------------------------- GRN (goods receipt) ------------------------- */
const GRNItemSchema = new Schema(
  {
    poItem: { type: ObjectId },
    material: { type: ObjectId, ref: "Material" },
    description: { type: String, required: true },
    unit: String,
    orderedQty: Number,
    receivedQty: { type: Number, required: true, min: 0 },
    rejectedQty: { type: Number, default: 0, min: 0 },
    rate: { type: Number, default: 0 },
    remarks: String,
  },
  { _id: true }
);

const GRNSchema = makeSchema({
  grnNo: { type: String, unique: true, sparse: true },
  purchaseOrder: { type: ObjectId, ref: "PurchaseOrder", index: true },
  vendor: { type: ObjectId, ref: "Vendor", index: true },
  project: { type: ObjectId, ref: "Project", index: true },
  location: { type: String, enum: values(DELIVERY_LOCATIONS), default: "site" },
  category: { type: String },
  receivedAt: { type: Date, default: Date.now },
  items: { type: [GRNItemSchema], default: [] },
  vendorInvoiceNo: String,
  vendorInvoiceAmount: Number,
  vehicleNo: String,
  photos: [{ type: ObjectId, ref: "File" }],
  notes: String,
  receivedBy: { type: ObjectId, ref: "User" },
});
export const GRN = defineModel("GRN", GRNSchema);
