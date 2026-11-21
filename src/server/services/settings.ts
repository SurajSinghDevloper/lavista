import { DEFAULT_PAYMENT_SCHEDULE } from "@/lib/constants";
import { Setting } from "../models";

export const SETTING_DEFAULTS: Record<string, unknown> = {
  company: {
    name: "LA-VISTA",
    tagline: "Interior Design & Execution",
    address: "",
    city: "",
    state: "",
    phone: "",
    email: "",
    website: "",
    gstin: "",
    pan: "",
    bank: { accountName: "", accountNo: "", ifsc: "", bankName: "", upi: "" },
  },
  defaultGstRate: 18,
  paymentSchedule: DEFAULT_PAYMENT_SCHEDULE,
  quotationTerms: [
    "Quotation valid for 15 days from the date of issue.",
    "Any work outside this quotation will be charged extra.",
    "Payment as per agreed schedule. Work starts after booking advance.",
    "Material brands as specified; equivalent brands may be used subject to availability.",
    "Electrical & plumbing points beyond scope will be charged per point.",
  ].join("\n"),
  invoiceTerms: ["Payment due within 7 days.", "Cheques subject to realisation."].join("\n"),
  poTerms: ["Deliver material as per schedule.", "Bill must mention PO number.", "Damaged material will be returned."].join(
    "\n"
  ),
};

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS);

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const doc = await Setting.findById(key).lean<{ value: T }>();
  return (doc?.value ?? SETTING_DEFAULTS[key]) as T | undefined;
}

export async function getAllSettings() {
  const docs = await Setting.find({ _id: { $in: SETTING_KEYS } }).lean<{ _id: string; value: unknown }[]>();
  const out: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const d of docs) out[d._id] = d.value;
  return out;
}

export async function setSetting(key: string, value: unknown, userId?: string) {
  await Setting.updateOne({ _id: key }, { $set: { value, updatedBy: userId } }, { upsert: true });
}
