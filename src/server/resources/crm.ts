/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from "mongoose";
import { z } from "zod";
import { DEFAULT_PAYMENT_SCHEDULE, FOLLOWUP_STATUS, LEAD_PRIORITY, LEAD_STATUS, SITE_VISIT_STATUS, values } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { crud } from "../crud";
import { api, assertId, badRequest, conflict, notFound, parseBody, type Ctx } from "../http";
import { Client, FileModel, FollowUp, Lead, Project, Quotation, SiteVisit, serialize } from "../models";
import { audit, nextNumber, notify, projectFilter } from "../services/core";
import { scheduleAmounts } from "../services/money";
import { getSetting } from "../services/settings";
import { aliasId, zDate, zEmail, zLocation, zMoney, zNum, zOptEnum, zOptOption, zOptPhone, zPhone, zRef, zRefs, zStr, zTags, zText } from "../validators";
import { recomputeContractValue } from "./design-quote";

const userPop = { path: "assignedTo", select: "name role" };

/* ---------------------------------- Leads -------------------------------- */
const leadBase = {
  name: zStr(120),
  phone: zPhone,
  alternatePhone: zOptPhone,
  email: zEmail,
  address: zText(500),
  city: zText(100),
  location: zLocation,
  propertyType: zOptOption,
  propertyConfig: zOptOption,
  areaSqft: zNum,
  scope: z.array(z.string().max(50)).max(20).optional(),
  budget: zMoney,
  expectedStart: zDate,
  source: zOptOption,
  sourceDetails: zText(300),
  referredBy: zText(120),
  status: zOptEnum(values(LEAD_STATUS)),
  priority: zOptEnum(values(LEAD_PRIORITY)),
  assignedTo: zRef,
  nextFollowUpAt: zDate,
  lostReason: zText(500),
  notes: zText(5000),
  tags: zTags,
};
const leadCreate = z.object(leadBase);
const leadUpdate = z.object(leadBase).partial();

function leadScope({ user }: Ctx) {
  if (can(user.permissions, "leads:all")) return {};
  const uid = new Types.ObjectId(user.id);
  return { $or: [{ assignedTo: uid }, { createdBy: uid }] };
}

export const leads = crud({
  model: Lead,
  resource: "leads",
  entity: "Lead",
  createSchema: leadCreate,
  updateSchema: leadUpdate,
  search: ["name", "phone", "email", "city", "leadNo", "address"],
  filters: { status: "list", source: "list", priority: "list", assignedTo: "id", city: "string", propertyType: "string" },
  dateField: "createdAt",
  sortable: ["createdAt", "name", "nextFollowUpAt", "budget", "status", "updatedAt"],
  populate: [userPop, { path: "createdBy", select: "name" }, { path: "client", select: "name clientNo" }, { path: "project", select: "name projectNo" }],
  numbering: { field: "leadNo", prefix: "LD" },
  ownerField: "createdBy",
  scope: leadScope,
  beforeCreate: async (data) => {
    const dup = await Lead.findOne({ phone: data.phone, status: { $nin: ["lost", "won"] } }).select("leadNo name");
    if (dup) throw conflict(`An open lead already exists for this phone (${dup.leadNo} – ${dup.name})`);
    return data;
  },
  afterCreate: async (doc, ctx) => {
    if (doc.assignedTo) {
      await notify([doc.assignedTo], { title: "New lead assigned", message: `${doc.name} (${doc.phone})`, link: `/leads/${doc._id}`, type: "lead" }, ctx.user.id);
    }
  },
  afterUpdate: async (doc, before, ctx) => {
    if (doc.assignedTo && String(doc.assignedTo) !== String(before.assignedTo ?? "")) {
      await notify([doc.assignedTo], { title: "Lead assigned to you", message: `${doc.name} (${doc.phone})`, link: `/leads/${doc._id}`, type: "lead" }, ctx.user.id);
    }
  },
  beforeDelete: async (doc) => {
    if (doc.project) throw badRequest("Converted leads cannot be deleted");
    await FollowUp.deleteMany({ lead: doc._id });
    await SiteVisit.deleteMany({ lead: doc._id, project: null });
  },
});

