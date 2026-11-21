"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Column } from "@/components/data-table";
import { Person, ProjectLink, REF } from "@/components/domain";
import type { Field } from "@/components/form";
import { Badge, StatusBadge } from "@/components/ui";
import {
  DEPARTMENTS,
  EXPENSE_CATEGORIES,
  FOLLOWUP_STATUS,
  FOLLOWUP_TYPES,
  LEAD_PRIORITY,
  LEAD_SOURCES,
  LEAD_STATUS,
  MATERIAL_CATEGORIES,
  PAYMENT_MODES,
  PROJECT_STAGES,
  PROJECT_STATUS,
  PROPERTY_CONFIGS,
  PROPERTY_TYPES,
  RATE_TYPES,
  RECEIPT_TYPES,
  ROLES,
  TRADES,
  UNITS,
  WORK_ORDER_STATUS,
  WORK_SCOPES,
  labelOf,
} from "@/lib/constants";
import { date, dateTime, isOverdue, money, number } from "@/lib/format";

/* ---------------------------------- Leads -------------------------------- */
export const leadFields: Field[] = [
  { name: "s1", label: "Contact", type: "section" },
  { name: "name", label: "Name", required: true },
  { name: "phone", label: "Phone", type: "tel", required: true },
  { name: "alternatePhone", label: "Alternate phone", type: "tel" },
  { name: "email", label: "Email", type: "email" },
  { name: "address", label: "Site address", type: "textarea", rows: 2 },
  { name: "city", label: "City / Area" },
  { name: "s2", label: "Requirement", type: "section" },
  { name: "propertyType", label: "Property type", type: "select", options: PROPERTY_TYPES },
  { name: "propertyConfig", label: "Configuration", type: "select", options: PROPERTY_CONFIGS },
  { name: "areaSqft", label: "Carpet area (sq.ft)", type: "number" },
  { name: "budget", label: "Budget", type: "money" },
  { name: "scope", label: "Scope of work", type: "multiselect", options: WORK_SCOPES },
  { name: "expectedStart", label: "Expected start", type: "date" },
  { name: "s3", label: "Pipeline", type: "section" },
  { name: "source", label: "Lead source", type: "select", options: LEAD_SOURCES },
  { name: "sourceDetails", label: "Source details / campaign" },
  { name: "referredBy", label: "Referred by" },
  { name: "status", label: "Status", type: "select", options: LEAD_STATUS },
  { name: "priority", label: "Priority", type: "select", options: LEAD_PRIORITY },
  { name: "assignedTo", label: "Assigned to", type: "ref", ref: REF.user },
  { name: "lostReason", label: "Lost reason", hidden: (v) => v.status !== "lost" },
  { name: "notes", label: "Notes", type: "textarea" },
];

/* --------------------------------- Clients ------------------------------- */
export const clientFields: Field[] = [
  { name: "name", label: "Name", required: true },
  { name: "phone", label: "Phone", type: "tel", required: true },
  { name: "alternatePhone", label: "Alternate phone", type: "tel" },
  { name: "email", label: "Email", type: "email" },
  { name: "address", label: "Address", type: "textarea", rows: 2 },
  { name: "city", label: "City" },
  { name: "gstin", label: "GSTIN" },
  { name: "pan", label: "PAN" },
  { name: "notes", label: "Notes", type: "textarea" },
];

