/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * One-off import of the client's old Excel site tracker ("lvv site work") into LA-VISTA.
 * The JSON is produced by data-migration/tools/build_import.py.
 *
 *   MONGODB_URI=… npx tsx scripts/import-legacy-excel.ts <import_data.json>                         checks only – writes nothing
 *   MONGODB_URI=… npx tsx scripts/import-legacy-excel.ts <import_data.json> --commit --result <file>  imports + verifies
 *   MONGODB_URI=… npx tsx scripts/import-legacy-excel.ts --rollback <result file> [--commit]          removes exactly what was imported
 *
 * Safe to re-run: a marker in `settings` stops a second import. If anything fails half-way,
 * everything created so far is deleted again and the number counters are put back.
 */
import { readFileSync, writeFileSync } from "node:fs";
import mongoose from "mongoose";

const MARKER = "import:legacy-excel:lvv-site-work";
const PREFIX = { clients: "CL", projects: "PRJ", contractors: "CON", vendors: "VEN", tasks: "TSK", materialRequests: "MR", purchaseOrders: "PO" } as const;
type Coll = keyof typeof PREFIX;
const ORDER: Coll[] = ["vendors", "contractors", "clients", "projects", "tasks", "materialRequests", "purchaseOrders"];
const RESULT_NAME: Record<Coll, string> = { clients: "clients", projects: "projects", contractors: "contractors", vendors: "vendors", tasks: "tasks", materialRequests: "mrs", purchaseOrders: "pos" };

const commit = process.argv.includes("--commit");
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const maskUri = (uri: string) => uri.replace(/\/\/([^:@/]+):([^@/]+)@/, "//$1:***@");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sameName = (s: string) => new RegExp(`^\\s*${esc(s.trim())}\\s*$`, "i");
const opt = <T>(v: T) => (v === "" || v === null ? undefined : v);

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Set MONGODB_URI explicitly for this script (it does not read .env files)");
  const { connectDB } = await import("../src/server/db");
  const M: any = await import("../src/server/models");
  await connectDB();
  console.log(`Target: ${maskUri(uri)}  (database "${mongoose.connection.name}")  mode: ${commit ? "COMMIT" : "check only – nothing is written"}`);
  const rb = arg("--rollback");
  if (rb) return rollback(M, rb);
  const file = process.argv[2];
  if (!file || file.startsWith("--")) throw new Error("usage: import-legacy-excel.ts <import_data.json> [--commit --result <file>]");
  return runImport(M, JSON.parse(readFileSync(file, "utf8")));
}

