/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from "mongoose";
import { z } from "zod";
import { FILE_CATEGORIES, values } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { env } from "../env";
import { api, ApiError, assertId, badRequest, escapeRegex, forbidden, isObjectId, listParams, notFound, ok, parseBody } from "../http";
import {
  Client,
  Contractor,
  FileModel,
  Lead,
  Material,
  Notification,
  Project,
  PurchaseOrder,
  Quotation,
  Task,
  Vendor,
  serialize,
} from "../models";
import { accessibleProjectIds, assertProjectAccess, audit, projectFilter } from "../services/core";
import { getAllSettings, SETTING_KEYS, setSetting } from "../services/settings";
import { ALLOWED_TYPES, createThumbnail, extensionOf, fileStream, INLINE_TYPES, readFileBytes, removeFile, saveFile, sniffOk, THUMBNAIL_EXT } from "../storage";

/* ---------------------------------- Files -------------------------------- */
export const uploadFile = api({ perm: "files:write", rate: { limit: 120, windowSec: 300 } }, async ({ req, user, ip }) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Expected multipart/form-data");
  }
  const files = form.getAll("file").filter((f): f is File => typeof f !== "string");
  if (!files.length) throw badRequest("No file uploaded (field name: file)");
  if (files.length > 20) throw badRequest("Max 20 files per upload");

  const category = String(form.get("category") || "other");
  if (!values(FILE_CATEGORIES).includes(category as never)) throw badRequest("Invalid category");
  const project = form.get("project") ? String(form.get("project")) : null;
  if (project) {
    if (!isObjectId(project)) throw badRequest("Invalid project");
    await assertProjectAccess(user, project);
  }
  const entityType = form.get("entityType") ? String(form.get("entityType")).slice(0, 40) : undefined;
  const entityId = form.get("entityId") ? String(form.get("entityId")) : undefined;
  if (entityId && !isObjectId(entityId)) throw badRequest("Invalid entityId");
  const caption = form.get("caption") ? String(form.get("caption")).slice(0, 300) : undefined;

  const saved = [];
  for (const f of files) {
    const ext = extensionOf(f.name);
    const mime = ALLOWED_TYPES[ext];
    if (!mime) throw badRequest(`File type .${ext || "?"} is not allowed`);
    if (f.size > env.maxUploadBytes) throw new ApiError(413, `${f.name} exceeds ${env.maxUploadBytes / 1048576} MB`, "PAYLOAD_TOO_LARGE");
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (!sniffOk(ext, bytes.subarray(0, 64))) throw badRequest(`${f.name} content does not match its extension`);
    const storageKey = await saveFile(bytes, ext);
    const thumbKey = THUMBNAIL_EXT.has(ext) ? await createThumbnail(bytes) : null;
    const doc = await FileModel.create({
      originalName: f.name.replace(/[^\w.\- ()]/g, "_").slice(0, 200),
      storageKey,
      thumbKey: thumbKey ?? undefined,
      mimeType: mime,
      size: f.size,
      category,
      caption,
      project,
      entityType,
      entityId,
      uploadedBy: user.id,
    });
    saved.push(doc.toJSON());
  }
  await audit(user, "upload", "File", null, `Uploaded ${saved.length} file(s)`, { project, ip });
  return ok(saved, { status: 201 });
});