/* --------------------------------- Projects ------------------------------ */
export const projectFields: Field[] = [
  { name: "name", label: "Site / project name", required: true, placeholder: "e.g. Sharma Residence – 3BHK" },
  { name: "client", label: "Client", type: "ref", ref: REF.client, required: true },
  { name: "siteAddress", label: "Site address", type: "textarea", rows: 2 },
  { name: "city", label: "City / Area" },
  { name: "propertyType", label: "Property type", type: "select", options: PROPERTY_TYPES },
  { name: "propertyConfig", label: "Configuration", type: "select", options: PROPERTY_CONFIGS },
  { name: "areaSqft", label: "Area (sq.ft)", type: "number" },
  { name: "scope", label: "Scope", type: "multiselect", options: WORK_SCOPES },
  { name: "s1", label: "Team", type: "section" },
  { name: "manager", label: "Project manager", type: "ref", ref: REF.user },
  { name: "designer", label: "Designer", type: "ref", ref: REF.user },
  { name: "supervisor", label: "Site supervisor", type: "ref", ref: REF.user },
  { name: "members", label: "Other team members", type: "refs", ref: REF.user },
  { name: "s2", label: "Schedule & value", type: "section" },
  { name: "startDate", label: "Start date", type: "date" },
  { name: "expectedEndDate", label: "Target handover", type: "date" },
  { name: "contractValue", label: "Contract value", type: "money", help: "Auto-updated when a working quotation is approved" },
  { name: "budget", label: "Internal cost budget", type: "money" },
  { name: "status", label: "Status", type: "select", options: PROJECT_STATUS },
  { name: "progress", label: "Progress %", type: "number", min: 0, max: 100 },
  { name: "description", label: "Notes", type: "textarea" },
];

export const projectColumns: Column[] = [
  { key: "name", label: "Site", render: (r) => <span><span className="block text-xs text-muted">{r.projectNo}</span><span className="font-medium">{r.name}</span></span> },
  { key: "client", label: "Client", render: (r) => r.client?.name },
  { key: "stage", label: "Stage", render: (r) => <StatusBadge options={PROJECT_STAGES} value={r.stage} /> },
  { key: "progress", label: "Progress", render: (r) => `${r.progress ?? 0}%`, align: "right" },
  { key: "supervisor", label: "Supervisor", render: (r) => <Person user={r.supervisor} />, hideOnMobile: true },
  { key: "contractValue", label: "Value", render: (r) => money(r.contractValue), align: "right" },
  { key: "status", label: "Status", render: (r) => <StatusBadge options={PROJECT_STATUS} value={r.status} /> },
];

/* --------------------------------- Vendors ------------------------------- */
export const vendorFields: Field[] = [
  { name: "name", label: "Shop / vendor name", required: true },
  { name: "contactPerson", label: "Contact person" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "email", label: "Email", type: "email" },
  { name: "address", label: "Address", type: "textarea", rows: 2 },
  { name: "city", label: "City" },
  { name: "gstin", label: "GSTIN" },
  { name: "categories", label: "Supplies", type: "multiselect", options: MATERIAL_CATEGORIES },
  { name: "paymentTerms", label: "Payment terms" },
  { name: "creditDays", label: "Credit days", type: "number" },
  { name: "rating", label: "Rating (0-5)", type: "number", min: 0, max: 5 },
  { name: "isActive", label: "Active", type: "checkbox", placeholder: "Active vendor" },
  { name: "notes", label: "Notes", type: "textarea" },
];
export const vendorColumns: Column[] = [
  { key: "name", label: "Vendor", render: (r) => <span><span className="font-medium">{r.name}</span><span className="block text-xs text-muted">{r.vendorNo} {r.contactPerson ? `· ${r.contactPerson}` : ""}</span></span> },
  { key: "phone", label: "Phone" },
  { key: "categories", label: "Supplies", render: (r) => <div className="flex flex-wrap gap-1">{(r.categories ?? []).slice(0, 3).map((c: string) => <Badge key={c}>{labelOf(MATERIAL_CATEGORIES, c)}</Badge>)}</div> },
  { key: "city", label: "City", hideOnMobile: true },
  { key: "rating", label: "Rating", render: (r) => (r.rating ? "★".repeat(Math.round(r.rating)) : "—"), hideOnMobile: true },
  { key: "isActive", label: "", render: (r) => (r.isActive === false ? <Badge color="red">Inactive</Badge> : null) },
];