/* --------------------------------- import -------------------------------- */
async function runImport(M: any, data: any) {
  const { nextNumber } = await import("../src/server/services/numbering");
  const resultFile = arg("--result");
  if (commit && !resultFile) throw new Error("--commit needs --result <file> (the record of what was created, used for rollback)");

  const admin = await M.User.findOne({ role: "admin", isActive: true }).sort({ createdAt: 1 }).select("name email");
  if (!admin) throw new Error("No active admin user found");
  if (await M.Setting.exists({ _id: MARKER })) throw new Error("This Excel has already been imported into this database (marker found in settings)");

  /* --- the JSON must be self-consistent --- */
  const keys = (list: any[]) => new Set(list.map((x) => x.key));
  const K = { clients: keys(data.clients), projects: keys(data.projects), contractors: keys(data.contractors), vendors: keys(data.vendors), mrs: keys(data.materialRequests) };
  const bad: string[] = [];
  for (const p of data.projects) if (!K.clients.has(p.clientKey)) bad.push(`site ${p.key}: unknown client`);
  for (const t of data.tasks) {
    if (!K.projects.has(t.projectKey)) bad.push(`task ${t.key}: unknown site`);
    if (t.contractorKey && !K.contractors.has(t.contractorKey)) bad.push(`task ${t.key}: unknown contractor ${t.contractorKey}`);
    if (!t.title?.trim()) bad.push(`task ${t.key}: empty title`);
  }
  for (const m of data.materialRequests) {
    if (!K.projects.has(m.projectKey)) bad.push(`MR ${m.key}: unknown site`);
    if (!m.items.length) bad.push(`MR ${m.key}: no items`);
    for (const i of m.items) if (!(i.qty > 0) || !i.description?.trim()) bad.push(`MR item ${i.key}: qty/description`);
  }
  for (const p of data.purchaseOrders) {
    if (!K.mrs.has(p.mrKey) || !K.vendors.has(p.vendorKey) || !K.projects.has(p.projectKey)) bad.push(`PO ${p.key}: broken link`);
  }
  for (const c of data.clients) if (c.phone && !/^[+\d\s()-]{6,20}$/.test(c.phone)) bad.push(`client ${c.key}: phone "${c.phone}" invalid`);
  if (bad.length) throw new Error("Import file has problems:\n  " + bad.join("\n  "));

  /* --- clashes with what is already in the database --- */
  const clashes: string[] = [];
  for (const p of data.projects) if (!p.existing && (await M.Project.exists({ name: sameName(p.name) }))) clashes.push(`A site named "${p.name}" already exists`);
  for (const c of data.clients) if (!c.existing && (await M.Client.exists({ name: sameName(c.name) }))) clashes.push(`A client named "${c.name}" already exists`);
  const reused: Record<"clients" | "projects" | "contractors" | "vendors", Record<string, any>> = { clients: {}, projects: {}, contractors: {}, vendors: {} };
  // records the team already entered: number AND name must still match exactly what the import file expects
  const pinned = async (what: string, model: any, noField: string, e: { no: string; name: string }) => {
    const doc = await model.findOne({ [noField]: e.no }).lean();
    if (!doc) clashes.push(`${what} ${e.no} (${e.name}) is no longer in the database`);
    else if (doc.name.trim().toLowerCase() !== e.name.trim().toLowerCase()) clashes.push(`${what} ${e.no} is now named "${doc.name}", expected "${e.name}"`);
    else return doc;
    return undefined;
  };
  for (const c of data.clients) {
    if (!c.existing) continue;
    const doc = await pinned("Client", M.Client, "clientNo", c.existing);
    if (doc) reused.clients[c.key] = doc;
  }
  for (const p of data.projects) {
    if (!p.existing) continue;
    const doc = await pinned("Site", M.Project, "projectNo", p.existing);
    if (!doc) continue;
    if (reused.clients[p.clientKey] && String(doc.client) !== String(reused.clients[p.clientKey]._id)) clashes.push(`Site ${p.existing.no} belongs to a different client than expected`);
    reused.projects[p.key] = doc;
  }
  for (const c of data.contractors) {
    const ex = c.existing
      ? await pinned("Contractor", M.Contractor, "contractorNo", c.existing)
      : await M.Contractor.findOne({ name: sameName(c.name) }).select("contractorNo name").lean();
    if (ex) reused.contractors[c.key] = ex;
  }
  const users: Record<string, any> = {};
  for (const [k, u] of Object.entries<any>(data.users ?? {})) {
    const found = await M.User.find({ name: sameName(u.name), role: u.role, isActive: true }).select("name role").lean();
    if (found.length !== 1) clashes.push(`Expected exactly one active ${u.role} named "${u.name}", found ${found.length}`);
    else users[k] = found[0];
  }
  for (const v of data.vendors) {
    const ex = await M.Vendor.findOne({ name: sameName(v.name) }).select("vendorNo name").lean();
    if (ex) reused.vendors[v.key] = ex;
  }
  const items = data.materialRequests.reduce((s: number, m: any) => s + m.items.length, 0);
  console.log(`Importer user: ${admin.name} <${admin.email}>`);
  console.log(
    `Plan: ${data.clients.length} clients, ${data.projects.length} sites, ${data.contractors.length - Object.keys(reused.contractors).length} new contractors` +
      ` (+${Object.keys(reused.contractors).length} existing reused), ${data.vendors.length - Object.keys(reused.vendors).length} new vendors` +
      ` (+${Object.keys(reused.vendors).length} reused), ${data.tasks.length} tasks, ${data.materialRequests.length} material requests (${items} items),` +
      ` ${data.purchaseOrders.length} purchase orders`
  );
  for (const [k, v] of Object.entries(reused.clients)) console.log(`  use existing client ${k} → ${v.clientNo} ${v.name}`);
  for (const [k, v] of Object.entries(reused.projects)) console.log(`  use existing site ${k} → ${v.projectNo} ${v.name}`);
  for (const [k, v] of Object.entries(users)) console.log(`  tasks for "${k}" → user ${v.name} (${v.role})`);
  for (const [k, v] of Object.entries(reused.contractors)) console.log(`  reuse contractor ${k} → ${v.contractorNo} ${v.name}`);
  for (const [k, v] of Object.entries(reused.vendors)) console.log(`  reuse vendor ${k} → ${v.vendorNo} ${v.name}`);
  if (clashes.length) throw new Error("Stopped – the database already has some of this data:\n  " + clashes.join("\n  "));
  if (!commit) return console.log("✔ Checks passed. Run again with --commit --result <file> to import.");

  /* --- write --- */
  const countersBefore: Record<string, number> = {};
  for (const p of Object.values(PREFIX)) countersBefore[p] = ((await M.Counter.findById(p).lean()) as any)?.seq ?? 0;
  const drawn: Record<string, number> = {};
  const num = async (c: Coll) => {
    drawn[PREFIX[c]] = (drawn[PREFIX[c]] ?? 0) + 1;
    return nextNumber(PREFIX[c]);
  };
  const created: Record<Coll, { key: string; id: string; no: string }[]> = Object.fromEntries(ORDER.map((c) => [c, []])) as any;
  const id: Record<string, Record<string, mongoose.Types.ObjectId>> = { clients: {}, projects: {}, contractors: {}, vendors: {}, mrs: {} };
  const now = new Date();
  const by = admin._id;

  const save = async (c: Coll, key: string, doc: any, noField: string, opts: { allowMissing?: string[] } = {}) => {
    try {
      await doc.validate();
    } catch (err: any) {
      if (!err?.errors) throw err;
      const real = Object.keys(err.errors).filter((p) => !(opts.allowMissing ?? []).includes(p));
      if (real.length) throw new Error(`${c} ${key}: ${real.map((p) => err.errors[p].message).join("; ")}`);
    }
    await doc.save({ validateBeforeSave: false }); // already validated above
    created[c].push({ key, id: String(doc._id), no: doc[noField] });
    return doc._id;
  };

  try {
    for (const v of data.vendors) {
      if (reused.vendors[v.key]) {
        id.vendors[v.key] = reused.vendors[v.key]._id;
        continue;
      }
      id.vendors[v.key] = await save("vendors", v.key, new M.Vendor({ vendorNo: await num("vendors"), name: v.name, categories: v.categories, notes: v.notes, isActive: true, createdBy: by }), "vendorNo");
    }
    for (const c of data.contractors) {
      if (reused.contractors[c.key]) {
        id.contractors[c.key] = reused.contractors[c.key]._id;
        continue;
      }
      id.contractors[c.key] = await save("contractors", c.key, new M.Contractor({ contractorNo: await num("contractors"), name: c.name, trade: c.trade, notes: c.notes, isActive: true, createdBy: by }), "contractorNo");
    }
    for (const c of data.clients) {
      if (reused.clients[c.key]) {
        id.clients[c.key] = reused.clients[c.key]._id; // existing client: nothing in it is changed
        continue;
      }
      id.clients[c.key] = await save(
        "clients",
        c.key,
        new M.Client({ clientNo: await num("clients"), name: c.name, phone: opt(c.phone), address: opt(c.address), city: opt(c.city), notes: c.notes, createdBy: by }),
        "clientNo",
        { allowMissing: c.phone ? [] : ["phone"] } // phone is not in the old sheet for some clients – flagged for the team to add
      );
    }
    for (const p of data.projects) {
      if (reused.projects[p.key]) {
        id.projects[p.key] = reused.projects[p.key]._id; // existing site: nothing in it is changed
        continue;
      }
      id.projects[p.key] = await save(
        "projects",
        p.key,
        new M.Project({
          projectNo: await num("projects"),
          name: p.name,
          client: id.clients[p.clientKey],
          siteAddress: opt(p.siteAddress),
          city: opt(p.city),
          propertyType: opt(p.propertyType),
          description: p.description,
          stage: p.stage,
          stageHistory: [{ stage: p.stage, at: now, by, note: "Imported from the old Excel tracker – work was already going on at site" }],
          status: p.status,
          tags: ["old-excel-import"],
          members: (p.members ?? []).map((k: string) => users[k]._id),
          createdBy: by,
        }),
        "projectNo"
      );
    }
    for (const t of data.tasks) {
      await save(
        "tasks",
        t.key,
        new M.Task({
          taskNo: await num("tasks"),
          title: t.title,
          description: t.description,
          project: id.projects[t.projectKey],
          category: t.category,
          contractor: t.contractorKey ? id.contractors[t.contractorKey] : undefined,
          assignedTo: t.userKey ? users[t.userKey]._id : undefined,
          assignedBy: by,
          status: t.status,
          priority: "medium",
        }),
        "taskNo"
      );
    }
    for (const m of data.materialRequests) {
      id.mrs[m.key] = await save(
        "materialRequests",
        m.key,
        new M.MaterialRequest({
          mrNo: await num("materialRequests"),
          project: id.projects[m.projectKey],
          trade: opt(m.trade),
          priority: "normal",
          items: m.items.map((i: any) => ({ description: i.description, category: opt(i.category), qty: i.qty, unit: i.unit, orderedQty: i.orderedQty, issuedQty: 0, notes: i.notes })),
          status: m.status,
          notes: m.notes,
          requestedBy: by,
        }),
        "mrNo"
      );
    }
    for (const p of data.purchaseOrders) {
      await save(
        "purchaseOrders",
        p.key,
        new M.PurchaseOrder({
          poNo: await num("purchaseOrders"),
          vendor: id.vendors[p.vendorKey],
          project: id.projects[p.projectKey],
          materialRequest: id.mrs[p.mrKey],
          deliverTo: "site",
          category: opt(p.category),
          date: now,
          items: p.items.map((i: any) => ({ description: i.description, unit: i.unit, qty: i.qty, rate: 0, gstRate: 0, amount: 0 })),
          subtotal: 0,
          taxAmount: 0,
          freight: 0,
          total: 0,
          status: "ordered",
          paymentStatus: "unpaid",
          paidAmount: 0,
          notes: p.notes,
          createdBy: by,
        }),
        "poNo"
      );
    }
  } catch (e) {
    console.error("✖ Import failed – undoing everything created so far…");
    await undo(M, created, countersBefore, drawn);
    throw e;
  }

  const countersAfter: Record<string, number> = {};
  for (const p of Object.values(PREFIX)) countersAfter[p] = ((await M.Counter.findById(p).lean()) as any)?.seq ?? 0;
  const numbers: Record<string, Record<string, string>> = {};
  for (const c of ORDER) numbers[RESULT_NAME[c]] = Object.fromEntries(created[c].map((x) => [x.key, x.no]));
  for (const [k, v] of Object.entries(reused.clients)) numbers.clients[k] = `${v.clientNo} (existing)`;
  for (const [k, v] of Object.entries(reused.projects)) numbers.projects[k] = `${v.projectNo} (existing)`;
  for (const [k, v] of Object.entries(reused.contractors)) numbers.contractors[k] = `${v.contractorNo} (existing)`;
  for (const [k, v] of Object.entries(reused.vendors)) numbers.vendors[k] = `${v.vendorNo} (existing)`;
  const result = {
    marker: MARKER,
    importedAt: now.toISOString(),
    database: mongoose.connection.name,
    importer: { id: String(admin._id), name: admin.name },
    countersBefore,
    countersAfter,
    created,
    reused: Object.fromEntries(Object.entries(reused).map(([c, m]) => [c, Object.fromEntries(Object.entries(m).map(([k, v]: [string, any]) => [k, String(v._id)]))])),
    projectIds: Object.fromEntries(Object.entries(id.projects).map(([k, v]) => [k, String(v)])),
    ...numbers,
  };
  writeFileSync(resultFile!, JSON.stringify(result, null, 1));
  const summary = Object.fromEntries(ORDER.map((c) => [c, created[c].length]));
  await M.Setting.create({ _id: MARKER, value: { importedAt: now, summary, ids: Object.fromEntries(ORDER.map((c) => [c, created[c].map((x) => x.id)])) }, updatedBy: by });
  await M.AuditLog.create({
    user: by,
    userName: admin.name,
    action: "import",
    entityType: "Old Excel import",
    message: `Imported the old Excel site tracker: ${summary.projects} sites, ${summary.clients} clients, ${summary.tasks} tasks, ${summary.materialRequests} material requests, ${summary.purchaseOrders} purchase orders, ${summary.contractors} contractors, ${summary.vendors} vendors`,
    changes: summary,
  });
  console.log("✔ Imported:", summary);
  console.log(`  result (needed for rollback): ${resultFile}`);
  await verify(M, data, result);
}