/* ------------------------------- Conversion ------------------------------ */
const convertSchema = z.object({
  projectName: zStr(150),
  siteAddress: zText(500),
  city: zText(100),
  startDate: zDate,
  expectedEndDate: zDate,
  manager: zRef,
  designer: zRef,
  supervisor: zRef,
  contractValue: zMoney,
  existingClient: zRef, // attach to an existing client instead of creating a new one
  gstin: zText(20),
});

/** Lead → Client + Project (site). Moves site visits / quotations along. */
export const convertLead = api({ perm: ["leads:write", "projects:write"] }, async ({ req, params, user, ip }) => {
  const id = assertId(params.id);
  const body = await parseBody(req, convertSchema);
  const lead = await Lead.findById(id);
  if (!lead) throw notFound("Lead not found");
  if (lead.project) throw conflict("Lead is already converted");

  // lead.client is set when a lead was converted before (its site was later deleted) – reuse that client
  const clientId = body.existingClient ?? lead.client;
  let client = clientId ? await Client.findById(clientId) : null;
  if (!client) {
    client = await Client.create({
      clientNo: await nextNumber("CL"),
      name: lead.name,
      phone: lead.phone,
      alternatePhone: lead.alternatePhone,
      email: lead.email,
      address: lead.address,
      city: lead.city,
      gstin: body.gstin || undefined,
      lead: lead._id,
      createdBy: user.id,
    });
  }

  const settingsSchedule = (await getSetting<{ name: string; percent: number }[]>("paymentSchedule")) ?? DEFAULT_PAYMENT_SCHEDULE;
  const value = body.contractValue ?? 0;
  const amounts = scheduleAmounts(settingsSchedule, value); // rounding difference goes to the last milestone
  const project = await Project.create({
    projectNo: await nextNumber("PRJ"),
    name: body.projectName,
    client: client._id,
    lead: lead._id,
    siteAddress: body.siteAddress || lead.address,
    city: body.city || lead.city,
    location: lead.location,
    propertyType: lead.propertyType,
    propertyConfig: lead.propertyConfig,
    areaSqft: lead.areaSqft,
    scope: lead.scope,
    startDate: body.startDate ?? new Date(),
    expectedEndDate: body.expectedEndDate,
    manager: body.manager ?? user.id,
    designer: body.designer,
    supervisor: body.supervisor,
    contractValue: value,
    stage: "design_2d",
    stageHistory: [{ stage: "design_2d", by: user.id, note: "Converted from lead" }],
    paymentSchedule: settingsSchedule.map((m, i) => ({ ...m, amount: amounts[i] })),
    createdBy: user.id,
  });

  lead.status = "won";
  lead.client = client._id;
  lead.project = project._id;
  lead.convertedAt = new Date();
  await lead.save();

  // carry pre-sales work to the site
  await SiteVisit.updateMany({ lead: lead._id, project: null }, { $set: { project: project._id } });
  await Quotation.updateMany({ lead: lead._id, project: null }, { $set: { project: project._id, client: client._id } });
  // site photos / measurement sheets / AutoCAD files taken during pre-sales show up in the site's Files tab
  const visitPhotos = (await SiteVisit.find({ lead: lead._id }).select("photos").lean<{ photos?: unknown[] }[]>()).flatMap((v) => v.photos ?? []);
  await FileModel.updateMany(
    { project: null, $or: [{ _id: { $in: visitPhotos } }, { entityType: "Lead", entityId: lead._id }] },
    { $set: { project: project._id } }
  );
  // Approved quotations that moved with the lead set the site's contract value + milestone amounts,
  // exactly as approving a site quotation does. Without any, the value typed in the form stays.
  let site = project;
  if (await Quotation.exists({ project: project._id, isFinal: true })) {
    await recomputeContractValue(project._id);
    site = (await Project.findById(project._id)) ?? project;
  }

  await audit(user, "convert", "Lead", lead._id, `Converted ${lead.name} → ${site.projectNo}`, { project: site._id, ip });
  await notify(
    [body.manager, body.designer, body.supervisor],
    { title: "New site assigned", message: `${site.projectNo} – ${site.name}`, link: `/projects/${site._id}`, type: "project" },
    user.id
  );
  return { client: serialize(client.toJSON()), project: serialize(site.toJSON()) };
});

