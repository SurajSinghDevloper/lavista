/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { LEAD_SOURCES, PROPERTY_TYPES, values } from "@/lib/constants";
import { env } from "../env";
import { ApiError, forbidden, ok, publicApi, readJson } from "../http";
import { Lead, User } from "../models";
import { audit, nextNumber, notify } from "../services/core";

function safeEqual(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

async function notifyManagers(title: string, message: string, link: string) {
  const managers = await User.find({ role: { $in: ["admin", "manager", "staff"] }, isActive: true }).select("_id").lean();
  await notify(managers.map((m: any) => m._id), { title, message, link, type: "lead" });
}

type InboundLead = {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  message?: string;
  source: string;
  sourceDetails?: string;
  propertyType?: string;
  budget?: number;
  externalId?: string;
};

/** Create (or de-duplicate by phone / external id) a lead from an external channel. */
export async function ingestLead(l: InboundLead) {
  const phone = l.phone.replace(/[^\d+]/g, "").slice(-15);
  const existing = await Lead.findOne({
    $or: [{ phone }, ...(l.externalId ? [{ externalId: l.externalId }] : [])],
    status: { $nin: ["won", "lost"] },
  });
  if (existing) {
    existing.notes = [existing.notes, `[${new Date().toLocaleString("en-IN")}] Re-enquiry via ${l.source}: ${l.message ?? ""}`].filter(Boolean).join("\n");
    await existing.save();
    return { lead: existing, duplicate: true };
  }
  const lead = await Lead.create({
    leadNo: await nextNumber("LD"),
    name: l.name.slice(0, 120),
    phone,
    email: l.email,
    city: l.city,
    notes: l.message,
    source: values(LEAD_SOURCES).includes(l.source as never) ? l.source : "other",
    sourceDetails: l.sourceDetails,
    propertyType: values(PROPERTY_TYPES).includes(l.propertyType as never) ? l.propertyType : undefined,
    budget: l.budget,
    externalId: l.externalId,
    status: "new",
    priority: "warm",
  });
  await notifyManagers("New enquiry", `${lead.name} (${lead.phone}) via ${l.source}`, `/leads/${lead._id}`);
  await audit(null, "create", "Lead", lead._id, `Lead ${lead.leadNo} received via ${l.source}`);
  return { lead, duplicate: false };
}

/* ----------------------- Website contact-form webhook -------------------- */
const websiteBody = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(20).regex(/^[+\d\s()-]+$/),
  email: z.preprocess((v) => (v === "" ? undefined : v), z.email().max(200).optional()),
  city: z.string().max(100).optional(),
  message: z.string().max(3000).optional(),
  propertyType: z.string().max(50).optional(),
  budget: z.coerce.number().min(0).max(1e10).optional(),
  source: z.string().max(30).optional(),
  utm_source: z.string().max(100).optional(),
  utm_campaign: z.string().max(100).optional(),
  page: z.string().max(300).optional(),
});

/**
 * POST /api/v1/integrations/leads
 * Header: x-api-key: <LEAD_WEBHOOK_KEY>
 */
export const websiteLead = publicApi(async ({ req }) => {
  const key = req.headers.get("x-api-key") ?? "";
  if (!env.leadWebhookKey || !safeEqual(key, env.leadWebhookKey)) throw forbidden("Invalid API key");
  const b = websiteBody.parse(await readJson(req));
  const { lead, duplicate } = await ingestLead({
    name: b.name,
    phone: b.phone,
    email: b.email,
    city: b.city,
    message: b.message,
    propertyType: b.propertyType,
    budget: b.budget,
    source: b.source ?? "website",
    sourceDetails: [b.utm_source, b.utm_campaign, b.page].filter(Boolean).join(" | ") || undefined,
  });
  return ok({ leadNo: lead.leadNo, duplicate }, { status: duplicate ? 200 : 201 });
});

/* --------------------------- Meta Lead Ads webhook ----------------------- */
/** GET – Meta subscription verification handshake. */
export const metaVerify = publicApi(async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  if (sp.get("hub.mode") === "subscribe" && env.metaVerifyToken && safeEqual(sp.get("hub.verify_token") ?? "", env.metaVerifyToken)) {
    return new Response(sp.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  throw forbidden("Verification failed");
});

async function fetchMetaLead(leadgenId: string) {
  if (!env.metaPageAccessToken) return null;
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(leadgenId)}?access_token=${encodeURIComponent(env.metaPageAccessToken)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as { field_data?: { name: string; values: string[] }[]; ad_name?: string; form_id?: string };
  const f = Object.fromEntries((data.field_data ?? []).map((x) => [x.name.toLowerCase(), x.values?.[0]]));
  return {
    name: f.full_name || f.name || [f.first_name, f.last_name].filter(Boolean).join(" ") || "Meta lead",
    phone: f.phone_number || f.phone || "",
    email: f.email,
    city: f.city,
    message: Object.entries(f)
      .filter(([k]) => !["full_name", "name", "phone_number", "phone", "email", "city", "first_name", "last_name"].includes(k))
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
    form: data.form_id,
  };
}

/** POST – Meta sends `leadgen` change events; we fetch the lead details from the Graph API. */
export const metaWebhook = publicApi(async ({ req }) => {
  if (!env.metaAppSecret) throw new ApiError(503, "Meta integration not configured", "NOT_CONFIGURED");
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + createHmac("sha256", env.metaAppSecret).update(raw).digest("hex");
  if (!safeEqual(sig, expected)) throw forbidden("Invalid signature");
  const payload = JSON.parse(raw || "{}") as any;
  let created = 0;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const id = String(change.value?.leadgen_id ?? "");
      if (!id || (await Lead.exists({ externalId: id }))) continue;
      const details = await fetchMetaLead(id);
      if (!details?.phone) continue;
      await ingestLead({ ...details, source: "meta_ads", sourceDetails: `Meta form ${details.form ?? change.value?.form_id ?? ""}`, externalId: id });
      created++;
    }
  }
  return ok({ received: true, created });
});