/* ---------------------- re-read everything and compare ------------------- */
async function verify(M: any, data: any, result: any) {
  const ids = (c: Coll) => result.created[c].map((x: any) => new mongoose.Types.ObjectId(x.id));
  const problems: string[] = [];
  const model: Record<Coll, any> = { clients: M.Client, projects: M.Project, contractors: M.Contractor, vendors: M.Vendor, tasks: M.Task, materialRequests: M.MaterialRequest, purchaseOrders: M.PurchaseOrder };
  for (const c of ORDER) {
    const n = await model[c].countDocuments({ _id: { $in: ids(c) } });
    if (n !== result.created[c].length) problems.push(`${c}: ${n} in DB vs ${result.created[c].length} created`);
  }
  const taskIds = ids("tasks");
  const mrIds = ids("materialRequests");
  for (const p of data.projects) {
    const pid = new mongoose.Types.ObjectId(result.projectIds[p.key]);
    const want: Record<string, number> = {};
    for (const t of data.tasks.filter((t: any) => t.projectKey === p.key)) want[t.status] = (want[t.status] ?? 0) + 1;
    const got: Record<string, number> = {};
    for (const r of await M.Task.aggregate([{ $match: { project: pid, _id: { $in: taskIds } } }, { $group: { _id: "$status", n: { $sum: 1 } } }])) got[r._id] = r.n;
    if (JSON.stringify(Object.entries(want).sort()) !== JSON.stringify(Object.entries(got).sort())) problems.push(`${p.name}: task status counts ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
    const wantItems = data.materialRequests.filter((m: any) => m.projectKey === p.key).flatMap((m: any) => m.items);
    const [mi] = await M.MaterialRequest.aggregate([{ $match: { project: pid, _id: { $in: mrIds } } }, { $unwind: "$items" }, { $group: { _id: null, n: { $sum: 1 }, q: { $sum: "$items.qty" } } }]);
    const wq = wantItems.reduce((s: number, i: any) => s + i.qty, 0);
    if ((mi?.n ?? 0) !== wantItems.length || Math.abs((mi?.q ?? 0) - wq) > 1e-9) problems.push(`${p.name}: material items ${mi?.n}/${mi?.q} vs ${wantItems.length}/${wq}`);
    const tasks = await M.Task.countDocuments({ project: pid, _id: { $in: taskIds } });
    console.log(`  ${p.name.padEnd(22)} imported tasks ${String(tasks).padStart(3)} ${JSON.stringify(got)}  material items ${mi?.n ?? 0}`);
  }
  // every reference points at a real document
  const conIds = new Set((await M.Contractor.find().select("_id").lean()).map((x: any) => String(x._id)));
  for (const t of await M.Task.find({ _id: { $in: ids("tasks") }, contractor: { $ne: null } }).select("contractor").lean()) {
    if (!conIds.has(String(t.contractor))) problems.push(`task ${t._id}: contractor missing`);
  }
  const withContractor = data.tasks.filter((t: any) => t.contractorKey).length;
  const gotWithContractor = await M.Task.countDocuments({ _id: { $in: ids("tasks") }, contractor: { $ne: null } });
  if (withContractor !== gotWithContractor) problems.push(`tasks with contractor: ${gotWithContractor} vs ${withContractor}`);
  const withUser = data.tasks.filter((t: any) => t.userKey).length;
  const gotWithUser = await M.Task.countDocuments({ _id: { $in: ids("tasks") }, assignedTo: { $ne: null } });
  if (withUser !== gotWithUser) problems.push(`tasks assigned to a user: ${gotWithUser} vs ${withUser}`);
  for (const po of await M.PurchaseOrder.find({ _id: { $in: ids("purchaseOrders") } }).lean()) {
    const mr = await M.MaterialRequest.findById(po.materialRequest).lean();
    if (!mr || mr.items.length !== po.items.length || mr.status !== "ordered") problems.push(`PO ${po.poNo}: does not match its request`);
    if (!(await M.Vendor.exists({ _id: po.vendor }))) problems.push(`PO ${po.poNo}: vendor missing`);
  }
  if (problems.length) {
    console.error("✖ Verification found problems:\n  " + problems.join("\n  "));
    process.exitCode = 2;
  } else console.log("✔ Verified: every record is in the database and matches the Excel counts");
}

/* --------------------------- undo / rollback ----------------------------- */
async function undo(M: any, created: Record<Coll, { id: string }[]>, before: Record<string, number>, drawn: Record<string, number>) {
  const model: Record<Coll, any> = { clients: M.Client, projects: M.Project, contractors: M.Contractor, vendors: M.Vendor, tasks: M.Task, materialRequests: M.MaterialRequest, purchaseOrders: M.PurchaseOrder };
  for (const c of [...ORDER].reverse()) {
    const ids = created[c].map((x) => new mongoose.Types.ObjectId(x.id));
    if (ids.length) console.log(`  removed ${(await model[c].deleteMany({ _id: { $in: ids } })).deletedCount} ${c}`);
  }
  for (const [prefix, n] of Object.entries(drawn)) {
    // put the counter back only if nobody else took a number in the meantime
    const r = await M.Counter.updateOne({ _id: prefix, seq: before[prefix] + n }, { $set: { seq: before[prefix] } });
    console.log(`  counter ${prefix}: ${r.modifiedCount ? `reset to ${before[prefix]}` : "left as is (used by someone else meanwhile)"}`);
  }
}

async function rollback(M: any, file: string) {
  const r = JSON.parse(readFileSync(file, "utf8"));
  if (r.database !== mongoose.connection.name) throw new Error(`Result file is for database "${r.database}", connected to "${mongoose.connection.name}"`);
  const all = new Set<string>(ORDER.flatMap((c) => r.created[c].map((x: any) => x.id)));
  const oid = (c: Coll) => r.created[c].map((x: any) => new mongoose.Types.ObjectId(x.id));
  // anything added later in the app that points at the imported records?
  const refs = [
    ["project", oid("projects")],
    ["client", oid("clients")],
    ["contractor", oid("contractors")],
    ["manpower.contractor", oid("contractors")],
    ["vendor", oid("vendors")],
    ["preferredVendor", oid("vendors")],
    ["materialRequest", oid("materialRequests")],
    ["purchaseOrder", oid("purchaseOrders")],
  ] as const;
  const skip = new Set(["auditlogs", "notifications", "sessions", "settings", "counters", "ratelimits"]);
  const dependents: string[] = [];
  for (const { name } of await mongoose.connection.db!.listCollections({}, { nameOnly: true }).toArray()) {
    if (skip.has(name)) continue;
    for (const [field, ids] of refs) {
      if (!ids.length) continue;
      const docs = await mongoose.connection.db!.collection(name).find({ [field]: { $in: ids } }).project({ _id: 1 }).toArray();
      const extra = docs.filter((d) => !all.has(String(d._id)));
      if (extra.length) dependents.push(`${extra.length} ${name} (via ${field})`);
    }
  }
  if (dependents.length && !process.argv.includes("--force")) {
    throw new Error("Records added in the app after the import still point at imported data – not rolling back:\n  " + dependents.join("\n  ") + "\n(add --force to remove the imported records anyway)");
  }
  for (const c of ORDER) console.log(`  ${c}: ${r.created[c].length} to remove`);
  if (!commit) return console.log("Check only. Add --commit to remove them.");
  const drawn = Object.fromEntries(Object.keys(r.countersBefore).map((p) => [p, r.countersAfter[p] - r.countersBefore[p]]));
  await undo(M, r.created, r.countersBefore, drawn);
  await M.Setting.deleteOne({ _id: MARKER });
  await M.AuditLog.create({ user: r.importer.id, userName: r.importer.name, action: "rollback", entityType: "Old Excel import", message: "Removed the records created by the old Excel import" });
  console.log("✔ Rolled back");
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    console.error("✖", e.message);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
