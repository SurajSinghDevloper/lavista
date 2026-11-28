/**
 * Dropdown lists the client manages themselves (Settings → Dropdown options).
 * The lists in constants.ts are the shipped defaults; the saved versions are loaded at start-up
 * and copied INTO those same arrays, so every form, filter and label in the app uses them.
 *
 * Workflow statuses (lead status, site stages, PO status…) are NOT here – the software's logic
 * depends on them. A few values inside managed lists are "locked" for the same reason: they can be
 * renamed but not deleted.
 */
import {
  DEPARTMENTS,
  DESIGN_TOOLS,
  EXPENSE_CATEGORIES,
  FILE_CATEGORIES,
  FOLLOWUP_TYPES,
  LEAD_SOURCES,
  MATERIAL_CATEGORIES,
  PAYMENT_MODES,
  PROPERTY_CONFIGS,
  PROPERTY_TYPES,
  RATE_TYPES,
  RECEIPT_TYPES,
  ROLES,
  ROOMS,
  TASK_CATEGORIES,
  TRADES,
  UNITS,
  WORK_SCOPES,
  setRetiredOptions,
  type Option,
} from "./constants";

type ListDef = { title: string; group: string; list: readonly Option[]; locked?: readonly string[]; help?: string };

const DEFS = {
  leadSources: { title: "Lead sources", group: "Sales", list: LEAD_SOURCES, locked: ["other"] },
  propertyTypes: { title: "Property types", group: "Sales", list: PROPERTY_TYPES },
  propertyConfigs: { title: "Configurations (BHK)", group: "Sales", list: PROPERTY_CONFIGS },
  workScopes: { title: "Scope of work", group: "Sales", list: WORK_SCOPES },
  followupTypes: { title: "Follow-up types", group: "Sales", list: FOLLOWUP_TYPES, locked: ["call"] },
  rooms: { title: "Rooms / areas", group: "Design", list: ROOMS, locked: ["full_home"] },
  designTools: { title: "Design software", group: "Design", list: DESIGN_TOOLS },
  trades: { title: "Trades / work types", group: "Site & contractors", list: TRADES, help: "Used for contractors, their rate cards, work orders, checklists and material requests." },
  rateTypes: { title: "Rate types", group: "Site & contractors", list: RATE_TYPES, help: "How a contractor charges, e.g. per sq.ft, per day." },
  taskCategories: { title: "Task categories", group: "Site & contractors", list: TASK_CATEGORIES, locked: ["site"] },
  materialCategories: { title: "Material categories", group: "Materials & purchase", list: MATERIAL_CATEGORIES },
  units: { title: "Units", group: "Materials & purchase", list: UNITS, locked: ["nos"] },
  paymentModes: { title: "Payment modes", group: "Accounts", list: PAYMENT_MODES, locked: ["cash", "bank_transfer"] },
  receiptTypes: { title: "Client receipt types", group: "Accounts", list: RECEIPT_TYPES, locked: ["advance"] },
  expenseCategories: {
    title: "Expense categories",
    group: "Accounts",
    list: EXPENSE_CATEGORIES,
    locked: ["material", "vendor_payment", "contractor_payment", "labour"],
    help: "Locked ones drive site costing and vendor / contractor payment tracking.",
  },
  fileCategories: { title: "File categories", group: "Files", list: FILE_CATEGORIES, locked: ["other", "site_photo"] },
  departments: { title: "Departments", group: "Team", list: DEPARTMENTS },
} satisfies Record<string, ListDef>;

export type ManagedListKey = keyof typeof DEFS;
export const MANAGED_LISTS: Record<ManagedListKey, ListDef> = DEFS;
export const MANAGED_KEYS = Object.keys(MANAGED_LISTS) as ManagedListKey[];

/** Shipped defaults (copied before anything is replaced). */
export const DEFAULT_OPTIONS = Object.fromEntries(
  MANAGED_KEYS.map((k) => [k, MANAGED_LISTS[k].list.map((o) => ({ ...o }))])
) as Record<ManagedListKey, Option[]>;
const DEFAULT_ROLES = ROLES.map((r) => ({ ...r }));

export type StoredList = { items: Option[]; removed?: Option[] };
export type RoleInfo = { value: string; label: string; color?: string; builtIn?: boolean };
export type OptionsPayload = { lists: Partial<Record<ManagedListKey, StoredList>>; roles?: RoleInfo[] };

function replace(target: readonly Option[], next: readonly Option[]) {
  (target as Option[]).splice(0, target.length, ...next.map((o) => ({ value: o.value, label: o.label, ...(o.color ? { color: o.color } : {}) })));
}

/** Put the client's saved lists into the shared arrays (browser only). */
export function applyManagedOptions(p: OptionsPayload) {
  for (const k of MANAGED_KEYS) {
    const saved = p.lists?.[k];
    replace(MANAGED_LISTS[k].list, saved?.items?.length ? saved.items : DEFAULT_OPTIONS[k]);
    setRetiredOptions(MANAGED_LISTS[k].list, saved?.removed ?? []);
  }
  if (p.roles?.length) replace(ROLES, p.roles.map((r) => ({ value: r.value, label: r.label, color: r.color ?? DEFAULT_ROLES.find((d) => d.value === r.value)?.color ?? "gray" })));
}

/** "Wall Putty & Paint" → "wall_putty_paint" */
export function slugify(label: string) {
  return (
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9+]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 50) || "option"
  );
}

/** What a stored option value may look like (also used by API validation). */
export const OPTION_VALUE_RE = /^[a-z0-9][a-z0-9_+-]{0,59}$/;
