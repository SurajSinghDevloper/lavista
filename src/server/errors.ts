/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Turns validation / database errors into plain-language messages for end users.
 * Every API error a person (or the mobile app) can see goes through here or is written by hand in plain words –
 * raw library text such as "Invalid input: expected string, received undefined" must never reach the UI.
 */

/** Field names as people see them on screen. Anything missing falls back to "Camel case" → "Camel case". */
const LABELS: Record<string, string> = {
  // people & contact
  name: "Name",
  phone: "Phone number",
  alternatePhone: "Alternate phone",
  email: "Email",
  address: "Address",
  city: "City",
  state: "State",
  gstin: "GSTIN",
  pan: "PAN",
  password: "Password",
  currentPassword: "Current password",
  newPassword: "New password",
  role: "Role",
  designation: "Designation",
  department: "Department",
  extraPermissions: "Extra permissions",
  isActive: "Active",
  emergencyContact: "Emergency contact",
  joiningDate: "Joining date",
  // relations
  client: "Client",
  existingClient: "Existing client",
  project: "Site",
  lead: "Lead",
  vendor: "Vendor",
  contractor: "Contractor",
  material: "Material",
  preferredVendor: "Preferred vendor",
  purchaseOrder: "Purchase order",
  workOrder: "Work order",
  materialRequest: "Material request",
  invoice: "Bill",
  quotation: "Quotation",
  milestone: "Payment milestone",
  assignedTo: "Assignee",
  manager: "Project manager",
  designer: "Designer",
  supervisor: "Site supervisor",
  members: "Team members",
  visitedBy: "Team member",
  user: "Team member",
  poItem: "Purchase order line",
  mrItem: "Request line",
  template: "Template",
  // site / project
  projectName: "Site name",
  siteAddress: "Site address",
  propertyType: "Property type",
  propertyConfig: "Configuration",
  areaSqft: "Area",
  scope: "Scope of work",
  stage: "Stage",
  status: "Status",
  progress: "Progress",
  contractValue: "Contract value",
  budget: "Budget",
  startDate: "Start date",
  expectedEndDate: "Target handover date",
  actualEndDate: "Handover date",
  paymentSchedule: "Payment schedule",
  percent: "Percentage",
  // sales
  source: "Lead source",
  sourceDetails: "Source details",
  priority: "Priority",
  nextFollowUpAt: "Next follow-up",
  scheduledAt: "Date & time",
  visitedAt: "Visit date",
  lostReason: "Lost reason",
  purpose: "Purpose",
  outcome: "Outcome",
  requirements: "Requirements",
  measurements: "Measurements",
  location: "Location",
  lat: "Latitude",
  lng: "Longitude",
  // design & quotation
  title: "Title",
  room: "Room / area",
  tool: "Made in",
  externalLink: "Link",
  clientFeedback: "Client feedback",
  customerName: "Customer name",
  customerPhone: "Customer phone",
  validUntil: "Valid until",
  discountType: "Discount type",
  discountValue: "Discount",
  discountAmount: "Discount",
  taxRate: "GST %",
  gstRate: "GST %",
  changeSummary: "What changed",
  // line items
  items: "Items",
  section: "Area / room",
  description: "Description",
  specification: "Specification",
  hsn: "HSN code",
  unit: "Unit",
  qty: "Quantity",
  rate: "Rate",
  amount: "Amount",
  receivedQty: "Received quantity",
  rejectedQty: "Rejected quantity",
  orderedQty: "Ordered quantity",
  freight: "Freight",
  // procurement & stock
  deliverTo: "Deliver to",
  expectedDate: "Expected delivery",
  requiredBy: "Required by",
  vendorInvoiceNo: "Vendor bill number",
  vendorInvoiceAmount: "Vendor bill amount",
  vehicleNo: "Vehicle number",
  receivedAt: "Received on",
  issuedTo: "Handed to",
  minStock: "Re-order level",
  defaultRate: "Default rate",
  openingStock: "Opening stock",
  openingRate: "Opening rate",
  code: "Code",
  brand: "Brand",
  categories: "Supplies",
  category: "Category",
  trade: "Trade",
  rateType: "Rate type",
  teamSize: "Team size",
  creditDays: "Credit days",
  rating: "Rating",
  // finance
  date: "Date",
  dueDate: "Due date",
  mode: "Payment mode",
  reference: "Reference",
  payee: "Paid to",
  interState: "Inter-state (IGST)",
  type: "Type",
  // bank
  bank: "Bank details",
  accountName: "Account name",
  accountNo: "Account number",
  ifsc: "IFSC code",
  bankName: "Bank name",
  upi: "UPI ID",
  // tasks, reports, checklists
  checklist: "Checklist",
  comments: "Comments",
  recurrence: "Repeat",
  workDone: "Work done",
  materialsUsed: "Material used",
  issues: "Issues",
  nextDayPlan: "Plan for tomorrow",
  manpower: "Manpower",
  count: "Number of people",
  text: "Text",
  checked: "Done",
  remark: "Remark",
  isTemplate: "Template",
  // misc
  notes: "Notes",
  caption: "Caption",
  photos: "Photos",
  files: "Files",
  photo: "Photo",
  tags: "Tags",
  checkIn: "Check-in",
  checkOut: "Check-out",
  deviceName: "Device name",
  refreshToken: "Session",
  ids: "Selection",
  action: "Action",
  reason: "Reason",
  tasks: "Tasks",
};