/* ------------------------------- Follow-ups ------------------------------ */
const fuBase = {
  lead: zRef,
  project: zRef,
  type: zOptOption,
  scheduledAt: z.coerce.date(),
  status: zOptEnum(values(FOLLOWUP_STATUS)),
  purpose: zText(500),
  outcome: zText(2000),
  assignedTo: zRef,
  nextFollowUpAt: zDate, // convenience: schedule next one when completing
};

async function syncLeadFollowUp(leadId: unknown) {
  if (!leadId) return;
  const next = await FollowUp.findOne({ lead: leadId, status: "pending" }).sort("scheduledAt").select("scheduledAt").lean<any>();
  await Lead.updateOne({ _id: leadId }, { $set: { nextFollowUpAt: next?.scheduledAt ?? null } });
}

function followUpScope({ user }: Ctx) {
  if (can(user.permissions, "followups:all")) return {};
  const uid = new Types.ObjectId(user.id);
  return { $or: [{ assignedTo: uid }, { createdBy: uid }] };
}

export const followups = crud({
  model: FollowUp,
  resource: "followups",
  entity: "Follow-up",
  createSchema: z.object(fuBase).refine((d) => d.lead || d.project, "Lead or site is required"),
  updateSchema: z.object(fuBase).partial(),
  search: ["purpose", "outcome"],
  filters: { lead: "id", project: "id", status: "list", type: "list", assignedTo: "id" },
  dateField: "scheduledAt",
  sortable: ["scheduledAt", "createdAt"],
  defaultSort: "scheduledAt",
  populate: [userPop, { path: "lead", select: "name phone leadNo status" }, { path: "project", select: "name projectNo" }, { path: "createdBy", select: "name" }],
  ownerField: "createdBy",
  scope: followUpScope,
  label: (d) => d.purpose ?? "",
  beforeCreate: (data, ctx) => {
    data.assignedTo ??= ctx.user.id;
    delete data.nextFollowUpAt;
    return data;
  },
  afterCreate: async (doc, ctx) => {
    await syncLeadFollowUp(doc.lead);
    if (doc.lead) await Lead.updateOne({ _id: doc.lead, status: { $in: ["new", "contacted"] } }, { $set: { status: "follow_up" } });
    await notify([doc.assignedTo], { title: "Follow-up scheduled", message: doc.purpose ?? "", link: doc.lead ? `/leads/${doc.lead}` : "/follow-ups", type: "followup" }, ctx.user.id);
  },
  beforeUpdate: async (data, existing, ctx) => {
    const next = data.nextFollowUpAt;
    delete data.nextFollowUpAt;
    if (data.status === "done" && existing.status !== "done") {
      data.completedAt = new Date();
      if (existing.lead) {
        await Lead.updateOne({ _id: existing.lead }, { $set: { lastContactedAt: new Date() } });
        await Lead.updateOne({ _id: existing.lead, status: "new" }, { $set: { status: "contacted" } });
      }
      if (next) {
        await FollowUp.create({
          lead: existing.lead,
          project: existing.project,
          type: existing.type,
          scheduledAt: next,
          purpose: data.purpose ?? existing.purpose,
          assignedTo: existing.assignedTo,
          createdBy: ctx.user.id,
        });
      }
    }
    return data;
  },
  afterUpdate: async (doc) => syncLeadFollowUp(doc.lead),
  beforeDelete: async () => undefined,
  afterDelete: async (doc) => syncLeadFollowUp(doc.lead),
});

