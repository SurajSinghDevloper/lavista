import { EXPENSE_CATEGORIES, INVOICE_STATUS, INVOICE_TYPES, PAYMENT_MODES, RECEIPT_TYPES, values } from "@/lib/constants";
import { defineModel, LineItemSchema, makeSchema, ObjectId } from "./_base";

/* --------------------------- Client payment receipt ---------------------- */
const PaymentSchema = makeSchema({
  receiptNo: { type: String, unique: true, sparse: true },
  project: { type: ObjectId, ref: "Project", required: true, index: true },
  client: { type: ObjectId, ref: "Client", index: true },
  invoice: { type: ObjectId, ref: "Invoice", index: true },
  milestone: { type: ObjectId }, // project.paymentSchedule._id
  type: { type: String, enum: values(RECEIPT_TYPES), default: "advance" },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, default: Date.now, index: true },
  mode: { type: String, enum: values(PAYMENT_MODES), default: "bank_transfer" },
  reference: String,
  notes: String,
  files: [{ type: ObjectId, ref: "File" }],
  receivedBy: { type: ObjectId, ref: "User" },
});
export const Payment = defineModel("Payment", PaymentSchema);

/* ----------------------------- Invoice / Bill ---------------------------- */
const InvoiceSchema = makeSchema({
  invoiceNo: { type: String, unique: true, sparse: true },
  type: { type: String, enum: values(INVOICE_TYPES), default: "tax_invoice" },
  project: { type: ObjectId, ref: "Project", required: true, index: true },
  client: { type: ObjectId, ref: "Client", index: true },
  quotation: { type: ObjectId, ref: "Quotation" },
  date: { type: Date, default: Date.now },
  dueDate: Date,
  items: { type: [LineItemSchema], default: [] },
  subtotal: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  taxableAmount: { type: Number, default: 0 },
  interState: { type: Boolean, default: false }, // IGST vs CGST+SGST
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  amountPaid: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  status: { type: String, enum: values(INVOICE_STATUS), default: "draft", index: true },
  notes: String,
  terms: String,
  createdBy: { type: ObjectId, ref: "User" },
});
export const Invoice = defineModel("Invoice", InvoiceSchema);

/* --------------------------------- Expense ------------------------------- */
const ExpenseSchema = makeSchema({
  expenseNo: { type: String, unique: true, sparse: true },
  project: { type: ObjectId, ref: "Project", index: true }, // empty ⇒ office overhead
  category: { type: String, enum: values(EXPENSE_CATEGORIES), required: true, index: true },
  vendor: { type: ObjectId, ref: "Vendor", index: true },
  contractor: { type: ObjectId, ref: "Contractor", index: true },
  purchaseOrder: { type: ObjectId, ref: "PurchaseOrder" },
  workOrder: { type: ObjectId, ref: "WorkOrder" },
  payee: String,
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, default: Date.now, index: true },
  mode: { type: String, enum: values(PAYMENT_MODES), default: "cash" },
  reference: String,
  description: String,
  files: [{ type: ObjectId, ref: "File" }],
  paidBy: { type: ObjectId, ref: "User" },
});
export const Expense = defineModel("Expense", ExpenseSchema);