/** Singular names for one entry of a list field (used in "Item 3 – Quantity"). */
const SINGULAR: Record<string, string> = {
  items: "Item",
  measurements: "Measurement",
  paymentSchedule: "Milestone",
  manpower: "Manpower row",
  checklist: "Checklist item",
  tasks: "Task",
  members: "Member",
  visitedBy: "Team member",
  photos: "Photo",
  files: "File",
  categories: "Supply",
  scope: "Scope",
  extraPermissions: "Permission",
};

export function humanizeKey(key: string) {
  if (LABELS[key]) return LABELS[key];
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "This field";
}

function singularOf(key: string) {
  if (SINGULAR[key]) return SINGULAR[key];
  const l = humanizeKey(key);
  return l.endsWith("ies") ? `${l.slice(0, -3)}y` : l.endsWith("s") && !l.endsWith("ss") ? l.slice(0, -1) : l;
}

/** ["items", 2, "qty"] → "Item 3 – Quantity"; ["value", "name"] (settings) → "Name". */
export function fieldLabel(path: readonly PropertyKey[]): string {
  const segs = path[0] === "value" && path.length > 1 ? path.slice(1) : path;
  const parts: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (typeof seg === "number") continue;
    const next = segs[i + 1];
    parts.push(typeof next === "number" ? `${singularOf(String(seg))} ${next + 1}` : humanizeKey(String(seg)));
  }
  return parts.join(" – ") || "This form";
}

/* ---------------------------------- Zod ---------------------------------- */
type ZodIssueLike = {
  code: string;
  path: PropertyKey[];
  message?: string;
  expected?: string;
  received?: string;
  origin?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  inclusive?: boolean;
  format?: string;
  pattern?: string;
  divisor?: number;
};

export type FriendlyIssue = { path: string; message: string; required: boolean };

/** "Please enter a valid phone number" / "… valid alternate phone" – no "phone number for Phone number". */
const validPhone = (label: string) => (/phone/i.test(label) ? `Please enter a valid ${label.toLowerCase()}` : `Please enter a valid phone number for ${label}`);
/** "a category" / "an item" for "Please select a … from the list". */
const article = (label: string) => `${/^[aeio]/i.test(label) ? "an" : "a"} ${label.toLowerCase()}`;
/** "Please enter a valid due date" / "… valid date & time" / "… valid date for Required by". */
const validDate = (label: string) => (/(date|date & time)$/i.test(label) ? `Please enter a valid ${label.toLowerCase()}` : `Please enter a valid date for ${label}`);

/** Messages zod writes itself (never shown to users as-is). Our own short codes are listed too. */
const LIBRARY_MESSAGE = /^(Invalid input|Invalid option|Invalid string|Invalid URL|Invalid email|Invalid id|Invalid phone|Invalid|Required|Too small|Too big|Expected)\b/;