/* ------------------------------- Contractors ----------------------------- */
export const contractorFields: Field[] = [
  { name: "name", label: "Name / firm", required: true },
  { name: "trade", label: "Trade", type: "select", options: TRADES, required: true },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "alternatePhone", label: "Alternate phone", type: "tel" },
  { name: "address", label: "Address", type: "textarea", rows: 2 },
  { name: "teamSize", label: "Team size", type: "number" },
  { name: "rateType", label: "Rate type", type: "select", options: RATE_TYPES },
  { name: "rate", label: "Rate", type: "money" },
  { name: "idProof", label: "ID proof (Aadhaar / PAN no.)" },
  { name: "rating", label: "Rating (0-5)", type: "number", min: 0, max: 5 },
  { name: "isActive", label: "Active", type: "checkbox", placeholder: "Active" },
  { name: "notes", label: "Notes", type: "textarea" },
];
export const contractorColumns: Column[] = [
  { key: "name", label: "Contractor", render: (r) => <span><span className="font-medium">{r.name}</span><span className="block text-xs text-muted">{r.contractorNo}</span></span> },
  { key: "trade", label: "Trade", render: (r) => <Badge color="brand">{labelOf(TRADES, r.trade)}</Badge> },
  { key: "phone", label: "Phone" },
  { key: "teamSize", label: "Team", align: "right" },
  { key: "rate", label: "Rate", render: (r) => (r.rate ? `${money(r.rate)} ${labelOf(RATE_TYPES, r.rateType).toLowerCase()}` : "—"), hideOnMobile: true },
  { key: "isActive", label: "", render: (r) => (r.isActive === false ? <Badge color="red">Inactive</Badge> : null) },
];

/* ------------------------------- Work orders ----------------------------- */
export const workOrderFields: Field[] = [
  { name: "project", label: "Site", type: "ref", ref: REF.project, required: true },
  { name: "contractor", label: "Contractor", type: "ref", ref: REF.contractor, required: true },
  { name: "trade", label: "Trade", type: "select", options: TRADES },
  { name: "amount", label: "Agreed amount", type: "money" },
  { name: "startDate", label: "Start date", type: "date" },
  { name: "endDate", label: "End date", type: "date" },
  { name: "status", label: "Status", type: "select", options: WORK_ORDER_STATUS },
  { name: "scope", label: "Scope of work", type: "textarea", rows: 4 },
  { name: "terms", label: "Terms", type: "textarea" },
];
export const workOrderColumns: Column[] = [
  { key: "woNo", label: "WO #", render: (r) => <span className="font-medium">{r.woNo}</span> },
  { key: "project", label: "Site", render: (r) => <ProjectLink project={r.project} /> },
  { key: "contractor", label: "Contractor", render: (r) => <span>{r.contractor?.name}<span className="block text-xs text-muted">{labelOf(TRADES, r.trade)}</span></span> },
  { key: "amount", label: "Amount", render: (r) => money(r.amount), align: "right" },
  { key: "paidAmount", label: "Paid", render: (r) => money(r.paidAmount), align: "right" },
  { key: "due", label: "Balance", render: (r) => <span className={r.amount - r.paidAmount > 0 ? "text-amber-700" : ""}>{money((r.amount ?? 0) - (r.paidAmount ?? 0))}</span>, align: "right", csv: (r) => (r.amount ?? 0) - (r.paidAmount ?? 0) },
  { key: "status", label: "Status", render: (r) => <StatusBadge options={WORK_ORDER_STATUS} value={r.status} /> },
];

