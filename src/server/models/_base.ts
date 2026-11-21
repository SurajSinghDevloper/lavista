/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose, { Schema, type Model, type SchemaDefinition, type SchemaOptions } from "mongoose";

export const { ObjectId } = Schema.Types;
export type AnyModel = Model<any>;

const HIDDEN = new Set(["__v", "passwordHash", "failedLogins", "lockUntil", "tokenHash", "keyHash", "storageKey", "thumbKey"]);

function transform(_doc: unknown, ret: Record<string, any>) {
  if (ret._id) ret.id = String(ret._id);
  delete ret._id;
  for (const k of HIDDEN) delete ret[k];
  return ret;
}

export function makeSchema(def: SchemaDefinition, opts: SchemaOptions = {}) {
  return new Schema(def, {
    timestamps: true,
    toJSON: { virtuals: true, transform },
    toObject: { virtuals: true, transform },
    ...opts,
  });
}

/** Register a model once (safe for Next.js hot reload). */
export function defineModel(name: string, schema: Schema): AnyModel {
  return (mongoose.models[name] as AnyModel) || mongoose.model(name, schema);
}

/** Line item used by quotations, purchase orders, invoices, work orders. */
export const LineItemSchema = new Schema(
  {
    section: { type: String, trim: true }, // room / area e.g. "Kitchen"
    category: { type: String, trim: true }, // trade e.g. carpentry
    material: { type: ObjectId, ref: "Material" },
    description: { type: String, required: true, trim: true },
    specification: { type: String, trim: true },
    hsn: { type: String, trim: true },
    unit: { type: String, default: "nos" },
    qty: { type: Number, default: 1, min: 0 },
    rate: { type: Number, default: 0, min: 0 },
    gstRate: { type: Number, default: 0, min: 0, max: 28 },
    amount: { type: Number, default: 0 },
    receivedQty: { type: Number, default: 0 }, // purchase orders only
  },
  { _id: true }
);

export const LocationSchema = new Schema({ lat: Number, lng: Number }, { _id: false });

/** Lean-JSON helper: converts _id → id recursively for lean() results. */
export function serialize<T = any>(doc: any): T {
  if (doc == null) return doc;
  if (Array.isArray(doc)) return doc.map((d) => serialize(d)) as any;
  if (doc instanceof Date) return doc as any;
  if (doc instanceof mongoose.Types.ObjectId) return String(doc) as any;
  if (typeof doc?.toJSON === "function" && doc.$__) return doc.toJSON();
  if (typeof doc === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(doc)) {
      if (HIDDEN.has(k)) continue;
      if (k === "_id") out.id = String(v);
      else out[k] = serialize(v);
    }
    return out as T;
  }
  return doc;
}