export const listFiles = api({ perm: "files:read" }, async ({ req, user }) => {
  const { page, limit, skip, sp } = listParams(req);
  const filter: any = {};
  const project = sp.get("project");
  if (project) {
    await assertProjectAccess(user, assertId(project, "project"));
    filter.project = new Types.ObjectId(project);
  } else if (!can(user.permissions, "files:all")) {
    const ids = await accessibleProjectIds(user);
    filter.$or = [{ uploadedBy: new Types.ObjectId(user.id) }, ...(ids ? [{ project: { $in: ids } }] : [{}])];
  }
  for (const k of ["entityType", "category"]) if (sp.get(k)) filter[k] = String(sp.get(k)).slice(0, 40);
  if (sp.get("entityId")) filter.entityId = new Types.ObjectId(assertId(sp.get("entityId")!, "entityId"));
  if (sp.get("image") === "true") filter.mimeType = /^image\//;
  const [rows, total] = await Promise.all([
    FileModel.find(filter).sort("-createdAt").skip(skip).limit(limit).populate({ path: "uploadedBy", select: "name" }).lean(),
    FileModel.countDocuments(filter),
  ]);
  return ok(serialize(rows), { meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

async function loadFileFor(user: any, id: string) {
  const f = await FileModel.findById(id).lean<any>();
  if (!f) throw notFound("File not found");
  if (f.project) await assertProjectAccess(user, f.project);
  return f;
}

/**
 * GET /files/:id/download            original (inline for images/PDF/video, attachment otherwise)
 * GET /files/:id/download?thumb=1    small WebP preview for images (created on first request for older files)
 * GET /files/:id/download?download=1 force "save as"
 */
export const downloadFile = api({ perm: "files:read", rate: { limit: 3000, windowSec: 300 } }, async ({ req, params, user }) => {
  const f = await loadFileFor(user, assertId(params.id));
  const sp = req.nextUrl.searchParams;
  let key: string = f.storageKey;
  let mime: string = f.mimeType;
  if (sp.get("thumb") === "1" && THUMBNAIL_EXT.has(extensionOf(f.storageKey))) {
    if (!f.thumbKey) {
      const bytes = await readFileBytes(f.storageKey).catch(() => null);
      const thumbKey = bytes ? await createThumbnail(bytes) : null;
      if (thumbKey) {
        await FileModel.updateOne({ _id: f._id }, { $set: { thumbKey } });
        f.thumbKey = thumbKey;
      }
    }
    if (f.thumbKey) {
      key = f.thumbKey;
      mime = "image/webp";
    }
  }
  const { stream, size } = await fileStream(key).catch(() => {
    throw notFound("File missing from storage");
  });
  const inline = sp.get("download") !== "1" && INLINE_TYPES.has(mime);
  const name = encodeURIComponent(f.originalName);
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Content-Length": String(size),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  };
  // Images/video get a locked-down sandbox. PDFs don't: a sandboxed document blocks the browser's PDF viewer.
  if (mime !== "application/pdf") {
    headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox";
  }
  return new Response(stream, { headers });
});

export const fileMeta = api({ perm: "files:read" }, async ({ params, user }) => serialize(await loadFileFor(user, assertId(params.id))));

export const updateFile = api({ perm: "files:write" }, async ({ req, params, user }) => {
  const f = await loadFileFor(user, assertId(params.id));
  const body = await parseBody(req, z.object({ caption: z.string().max(300).optional(), category: z.enum(values(FILE_CATEGORIES)).optional() }));
  await FileModel.updateOne({ _id: f._id }, { $set: body });
  return serialize(await FileModel.findById(f._id).lean());
});

export const deleteFile = api({ perm: "files:write" }, async ({ params, user, ip }) => {
  const f = await loadFileFor(user, assertId(params.id));
  if (String(f.uploadedBy) !== user.id && !can(user.permissions, "files:delete")) throw forbidden("Only the uploader or a manager can delete this file");
  await FileModel.deleteOne({ _id: f._id });
  await removeFile(f.storageKey);
  if (f.thumbKey) await removeFile(f.thumbKey);
  await audit(user, "delete", "File", f._id, `Deleted file ${f.originalName}`, { project: f.project, ip });
  return { id: String(f._id) };
});

/* ------------------------------ Notifications ---------------------------- */
export const listNotifications = api({}, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const filter: any = { user: user.id };
  if (sp.get("unread") === "true") filter.read = false;
  const limit = Math.min(100, Number(sp.get("limit")) || 30);
  const [rows, unread] = await Promise.all([
    Notification.find(filter).sort("-createdAt").limit(limit).lean(),
    Notification.countDocuments({ user: user.id, read: false }),
  ]);
  return ok(serialize(rows), { meta: { unread } });
});

export const markNotifications = api({}, async ({ req, user }) => {
  const body = await parseBody(req, z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(200).optional(), all: z.boolean().optional() }));
  const filter: any = { user: user.id, read: false };
  if (!body.all) filter._id = { $in: body.ids ?? [] };
  const r = await Notification.updateMany(filter, { $set: { read: true } });
  return { updated: r.modifiedCount };
});

/* --------------------------------- Settings ------------------------------ */
export const getSettings = api({}, async () => getAllSettings());

const settingSchemas: Record<string, z.ZodType> = {
  company: z.object({
    name: z.string().max(150),
    tagline: z.string().max(200).optional(),
    address: z.string().max(500).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    phone: z.string().max(50).optional(),
    email: z.string().max(200).optional(),
    website: z.string().max(200).optional(),
    gstin: z.string().max(20).optional(),
    pan: z.string().max(15).optional(),
    logo: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
    bank: z.object({ accountName: z.string().max(100), accountNo: z.string().max(30), ifsc: z.string().max(15), bankName: z.string().max(100), upi: z.string().max(100) }).partial().optional(),
  }),
  defaultGstRate: z.coerce.number().min(0).max(28),
  paymentSchedule: z
    .array(z.object({ name: z.string().min(1).max(150), percent: z.coerce.number().min(0).max(100) }))
    .max(20)
    .refine((a) => Math.round(a.reduce((s, m) => s + m.percent, 0)) === 100, "Percentages must add up to 100"),
  quotationTerms: z.string().max(10000),
  invoiceTerms: z.string().max(10000),
  poTerms: z.string().max(10000),
};

export const putSetting = api({ perm: "settings:write" }, async ({ req, params, user, ip }) => {
  const key = params.key;
  if (!SETTING_KEYS.includes(key)) throw notFound("Unknown setting");
  const { value } = await parseBody(req, z.object({ value: settingSchemas[key] }));
  await setSetting(key, value, user.id);
  await audit(user, "update", "Setting", null, `Updated setting ${key}`, { ip });
  return { key, value };
});

/* ------------------------------ Global search ---------------------------- */
export const globalSearch = api({ rate: { limit: 300, windowSec: 60 } }, async ({ req, user }) => {
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 60);
  if (q.length < 2) return [];
  const rx = new RegExp(escapeRegex(q), "i");
  const P = user.permissions;
  const tasks: Promise<any[]>[] = [];
  const add = (perm: string, fn: () => Promise<any[]>) => {
    if (can(P, perm as never)) tasks.push(fn());
  };
  const pf = projectFilter(user);
  add("leads:read", async () =>
    (await Lead.find({ $or: [{ name: rx }, { phone: rx }, { leadNo: rx }], ...(can(P, "leads:all") ? {} : { $and: [{ $or: [{ assignedTo: user.id }, { createdBy: user.id }] }] }) }).limit(5).select("name phone leadNo status").lean()).map((r: any) => ({ type: "Lead", id: String(r._id), title: r.name, subtitle: `${r.leadNo} · ${r.phone}`, href: `/leads/${r._id}` }))
  );
  add("projects:read", async () =>
    (await Project.find({ $and: [pf, { $or: [{ name: rx }, { projectNo: rx }, { siteAddress: rx }] }] }).limit(5).select("name projectNo city").lean()).map((r: any) => ({ type: "Site", id: String(r._id), title: r.name, subtitle: `${r.projectNo}${r.city ? " · " + r.city : ""}`, href: `/projects/${r._id}` }))
  );
  add("clients:read", async () =>
    (await Client.find({ $or: [{ name: rx }, { phone: rx }, { clientNo: rx }] }).limit(5).select("name phone clientNo").lean()).map((r: any) => ({ type: "Client", id: String(r._id), title: r.name, subtitle: `${r.clientNo} · ${r.phone}`, href: `/clients/${r._id}` }))
  );
  add("vendors:read", async () =>
    (await Vendor.find({ $or: [{ name: rx }, { phone: rx }] }).limit(4).select("name phone city").lean()).map((r: any) => ({ type: "Vendor", id: String(r._id), title: r.name, subtitle: r.phone ?? "", href: `/vendors?open=${r._id}` }))
  );
  add("contractors:read", async () =>
    (await Contractor.find({ $or: [{ name: rx }, { phone: rx }] }).limit(4).select("name phone trade").lean()).map((r: any) => ({ type: "Contractor", id: String(r._id), title: r.name, subtitle: r.trade, href: `/contractors?open=${r._id}` }))
  );
  add("quotations:read", async () =>
    (await Quotation.find({ $or: [{ quoteNo: rx }, { title: rx }, { customerName: rx }] }).limit(4).select("quoteNo title version").lean()).map((r: any) => ({ type: "Quotation", id: String(r._id), title: r.title, subtitle: `${r.quoteNo} v${r.version}`, href: `/quotations/${r._id}` }))
  );
  add("purchase_orders:read", async () =>
    (await PurchaseOrder.find({ poNo: rx }).limit(4).select("poNo total").lean()).map((r: any) => ({ type: "PO", id: String(r._id), title: r.poNo, subtitle: `₹${r.total}`, href: `/procurement/orders/${r._id}` }))
  );
  add("materials:read", async () =>
    (await Material.find({ $or: [{ name: rx }, { code: rx }] }).limit(4).select("name code stockQty unit").lean()).map((r: any) => ({ type: "Material", id: String(r._id), title: r.name, subtitle: `Stock ${r.stockQty} ${r.unit}`, href: `/inventory?open=${r._id}` }))
  );
  add("tasks:read", async () =>
    (await Task.find({ title: rx, ...(can(P, "tasks:all") ? {} : { $or: [{ assignedTo: user.id }, { assignedBy: user.id }] }) }).limit(5).select("title taskNo status").lean()).map((r: any) => ({ type: "Task", id: String(r._id), title: r.title, subtitle: `${r.taskNo} · ${r.status}`, href: `/tasks?open=${r._id}` }))
  );
  return (await Promise.all(tasks)).flat();
});