/* -------------------------------- Materials ------------------------------ */
export const materialFields: Field[] = [
  { name: "name", label: "Material name", required: true },
  { name: "code", label: "Code / SKU" },
  { name: "category", label: "Category", type: "select", options: MATERIAL_CATEGORIES, required: true },
  { name: "unit", label: "Unit", type: "select", options: UNITS },
  { name: "brand", label: "Brand" },
  { name: "hsn", label: "HSN code" },
  { name: "defaultRate", label: "Default rate", type: "money" },
  { name: "gstRate", label: "GST %", type: "number" },
  { name: "minStock", label: "Re-order level (factory)", type: "number" },
  { name: "preferredVendor", label: "Preferred vendor", type: "ref", ref: REF.vendor },
  { name: "openingStock", label: "Opening stock", type: "number", hidden: (v) => !!v.id, help: "Only when creating" },
  { name: "specification", label: "Specification", type: "textarea", rows: 2 },
  { name: "isActive", label: "Active", type: "checkbox", placeholder: "Active" },
];

/* ------------------------------- Follow-ups ------------------------------ */
export const followupFields: Field[] = [
  { name: "lead", label: "Lead", type: "ref", ref: REF.lead },
  { name: "type", label: "Type", type: "select", options: FOLLOWUP_TYPES },
  { name: "scheduledAt", label: "When", type: "datetime", required: true },
  { name: "assignedTo", label: "Assigned to", type: "ref", ref: REF.user },
  { name: "purpose", label: "Purpose", type: "textarea", rows: 2 },
  { name: "status", label: "Status", type: "select", options: FOLLOWUP_STATUS },
  { name: "outcome", label: "Outcome / discussion", type: "textarea", hidden: (v) => v.status !== "done" && v.status !== "missed" },
  { name: "nextFollowUpAt", label: "Schedule next follow-up", type: "datetime", hidden: (v) => v.status !== "done" },
];
export const followupColumns: Column[] = [
  { key: "scheduledAt", label: "When", render: (r) => <span className={r.status === "pending" && isOverdue(r.scheduledAt) ? "font-medium text-red-600" : ""}>{dateTime(r.scheduledAt)}</span> },
  { key: "lead", label: "Lead", csv: (r) => r.lead?.name ?? r.project?.name, render: (r) => (r.lead ? <span><span className="font-medium">{r.lead.name}</span><span className="block text-xs text-muted">{r.lead.phone}</span></span> : <ProjectLink project={r.project} />) },
  { key: "type", label: "Type", render: (r) => labelOf(FOLLOWUP_TYPES, r.type) },
  { key: "purpose", label: "Purpose", render: (r) => <span className="line-clamp-2 max-w-xs">{r.purpose}</span> },
  { key: "assignedTo", label: "Owner", render: (r) => <Person user={r.assignedTo} />, hideOnMobile: true },
  { key: "status", label: "Status", render: (r) => <StatusBadge options={FOLLOWUP_STATUS} value={r.status} /> },
];

/* ------------------------------ Finance: receipts ------------------------ */
export const paymentFields: Field[] = [
  { name: "project", label: "Site", type: "ref", ref: REF.project, required: true },
  { name: "amount", label: "Amount received", type: "money", required: true },
  { name: "date", label: "Date", type: "date" },
  { name: "type", label: "Against", type: "select", options: RECEIPT_TYPES },
  { name: "mode", label: "Mode", type: "select", options: PAYMENT_MODES },
  { name: "reference", label: "Reference (UTR / cheque no.)" },
  { name: "invoice", label: "Against invoice (optional)", type: "ref", ref: REF.invoice },
  { name: "notes", label: "Notes", type: "textarea", rows: 2 },
];
export const paymentColumns: Column[] = [
  { key: "receiptNo", label: "Receipt #", render: (r) => <span className="font-medium">{r.receiptNo}</span> },
  { key: "date", label: "Date", render: (r) => date(r.date) },
  { key: "project", label: "Site", render: (r) => <ProjectLink project={r.project} /> },
  { key: "type", label: "Against", render: (r) => labelOf(RECEIPT_TYPES, r.type) },
  { key: "mode", label: "Mode", render: (r) => <span>{labelOf(PAYMENT_MODES, r.mode)}<span className="block text-xs text-muted">{r.reference}</span></span>, hideOnMobile: true },
  { key: "amount", label: "Amount", render: (r) => <span className="font-semibold text-emerald-700">{money(r.amount)}</span>, align: "right" },
];