/* ------------------------------- Site visits ----------------------------- */
const measurement = z.preprocess(aliasId, z.object({
  _id: z.string().optional(),
  room: zText(100),
  item: zText(100),
  length: zNum,
  width: zNum,
  height: zNum,
  unit: z.enum(["ft", "in", "m", "mm", "cm"]).default("ft"),
  notes: zText(500),
}));

const svBase = {
  lead: zRef,
  project: zRef,
  scheduledAt: z.coerce.date(),
  visitedAt: zDate,
  status: zOptEnum(values(SITE_VISIT_STATUS)),
  visitedBy: zRefs,
  address: zText(500),
  location: zLocation,
  measurements: z.array(measurement).max(500).optional(),
  requirements: zText(5000),
  notes: zText(5000),
  photos: zRefs,
};

async function siteVisitScope(ctx: Ctx) {
  if (can(ctx.user.permissions, "site_visits:all")) return {};
  const ids = (await Project.find(projectFilter(ctx.user)).select("_id").lean()).map((p: any) => p._id);
  const uid = new Types.ObjectId(ctx.user.id);
  return { $or: [{ project: { $in: ids } }, { visitedBy: uid }, { createdBy: uid }] };
}

export const siteVisits = crud({
  model: SiteVisit,
  resource: "site_visits",
  entity: "Site visit",
  createSchema: z.object(svBase).refine((d) => d.lead || d.project, "Lead or site is required"),
  updateSchema: z.object(svBase).partial(),
  search: ["address", "requirements", "notes"],
  filters: { lead: "id", project: "id", status: "list", visitedBy: "id" },
  dateField: "scheduledAt",
  sortable: ["scheduledAt", "createdAt"],
  defaultSort: "-scheduledAt",
  populate: [
    { path: "visitedBy", select: "name" },
    { path: "lead", select: "name phone leadNo" },
    { path: "project", select: "name projectNo" },
    { path: "photos", select: "originalName mimeType size storageKey" },
  ],
  ownerField: "createdBy",
  scope: siteVisitScope,
  label: (d) => d.address ?? "",
  afterCreate: async (doc, ctx) => {
    if (doc.lead) await Lead.updateOne({ _id: doc.lead, status: { $nin: ["won", "lost"] } }, { $set: { status: "site_visit_scheduled" } });
    await notify(doc.visitedBy ?? [], { title: "Site visit scheduled", message: doc.address ?? "", link: doc.lead ? `/leads/${doc.lead}` : `/projects/${doc.project}`, type: "site_visit" }, ctx.user.id);
  },
  beforeUpdate: (data, existing) => {
    if (data.status === "completed" && existing.status !== "completed") data.visitedAt ??= new Date();
    return data;
  },
  afterUpdate: async (doc) => {
    if (doc.status === "completed" && doc.lead) {
      await Lead.updateOne({ _id: doc.lead, status: { $in: ["new", "contacted", "follow_up", "site_visit_scheduled"] } }, { $set: { status: "site_visit_done" } });
    }
  },
});

/* --------------------------------- Clients ------------------------------- */
const clientBase = {
  name: zStr(120),
  phone: zPhone,
  alternatePhone: zOptPhone,
  email: zEmail,
  address: zText(500),
  city: zText(100),
  gstin: zText(20),
  pan: zText(15),
  notes: zText(5000),
};

export const clients = crud({
  model: Client,
  resource: "clients",
  entity: "Client",
  createSchema: z.object(clientBase),
  updateSchema: z.object(clientBase).partial(),
  search: ["name", "phone", "email", "city", "clientNo"],
  filters: { city: "string" },
  sortable: ["createdAt", "name"],
  numbering: { field: "clientNo", prefix: "CL" },
  ownerField: "createdBy",
  beforeDelete: async (doc) => {
    if (await Project.exists({ client: doc._id })) throw badRequest("Client has sites – delete or reassign them first");
  },
});
