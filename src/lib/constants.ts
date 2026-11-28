/**
 * Shared enums & labels. Used by API validation, DB models and UI.
 * Keep this file free of server/client specific imports so it can be
 * copied/shared with the mobile app.
 */

export type Option<T extends string = string> = { value: T; label: string; color?: string };

function opts<const T extends readonly { value: string; label: string; color?: string }[]>(o: T) {
  return o;
}
export function values<T extends readonly { value: string }[]>(o: T) {
  return o.map((x) => x.value) as unknown as [T[number]["value"], ...T[number]["value"][]];
}
/** Labels of options an admin removed from a managed list – old records still show their proper name. */
const RETIRED = new WeakMap<readonly Option[], Map<string, string>>();
export function setRetiredOptions(list: readonly Option[], removed: readonly Option[]) {
  RETIRED.set(list, new Map(removed.map((o) => [o.value, o.label])));
}
export function labelOf(list: readonly Option[], value?: string | null) {
  if (value == null || value === "") return "";
  return list.find((x) => x.value === value)?.label ?? RETIRED.get(list)?.get(value) ?? value;
}
export function colorOf(list: readonly Option[], value?: string | null) {
  return list.find((x) => x.value === value)?.color ?? "gray";
}

/* ------------------------------ Team / Roles ----------------------------- */
export const ROLES = opts([
  { value: "admin", label: "Admin / Owner", color: "purple" },
  { value: "manager", label: "Project Manager", color: "blue" },
  { value: "designer", label: "Designer", color: "pink" },
  { value: "supervisor", label: "Site Supervisor", color: "amber" },
  { value: "accountant", label: "Accountant", color: "green" },
  { value: "store", label: "Store / Factory", color: "orange" },
  { value: "staff", label: "Office Staff", color: "gray" },
] as const);
export type Role = (typeof ROLES)[number]["value"];

export const DEPARTMENTS = opts([
  { value: "management", label: "Management" },
  { value: "design", label: "Design" },
  { value: "site", label: "Site / Execution" },
  { value: "factory", label: "Factory / Store" },
  { value: "accounts", label: "Accounts" },
  { value: "sales", label: "Sales" },
  { value: "office", label: "Office" },
] as const);

/* --------------------------------- Leads -------------------------------- */
export const LEAD_STATUS = opts([
  { value: "new", label: "New", color: "blue" },
  { value: "contacted", label: "Contacted", color: "sky" },
  { value: "follow_up", label: "Follow-up", color: "amber" },
  { value: "site_visit_scheduled", label: "Site Visit Scheduled", color: "violet" },
  { value: "site_visit_done", label: "Site Visit Done", color: "indigo" },
  { value: "design_quotation", label: "Design & Quotation", color: "pink" },
  { value: "negotiation", label: "Negotiation", color: "orange" },
  { value: "won", label: "Won / Converted", color: "green" },
  { value: "lost", label: "Lost", color: "red" },
  { value: "on_hold", label: "On Hold", color: "gray" },
] as const);
export type LeadStatus = (typeof LEAD_STATUS)[number]["value"];

export const LEAD_SOURCES = opts([
  { value: "website", label: "Website" },
  { value: "meta_ads", label: "Meta Ads (FB/IG)" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "google", label: "Google" },
  { value: "referral", label: "Referral" },
  { value: "walk_in", label: "Walk-in" },
  { value: "justdial", label: "JustDial" },
  { value: "builder", label: "Builder / Architect" },
  { value: "repeat", label: "Repeat Client" },
  { value: "other", label: "Other" },
] as const);

export const LEAD_PRIORITY = opts([
  { value: "hot", label: "Hot", color: "red" },
  { value: "warm", label: "Warm", color: "amber" },
  { value: "cold", label: "Cold", color: "sky" },
] as const);

export const PROPERTY_TYPES = opts([
  { value: "apartment", label: "Apartment / Flat" },
  { value: "villa", label: "Villa" },
  { value: "independent_house", label: "Independent House" },
  { value: "penthouse", label: "Penthouse" },
  { value: "office", label: "Office" },
  { value: "retail", label: "Retail / Showroom" },
  { value: "restaurant", label: "Restaurant / Cafe" },
  { value: "other", label: "Other" },
] as const);