/* ------------------------------ Finance: expenses ------------------------ */
export const expenseFields: Field[] = [
  { name: "category", label: "Category", type: "select", options: EXPENSE_CATEGORIES, required: true },
  { name: "amount", label: "Amount paid", type: "money", required: true },
  { name: "project", label: "Site (empty = office overhead)", type: "ref", ref: REF.project },
  { name: "date", label: "Date", type: "date" },
  { name: "purchaseOrder", label: "Against purchase order", type: "ref", ref: REF.purchaseOrder, hidden: (v) => !["vendor_payment", "material"].includes(v.category) },
  { name: "vendor", label: "Vendor", type: "ref", ref: REF.vendor, hidden: (v) => !["vendor_payment", "material"].includes(v.category) || !!v.purchaseOrder },
  { name: "workOrder", label: "Against work order", type: "ref", ref: REF.workOrder, hidden: (v) => v.category !== "contractor_payment" },
  { name: "contractor", label: "Contractor", type: "ref", ref: REF.contractor, hidden: (v) => !["contractor_payment", "labour"].includes(v.category) || !!v.workOrder },
  { name: "payee", label: "Paid to" },
  { name: "mode", label: "Mode", type: "select", options: PAYMENT_MODES },
  { name: "reference", label: "Reference / bill no." },
  { name: "description", label: "Description", type: "textarea", rows: 2 },
];
export const expenseColumns: Column[] = [
  { key: "expenseNo", label: "#", render: (r) => <span className="text-xs text-muted">{r.expenseNo}</span> },
  { key: "date", label: "Date", render: (r) => date(r.date) },
  { key: "category", label: "Category", render: (r) => <Badge>{labelOf(EXPENSE_CATEGORIES, r.category)}</Badge> },
  { key: "project", label: "Site", render: (r) => (r.project ? <ProjectLink project={r.project} /> : <span className="text-xs text-muted">Office</span>) },
  { key: "payee", label: "Paid to", csv: (r) => r.payee ?? r.vendor?.name ?? r.contractor?.name, render: (r) => <span>{r.payee ?? r.vendor?.name ?? r.contractor?.name}<span className="block text-xs text-muted">{r.purchaseOrder?.poNo ?? r.workOrder?.woNo ?? ""}</span></span> },
  { key: "mode", label: "Mode", render: (r) => labelOf(PAYMENT_MODES, r.mode), hideOnMobile: true },
  { key: "amount", label: "Amount", render: (r) => <span className="font-semibold text-red-700">{money(r.amount)}</span>, align: "right" },
];

/* ---------------------------------- Users -------------------------------- */
export const userFields: Field[] = [
  { name: "name", label: "Full name", required: true },
  { name: "email", label: "Email (login)", type: "email", required: true },
  { name: "phone", label: "Phone (can also login)", type: "tel" },
  { name: "password", label: "Temporary password", type: "password", required: true, hidden: (v) => !!v.id, help: "Min 8 chars, letters + numbers. User must change it on first login." },
  { name: "role", label: "Role", type: "select", options: ROLES, required: true },
  { name: "designation", label: "Designation" },
  { name: "department", label: "Department", type: "select", options: DEPARTMENTS },
  { name: "joiningDate", label: "Joining date", type: "date" },
  { name: "address", label: "Address", type: "textarea", rows: 2 },
  { name: "emergencyContact", label: "Emergency contact" },
  { name: "isActive", label: "Status", type: "checkbox", placeholder: "Active (can log in)" },
  { name: "notes", label: "Notes", type: "textarea" },
];

export const numberCell = (v?: number) => <span className="tabular-nums">{number(v)}</span>;
export { money };
export type { Field };
export const anyCol = (c: Column<any>) => c;
