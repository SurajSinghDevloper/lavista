import { z } from "zod";

export const zId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

/** Sub-documents come back from the API with `id`; accept it as `_id` so line identity is kept. */
export const aliasId = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) && "id" in v && !("_id" in v) ? { ...(v as object), _id: (v as { id: unknown }).id } : v;

const emptyToNull = (v: unknown) => (v === "" ? null : v);
const emptyToUndef = (v: unknown) => (v === "" || v === null ? undefined : v);

/** Optional reference; "" or null clears it. */
export const zRef = z.preprocess(emptyToNull, zId.nullable().optional());
export const zRefs = z.array(zId).max(500).optional();

export const zStr = (max = 200) => z.string().trim().min(1, "Required").max(max);
export const zText = (max = 5000) => z.preprocess((v) => (v === null ? "" : v), z.string().trim().max(max).optional());

export const zNum = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : typeof v === "string" ? Number(v) : v),
  z.number().finite().optional()
);
export const zMoney = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : typeof v === "string" ? Number(v) : v),
  z.number().finite().min(0).max(1e11).optional()
);
export const zPercent = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z.number().min(0).max(100).optional()
);

export const zDate = z.preprocess(
  (v) => (v === "" || v === undefined ? undefined : v === null ? null : new Date(v as string)),
  z.date().nullable().optional()
);

export const zBool = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean().optional());

export const zEmail = z.preprocess(emptyToUndef, z.email("Invalid email").max(200).optional());
export const zPhone = z.string().trim().min(6, "Invalid phone").max(20).regex(/^[+\d\s()-]+$/, "Invalid phone");
export const zOptPhone = z.preprocess(emptyToUndef, zPhone.optional());

export const zEnum = <T extends readonly [string, ...string[]]>(vals: T) => z.enum(vals);
export const zOptEnum = <T extends readonly [string, ...string[]]>(vals: T) =>
  z.preprocess(emptyToUndef, z.enum(vals).optional());

export const zTags = z.array(z.string().trim().max(50)).max(30).optional();

export const zLocation = z
  .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
  .nullable()
  .optional();

export const zLineItem = z.preprocess(aliasId, z.object({
  _id: zId.optional(),
  section: zText(100),
  category: zText(50),
  material: zRef,
  description: zStr(500),
  specification: zText(1000),
  hsn: zText(20),
  unit: z.string().trim().max(20).default("nos"),
  qty: z.coerce.number().min(0).max(1e7).default(1),
  rate: z.coerce.number().min(0).max(1e10).default(0),
  gstRate: z.coerce.number().min(0).max(28).default(0),
}));
export type LineItemInput = z.infer<typeof zLineItem>;