export function friendlyIssue(iss: ZodIssueLike): FriendlyIssue {
  const label = fieldLabel(iss.path);
  const path = iss.path.map(String).join(".");
  const msg = iss.message ?? "";
  const done = (message: string, required = false): FriendlyIssue => ({ path, message, required });
  const min = Number(iss.minimum);
  const max = Number(iss.maximum);

  switch (iss.code) {
    case "invalid_type": {
      if (/received (undefined|null)$/.test(msg)) return done(`${label} is required`, true);
      switch (iss.expected) {
        case "number":
        case "int":
        case "bigint":
          return done(`Please enter a valid number for ${label}`);
        case "date":
          return done(validDate(label));
        case "boolean":
          return done(`Please choose yes or no for ${label}`);
        case "array":
          return done(`${label} must be a list`);
        default:
          return done(`${label} is not valid`);
      }
    }
    case "too_small": {
      if (iss.origin === "string") {
        if (msg === "Invalid phone") return done(validPhone(label));
        return min <= 1 ? done(`${label} is required`, true) : done(`${label} must be at least ${min} characters`);
      }
      if (iss.origin === "number") return done(iss.inclusive ? `${label} must be at least ${min}` : `${label} must be more than ${min}`);
      if (iss.origin === "array" || iss.origin === "set") {
        return done(min <= 1 ? `Please add at least one ${singularOf(String(iss.path.at(-1) ?? "item")).toLowerCase()}` : `Please add at least ${min} entries to ${label}`, true);
      }
      if (iss.origin === "date") return done(`${label} is too early`);
      return done(`${label} is too small`);
    }
    case "too_big": {
      if (iss.origin === "string") return done(`${label} is too long – please keep it under ${max} characters`);
      if (iss.origin === "number") return done(iss.inclusive ? `${label} can be at most ${max}` : `${label} must be less than ${max}`);
      if (iss.origin === "array" || iss.origin === "set") return done(`${label} has too many entries – the limit is ${max}`);
      if (iss.origin === "date") return done(`${label} is too far ahead`);
      return done(`${label} is too large`);
    }
    case "invalid_format": {
      if (iss.format === "email" || msg === "Invalid email") return done(label === "Email" ? "Please enter a valid email address" : `Please enter a valid email address for ${label}`);
      if (iss.format === "url") return done(label === "Link" ? "Please enter a full link starting with https://" : `Please enter a full link starting with https:// for ${label}`);
      if (msg === "Invalid id") return done(`Please select a valid ${label.toLowerCase()}`);
      if (msg === "Invalid phone") return done(validPhone(label));
      if (iss.pattern?.includes("\\d{4}-\\d{2}-\\d{2}")) return done(validDate(label));
      return done(`${label} is not in the correct format`);
    }
    case "invalid_value":
      // zod reports both "missing" and "not one of the options" this way
      return done(`Please select ${article(label)} from the list`);
    case "not_multiple_of":
      return done(`${label} must be a multiple of ${iss.divisor}`);
    case "custom":
      return done(msg && !LIBRARY_MESSAGE.test(msg) ? msg : `${label} is not valid`);
    default:
      return done(msg && !LIBRARY_MESSAGE.test(msg) ? msg : `${label} is not valid`);
  }
}

/** One sentence for a toast + per-field details for forms. */
export function summarizeIssues(issues: ZodIssueLike[]) {
  const details = issues.map(friendlyIssue);
  // one message per field (zod can report two problems for the same field)
  const seen = new Set<string>();
  const unique = details.filter((d) => (seen.has(d.path) ? false : (seen.add(d.path), true)));
  const missing = unique.filter((d) => d.required);
  let message: string;
  if (missing.length > 1 && missing.length === unique.length) {
    message = `Please fill in the required fields: ${missing.map((d) => d.message.replace(/ is required$/, "").replace(/^Please add /, "")).join(", ")}`;
  } else if (unique.length > 1) {
    const shown = unique.slice(0, 3).map((d) => d.message);
    message = `Please fix: ${shown.join(" · ")}${unique.length > 3 ? ` · and ${unique.length - 3} more` : ""}`;
  } else {
    message = unique[0]?.message ?? "Some details are not valid. Please check the form and try again.";
  }
  return { message, details: unique.map(({ path, message: m }) => ({ path, message: m })) };
}

/* -------------------------------- Mongoose ------------------------------- */
const splitPath = (p: string) => p.split(".").map((s) => (/^\d+$/.test(s) ? Number(s) : s));

/** Mongoose ValidationError → friendly details. */
export function friendlyMongooseValidation(errors: Record<string, any>) {
  const details = Object.values(errors).map((e: any) => {
    const label = fieldLabel(splitPath(String(e.path ?? "")));
    let message: string;
    switch (e.kind) {
      case "required":
        message = `${label} is required`;
        break;
      case "enum":
        message = `Please select ${article(label)} from the list`;
        break;
      case "min":
        message = `${label} must be at least ${e.properties?.min}`;
        break;
      case "max":
        message = `${label} can be at most ${e.properties?.max}`;
        break;
      case "minlength":
        message = `${label} is too short`;
        break;
      case "maxlength":
        message = `${label} is too long`;
        break;
      default:
        message = `${label} is not valid`;
    }
    return { path: String(e.path ?? ""), message };
  });
  return { message: details[0]?.message ?? "Some details are not valid", details };
}

export const friendlyCastError = (path: string) => `${fieldLabel(splitPath(path))} is not valid – please select it again`;

/** Duplicate key (E11000) → "This email is already in use". */
export function friendlyDuplicate(keyValue: Record<string, unknown> | undefined) {
  const keys = Object.keys(keyValue ?? {});
  if (keys.length !== 1) return "This record already exists";
  return `This ${fieldLabel([keys[0]]).toLowerCase()} is already in use – please use a different one`;
}

/** MongoDB unreachable / timed out. */
export function isDatabaseDown(e: unknown) {
  const name = (e as { name?: string })?.name ?? "";
  return /MongooseServerSelectionError|MongoServerSelectionError|MongoNetworkError|MongoNetworkTimeoutError|MongoNotConnectedError|MongoTopologyClosedError/.test(name);
}