export const PROPERTY_CONFIGS = opts([
  { value: "1rk", label: "1 RK" },
  { value: "1bhk", label: "1 BHK" },
  { value: "2bhk", label: "2 BHK" },
  { value: "3bhk", label: "3 BHK" },
  { value: "4bhk", label: "4 BHK" },
  { value: "5bhk+", label: "5+ BHK" },
  { value: "na", label: "N/A" },
] as const);

export const WORK_SCOPES = opts([
  { value: "full_home", label: "Full Home Interior" },
  { value: "kitchen", label: "Modular Kitchen" },
  { value: "wardrobe", label: "Wardrobes" },
  { value: "living", label: "Living Room" },
  { value: "bedroom", label: "Bedroom" },
  { value: "bathroom", label: "Bathroom" },
  { value: "false_ceiling", label: "False Ceiling" },
  { value: "painting", label: "Painting" },
  { value: "flooring", label: "Flooring / Tiles" },
  { value: "renovation", label: "Renovation" },
  { value: "commercial", label: "Commercial Interior" },
] as const);

export const FOLLOWUP_TYPES = opts([
  { value: "call", label: "Call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "meeting", label: "Office Meeting" },
  { value: "site_visit", label: "Site Visit" },
  { value: "email", label: "Email" },
  { value: "other", label: "Other" },
] as const);

export const FOLLOWUP_STATUS = opts([
  { value: "pending", label: "Pending", color: "amber" },
  { value: "done", label: "Done", color: "green" },
  { value: "missed", label: "Missed", color: "red" },
  { value: "cancelled", label: "Cancelled", color: "gray" },
] as const);

export const SITE_VISIT_STATUS = opts([
  { value: "scheduled", label: "Scheduled", color: "blue" },
  { value: "completed", label: "Completed", color: "green" },
  { value: "cancelled", label: "Cancelled", color: "gray" },
] as const);

/* ------------------------------- Projects ------------------------------- */
/** Workflow stages straight from the LA-VISTA process notes. */
export const PROJECT_STAGES = opts([
  { value: "site_visit", label: "1. Site Visit & Measurement", color: "sky" },
  { value: "design_2d", label: "2. 2D Layout (AutoCAD)", color: "blue" },
  { value: "design_3d", label: "3. 3D Design & Renders", color: "indigo" },
  { value: "elevation", label: "4. Elevations / Working Drawings", color: "violet" },
  { value: "quotation", label: "5. Working Quotation", color: "pink" },
  { value: "contractor_selection", label: "6. Contractor Selection", color: "orange" },
  { value: "procurement", label: "7. Material Procurement", color: "amber" },
  { value: "execution", label: "8. Site Execution", color: "yellow" },
  { value: "billing", label: "9. Billing & Payments", color: "lime" },
  { value: "handover", label: "10. Handover", color: "green" },
  { value: "closed", label: "Closed", color: "gray" },
] as const);
export type ProjectStage = (typeof PROJECT_STAGES)[number]["value"];

export const PROJECT_STATUS = opts([
  { value: "active", label: "Active", color: "green" },
  { value: "on_hold", label: "On Hold", color: "amber" },
  { value: "completed", label: "Completed", color: "blue" },
  { value: "cancelled", label: "Cancelled", color: "red" },
] as const);

/* -------------------------------- Designs ------------------------------- */
export const DESIGN_TYPES = opts([
  { value: "layout_2d", label: "2D Layout (AutoCAD)", color: "blue" },
  { value: "model_3d", label: "3D Model (SketchUp)", color: "indigo" },
  { value: "render", label: "Render (Enscape)", color: "violet" },
  { value: "elevation", label: "Elevation", color: "pink" },
  { value: "working_drawing", label: "Working / Execution Drawing", color: "orange" },
  { value: "measurement", label: "Measurement Drawing", color: "sky" },
  { value: "other", label: "Other", color: "gray" },
] as const);

export const DESIGN_STATUS = opts([
  { value: "draft", label: "Draft", color: "gray" },
  { value: "shared", label: "Shared with Client", color: "blue" },
  { value: "changes_requested", label: "Changes Requested", color: "amber" },
  { value: "approved", label: "Approved (Final)", color: "green" },
  { value: "superseded", label: "Superseded", color: "gray" },
] as const);

export const DESIGN_TOOLS = opts([
  { value: "autocad", label: "AutoCAD" },
  { value: "sketchup", label: "SketchUp" },
  { value: "enscape", label: "Enscape" },
  { value: "vray", label: "V-Ray" },
  { value: "hand_sketch", label: "Pen & Paper" },
  { value: "other", label: "Other" },
] as const);

export const ROOMS = opts([
  { value: "full_home", label: "Full Home" },
  { value: "living", label: "Living Room" },
  { value: "dining", label: "Dining" },
  { value: "kitchen", label: "Kitchen" },
  { value: "master_bedroom", label: "Master Bedroom" },
  { value: "bedroom_2", label: "Bedroom 2" },
  { value: "bedroom_3", label: "Bedroom 3" },
  { value: "kids_room", label: "Kids Room" },
  { value: "guest_room", label: "Guest Room" },
  { value: "pooja", label: "Pooja Room" },
  { value: "bathroom", label: "Bathroom" },
  { value: "balcony", label: "Balcony" },
  { value: "foyer", label: "Foyer / Entrance" },
  { value: "study", label: "Study" },
  { value: "utility", label: "Utility" },
  { value: "other", label: "Other" },
] as const);

/* ------------------------------ Quotations ------------------------------ */
export const QUOTE_TYPES = opts([
  { value: "preliminary", label: "Preliminary / Estimate" },
  { value: "working", label: "Working Quotation" },
  { value: "additional", label: "Additional Work" },
] as const);

export const QUOTE_STATUS = opts([
  { value: "draft", label: "Draft", color: "gray" },
  { value: "sent", label: "Sent to Client", color: "blue" },
  { value: "changes_requested", label: "Changes Requested", color: "amber" },
  { value: "approved", label: "Approved (Final)", color: "green" },
  { value: "rejected", label: "Rejected", color: "red" },
  { value: "superseded", label: "Superseded", color: "gray" },
] as const);

/** Trades/work categories used across quotations, contractors, checklists and materials. */
export const TRADES = opts([
  { value: "carpentry", label: "Carpentry" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "tiles", label: "Tiles / Flooring" },
  { value: "false_ceiling", label: "False Ceiling" },
  { value: "painting", label: "Painting / Polish" },
  { value: "civil", label: "Civil / Masonry" },
  { value: "glass", label: "Glass & Aluminium" },
  { value: "fabrication", label: "Fabrication / Welding" },
  { value: "furnishing", label: "Furnishing / Upholstery" },
  { value: "appliances", label: "Appliances" },
  { value: "decor", label: "Decor & Lighting" },
  { value: "other", label: "Other" },
] as const);

export const UNITS = opts([
  { value: "sqft", label: "Sq.ft" },
  { value: "rft", label: "R.ft" },
  { value: "sqm", label: "Sq.m" },
  { value: "nos", label: "Nos" },
  { value: "sheet", label: "Sheet" },
  { value: "set", label: "Set" },
  { value: "kg", label: "Kg" },
  { value: "ltr", label: "Litre" },
  { value: "box", label: "Box" },
  { value: "bag", label: "Bag" },
  { value: "roll", label: "Roll" },
  { value: "m", label: "Metre" },
  { value: "bundle", label: "Bundle" },
  { value: "pkt", label: "Packet" },
  { value: "point", label: "Point" },
  { value: "day", label: "Day" },
  { value: "lumpsum", label: "Lumpsum" },
] as const);

/* ------------------------- Vendors / Contractors ------------------------ */
export const MATERIAL_CATEGORIES = opts([
  { value: "plywood", label: "Plywood / Boards" },
  { value: "laminate", label: "Laminate / Veneer" },
  { value: "hardware", label: "Hardware & Fittings" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing & Sanitary" },
  { value: "tiles", label: "Tiles & Stone" },
  { value: "paint", label: "Paint & Polish" },
  { value: "gypsum", label: "Gypsum / POP / Ceiling" },
  { value: "glass", label: "Glass & Mirror" },
  { value: "adhesive", label: "Adhesive & Consumables" },
  { value: "lighting", label: "Lighting" },
  { value: "fabric", label: "Fabric & Furnishing" },
  { value: "appliances", label: "Appliances" },
  { value: "civil", label: "Civil Material" },
  { value: "other", label: "Other" },
] as const);

export const CONTRACTOR_TRADES = TRADES;

export const RATE_TYPES = opts([
  { value: "per_day", label: "Per Day" },
  { value: "per_sqft", label: "Per Sq.ft" },
  { value: "per_rft", label: "Per R.ft" },
  { value: "per_point", label: "Per Point" },
  { value: "lumpsum", label: "Lumpsum" },
] as const);

export const WORK_ORDER_STATUS = opts([
  { value: "selected", label: "Selected", color: "blue" },
  { value: "active", label: "In Progress", color: "amber" },
  { value: "completed", label: "Completed", color: "green" },
  { value: "terminated", label: "Terminated", color: "red" },
] as const);

/* ------------------------------ Procurement ----------------------------- */
export const MR_STATUS = opts([
  { value: "pending", label: "Pending Approval", color: "amber" },
  { value: "approved", label: "Approved", color: "blue" },
  { value: "ordered", label: "PO Raised", color: "indigo" },
  { value: "issued", label: "Issued from Stock", color: "violet" },
  { value: "fulfilled", label: "Fulfilled", color: "green" },
  { value: "rejected", label: "Rejected", color: "red" },
] as const);

export const PO_STATUS = opts([
  { value: "draft", label: "Draft", color: "gray" },
  { value: "ordered", label: "Ordered", color: "blue" },
  { value: "partially_received", label: "Partially Received", color: "amber" },
  { value: "received", label: "Received", color: "green" },
  { value: "cancelled", label: "Cancelled", color: "red" },
] as const);

export const DELIVERY_LOCATIONS = opts([
  { value: "site", label: "Direct to Site" },
  { value: "factory", label: "Factory / Store" },
] as const);

export const PAYMENT_STATUS = opts([
  { value: "unpaid", label: "Unpaid", color: "red" },
  { value: "partial", label: "Partially Paid", color: "amber" },
  { value: "paid", label: "Paid", color: "green" },
] as const);

export const STOCK_TXN_TYPES = opts([
  { value: "in", label: "Stock In (GRN)", color: "green" },
  { value: "issue", label: "Issued to Site", color: "blue" },
  { value: "return", label: "Returned from Site", color: "violet" },
  { value: "adjust", label: "Adjustment", color: "amber" },
  { value: "site_receipt", label: "Received at Site (Direct)", color: "sky" },
] as const);

/* --------------------------------- Tasks -------------------------------- */
export const TASK_STATUS = opts([
  { value: "todo", label: "To Do", color: "gray" },
  { value: "in_progress", label: "In Progress", color: "blue" },
  { value: "review", label: "In Review", color: "violet" },
  { value: "blocked", label: "Blocked", color: "red" },
  { value: "done", label: "Done", color: "green" },
  { value: "cancelled", label: "Cancelled", color: "gray" },
] as const);
export type TaskStatus = (typeof TASK_STATUS)[number]["value"];

export const TASK_PRIORITY = opts([
  { value: "low", label: "Low", color: "gray" },
  { value: "medium", label: "Medium", color: "blue" },
  { value: "high", label: "High", color: "amber" },
  { value: "urgent", label: "Urgent", color: "red" },
] as const);

export const TASK_CATEGORIES = opts([
  { value: "site", label: "Site Work" },
  { value: "design", label: "Design" },
  { value: "procurement", label: "Procurement" },
  { value: "office", label: "Office" },
  { value: "accounts", label: "Accounts" },
  { value: "sales", label: "Sales / Follow-up" },
  { value: "factory", label: "Factory" },
  { value: "other", label: "Other" },
] as const);

export const RECURRENCE = opts([
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily (until site closes)" },
  { value: "weekly", label: "Weekly (until site closes)" },
] as const);

/* -------------------------------- Accounts ------------------------------ */
export const PAYMENT_MODES = opts([
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer (NEFT/RTGS/IMPS)" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
] as const);

export const RECEIPT_TYPES = opts([
  { value: "booking", label: "Booking Amount" },
  { value: "advance", label: "Advance" },
  { value: "milestone", label: "Milestone Payment" },
  { value: "final", label: "Final Payment" },
  { value: "additional", label: "Additional Work" },
  { value: "other", label: "Other" },
] as const);

export const EXPENSE_CATEGORIES = opts([
  { value: "material", label: "Material Purchase" },
  { value: "vendor_payment", label: "Vendor Payment (PO)" },
  { value: "contractor_payment", label: "Contractor Payment" },
  { value: "labour", label: "Daily Labour" },
  { value: "transport", label: "Transport / Cartage" },
  { value: "site_misc", label: "Site Miscellaneous" },
  { value: "salary", label: "Salary" },
  { value: "rent", label: "Office Rent" },
  { value: "utilities", label: "Utilities" },
  { value: "marketing", label: "Marketing" },
  { value: "software", label: "Software / Subscriptions" },
  { value: "office", label: "Office Expense" },
  { value: "other", label: "Other" },
] as const);

export const INVOICE_TYPES = opts([
  { value: "proforma", label: "Proforma Invoice" },
  { value: "tax_invoice", label: "Tax Invoice" },
  { value: "running_bill", label: "Running Bill" },
  { value: "final_bill", label: "Final Bill" },
] as const);

export const INVOICE_STATUS = opts([
  { value: "draft", label: "Draft", color: "gray" },
  { value: "issued", label: "Issued", color: "blue" },
  { value: "partially_paid", label: "Partially Paid", color: "amber" },
  { value: "paid", label: "Paid", color: "green" },
  { value: "cancelled", label: "Cancelled", color: "red" },
] as const);

export const MILESTONE_STATUS = opts([
  { value: "upcoming", label: "Upcoming", color: "gray" },
  { value: "due", label: "Due", color: "amber" },
  { value: "paid", label: "Paid", color: "green" },
] as const);

/* ------------------------------- Checklists ----------------------------- */
export const CHECKLIST_STATUS = opts([
  { value: "open", label: "Open", color: "amber" },
  { value: "completed", label: "Completed", color: "green" },
] as const);

/* ------------------------------- Attendance ----------------------------- */
export const ATTENDANCE_STATUS = opts([
  { value: "present", label: "Present", color: "green" },
  { value: "half_day", label: "Half Day", color: "amber" },
  { value: "absent", label: "Absent", color: "red" },
  { value: "leave", label: "Leave", color: "blue" },
] as const);

/* --------------------------------- Files -------------------------------- */
export const FILE_CATEGORIES = opts([
  { value: "site_photo", label: "Site Photo" },
  { value: "measurement", label: "Measurement Sheet" },
  { value: "design", label: "Design File" },
  { value: "render", label: "Render" },
  { value: "document", label: "Document" },
  { value: "invoice", label: "Bill / Invoice" },
  { value: "progress", label: "Progress Photo" },
  { value: "other", label: "Other" },
] as const);

export const GST_RATES = [0, 5, 12, 18, 28] as const;

/** Default client payment schedule (editable per project / in settings). */
export const DEFAULT_PAYMENT_SCHEDULE = [
  { name: "Booking / Design Advance", percent: 10 },
  { name: "Before Material Order (Production)", percent: 50 },
  { name: "Mid Execution", percent: 30 },
  { name: "Handover", percent: 10 },
];
