/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Usage:
 *   npm run seed          → admin user + master data (materials, checklist templates)
 *   npm run seed -- --demo → also demo team, vendors, contractors, leads and sites
 */
import { existsSync } from "node:fs";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
else if (existsSync(".env")) process.loadEnvFile(".env");

const demo = process.argv.includes("--demo");

async function main() {
  const { connectDB } = await import("../src/server/db");
  const M = await import("../src/server/models");
  const { nextNumber } = await import("../src/server/services/numbering");
  await connectDB();
  console.log("Connected to", mongoose.connection.name);

  /* ------------------------------- Admin ------------------------------- */
  const email = (process.env.ADMIN_EMAIL || "admin@lavista.in").toLowerCase();
  let admin = await M.User.findOne({ email });
  if (!admin) {
    admin = await M.User.create({
      name: process.env.ADMIN_NAME || "LA-VISTA Admin",
      email,
      phone: "9000000000",
      passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || "Admin@12345", 12),
      role: "admin",
      designation: "Founder & Principal Designer",
      department: "management",
    });
    console.log(`✔ Admin created: ${email}`);
  } else console.log(`• Admin exists: ${email}`);

  /* --------------------------- Material catalog ------------------------ */
  const materials = [
    ["PLY-BWP-18", "BWP Plywood 18mm (8x4)", "plywood", "sheet", 3200],
    ["PLY-BWP-12", "BWP Plywood 12mm (8x4)", "plywood", "sheet", 2400],
    ["PLY-MR-18", "MR Plywood 18mm (8x4)", "plywood", "sheet", 2300],
    ["PLY-6", "Plywood 6mm (8x4)", "plywood", "sheet", 1100],
    ["MDF-18", "HDHMR Board 18mm (8x4)", "plywood", "sheet", 2600],
    ["LAM-1MM", "Laminate 1mm (8x4)", "laminate", "sheet", 1400],
    ["LAM-08", "Liner Laminate 0.8mm", "laminate", "sheet", 650],
    ["EDGE-BAND", "Edge Band Tape 22mm", "laminate", "rft", 6],
    ["HNG-SC", "Soft Close Hinge", "hardware", "nos", 180],
    ["CHN-TEL", "Telescopic Channel 18\"", "hardware", "set", 450],
    ["HNDL-PRF", "Profile Handle", "hardware", "rft", 220],
    ["TANDEM", "Tandem Box Drawer Set", "hardware", "set", 3800],
    ["FEVICOL", "Fevicol SH (5kg)", "adhesive", "nos", 1250],
    ["SCREW-BOX", "Screws Box (assorted)", "adhesive", "box", 350],
    ["WIRE-1.5", "Copper Wire 1.5 sq.mm (90m)", "electrical", "roll", 1650],
    ["WIRE-2.5", "Copper Wire 2.5 sq.mm (90m)", "electrical", "roll", 2600],
    ["SW-MOD", "Modular Switch", "electrical", "nos", 95],
    ["LED-PANEL", "LED Panel Light 12W", "lighting", "nos", 420],
    ["PROFILE-LED", "LED Strip Profile Light", "lighting", "rft", 260],
    ["CPVC-1", "CPVC Pipe 1\"", "plumbing", "nos", 380],
    ["GYP-BOARD", "Gypsum Board 12.5mm", "gypsum", "sheet", 520],
    ["GI-CHANNEL", "GI Ceiling Channel", "gypsum", "nos", 140],
    ["PUTTY", "Wall Putty (40kg)", "paint", "bag", 900],
    ["PAINT-EMUL", "Interior Emulsion (20L)", "paint", "nos", 5200],
    ["TILE-600", "Vitrified Tile 600x600", "tiles", "box", 950],
  ] as const;
  for (const [code, name, category, unit, rate] of materials) {
    await M.Material.updateOne(
      { code },
      { $setOnInsert: { code, name, category, unit, defaultRate: rate, gstRate: 18, minStock: unit === "sheet" ? 10 : 0 } },
      { upsert: true }
    );
  }
  console.log(`✔ ${materials.length} materials ensured`);

  /* ------------------------ QC checklist templates --------------------- */
  const templates: [string, string, string[]][] = [
    ["Pre-execution handover check", "other", [
      "Final 2D layout approved & signed by client",
      "Final 3D renders approved",
      "Elevations / working drawings issued to site",
      "Working quotation approved",
      "Booking advance received",
      "Site measurements re-verified before production",
      "Contractors briefed with drawings",
    ]],
    ["Carpentry QC", "carpentry", [
      "Material as per specification (BWP/MR, thickness)",
      "Carcass dimensions match working drawing",
      "Edge banding on all exposed edges",
      "Hinges & channels soft-close working",
      "Shutters aligned, equal gaps",
      "Laminate without scratches / bubbles",
      "Handles fixed at correct height",
      "Internal cleaning done",
    ]],
    ["Electrical QC", "electrical", [
      "Points as per electrical layout",
      "Wire gauge as per load (1.5 / 2.5 / 4 sq.mm)",
      "Earthing provided",
      "Switch boards levelled",
      "MCB / DB labelled",
      "All lights & sockets tested",
    ]],
    ["Plumbing QC", "plumbing", [
      "Pressure test done for 24 hours",
      "Slope for drainage checked",
      "No leakage at joints",
      "Hot & cold lines as per layout",
      "Fixtures fixed & sealed",
    ]],
    ["False ceiling QC", "false_ceiling", [
      "Level checked with laser",
      "Light cut-outs as per RCP",
      "Joints taped & finished",
      "AC / access panels provided",
    ]],
    ["Site handover checklist", "other", [
      "Snag list closed",
      "Deep cleaning completed",
      "All keys handed over",
      "Warranty cards & manuals handed over",
      "Final photos taken",
      "Final bill shared",
      "Client sign-off received",
    ]],
  ];
  for (const [name, trade, items] of templates) {
    await M.Checklist.updateOne(
      { name, isTemplate: true },
      { $setOnInsert: { name, trade, isTemplate: true, items: items.map((text) => ({ text })), createdBy: admin._id } },
      { upsert: true }
    );
  }
  console.log(`✔ ${templates.length} checklist templates ensured`);

  if (!demo) {
    console.log("\nDone. Run with --demo to add sample data.");
    return mongoose.disconnect();
  }

  /* -------------------------------- Demo -------------------------------- */
  const pw = await bcrypt.hash("Team@12345", 12);
  const team = [
    ["Rohan Mehta", "manager@lavista.in", "manager", "Project Manager", "management"],
    ["Priya Sharma", "designer@lavista.in", "designer", "Interior Designer", "design"],
    ["Amit Verma", "designer2@lavista.in", "designer", "3D Visualizer", "design"],
    ["Sourav Das", "supervisor@lavista.in", "supervisor", "Site Supervisor", "site"],
    ["Neha Gupta", "accounts@lavista.in", "accountant", "Accountant", "accounts"],
    ["Ravi Kumar", "store@lavista.in", "store", "Factory In-charge", "factory"],
    ["Anjali Singh", "office@lavista.in", "staff", "Sales Coordinator", "sales"],
  ] as const;
  const U: Record<string, any> = {};
  for (const [name, mail, role, designation, department] of team) {
    U[role + (U[role] ? "2" : "")] =
      (await M.User.findOne({ email: mail })) ??
      (await M.User.create({ name, email: mail, passwordHash: pw, role, designation, department, phone: "9" + Math.floor(100000000 + Math.random() * 899999999) }));
  }
  console.log("✔ Demo team (password: Team@12345)");

  if (await M.Lead.countDocuments()) {
    console.log("• Leads exist – skipping demo business data");
    return mongoose.disconnect();
  }

  const vendors = await M.Vendor.insertMany([
    { vendorNo: await nextNumber("VEN"), name: "Shree Ply & Laminates", contactPerson: "Mahesh", phone: "9811111111", categories: ["plywood", "laminate"], city: "Kolkata", paymentTerms: "15 days credit" },
    { vendorNo: await nextNumber("VEN"), name: "Hettich Hardware Point", contactPerson: "Rajesh", phone: "9822222222", categories: ["hardware"], city: "Kolkata" },
    { vendorNo: await nextNumber("VEN"), name: "Bright Electricals", contactPerson: "Sunil", phone: "9833333333", categories: ["electrical", "lighting"], city: "Kolkata" },
  ]);
  const contractors = await M.Contractor.insertMany([
    { contractorNo: await nextNumber("CON"), name: "Babu Carpentry Works", trade: "carpentry", phone: "9844444444", teamSize: 6, rateType: "per_sqft", rate: 450 },
    { contractorNo: await nextNumber("CON"), name: "Ramesh Electricals", trade: "electrical", phone: "9855555555", teamSize: 3, rateType: "per_point", rate: 350 },
    { contractorNo: await nextNumber("CON"), name: "Jamal Plumbing", trade: "plumbing", phone: "9866666666", teamSize: 2, rateType: "lumpsum" },
    { contractorNo: await nextNumber("CON"), name: "Sharma POP & Ceiling", trade: "false_ceiling", phone: "9877777777", teamSize: 4, rateType: "per_sqft", rate: 85 },
  ]);

  const day = (n: number) => new Date(Date.now() + n * 86400000);
  const leadsData = [
    { name: "Arjun Kapoor", phone: "9700000001", city: "Kolkata", source: "meta_ads", status: "new", priority: "hot", propertyType: "apartment", propertyConfig: "3bhk", budget: 1200000, scope: ["full_home"] },
    { name: "Sneha Roy", phone: "9700000002", city: "Kolkata", source: "website", status: "follow_up", priority: "warm", propertyType: "apartment", propertyConfig: "2bhk", budget: 600000, scope: ["kitchen", "wardrobe"] },
    { name: "Vikram Jain", phone: "9700000003", city: "Howrah", source: "referral", status: "site_visit_scheduled", priority: "hot", propertyType: "villa", propertyConfig: "4bhk", budget: 3500000, scope: ["full_home"] },
    { name: "Meera Banerjee", phone: "9700000004", city: "Kolkata", source: "instagram", status: "design_quotation", priority: "warm", propertyType: "apartment", propertyConfig: "3bhk", budget: 1500000, scope: ["full_home"] },
    { name: "Karan Malhotra", phone: "9700000005", city: "Salt Lake", source: "google", status: "lost", priority: "cold", lostReason: "Budget mismatch", propertyType: "office", budget: 800000, scope: ["commercial"] },
  ];
  const leads = [];
  for (const l of leadsData) {
    leads.push(await M.Lead.create({ ...l, leadNo: await nextNumber("LD"), assignedTo: U.staff._id, createdBy: admin._id, nextFollowUpAt: ["new", "follow_up"].includes(l.status) ? day(1) : undefined }));
  }
  await M.FollowUp.insertMany([
    { lead: leads[0]._id, type: "call", scheduledAt: day(0), purpose: "First call – understand requirement", assignedTo: U.staff._id, createdBy: admin._id },
    { lead: leads[1]._id, type: "whatsapp", scheduledAt: day(1), purpose: "Share kitchen catalogue", assignedTo: U.staff._id, createdBy: admin._id },
  ]);
  await M.SiteVisit.create({ lead: leads[2]._id, scheduledAt: day(2), visitedBy: [U.designer._id, U.supervisor._id], address: "Villa 12, Green Park, Howrah", createdBy: admin._id });

  // Converted lead → client + site in execution
  const wonLead = await M.Lead.create({ leadNo: await nextNumber("LD"), name: "Ananya Sen", phone: "9700000006", city: "Kolkata", source: "referral", status: "won", propertyType: "apartment", propertyConfig: "3bhk", budget: 1800000, scope: ["full_home"], assignedTo: U.staff._id, createdBy: admin._id, convertedAt: day(-40) });
  const client = await M.Client.create({ clientNo: await nextNumber("CL"), name: "Ananya Sen", phone: "9700000006", email: "ananya@example.com", address: "Flat 5B, Lake Towers, Ballygunge", city: "Kolkata", lead: wonLead._id, createdBy: admin._id });
  const value = 1650000;
  const project = await M.Project.create({
    projectNo: await nextNumber("PRJ"),
    name: "Sen Residence – 3BHK Ballygunge",
    client: client._id,
    lead: wonLead._id,
    siteAddress: "Flat 5B, Lake Towers, Ballygunge",
    city: "Kolkata",
    propertyType: "apartment",
    propertyConfig: "3bhk",
    areaSqft: 1450,
    scope: ["full_home"],
    stage: "execution",
    stageHistory: [
      { stage: "design_2d", at: day(-40), by: admin._id, note: "Converted from lead" },
      { stage: "design_3d", at: day(-32), by: U.designer._id, note: "2D layout finalised" },
      { stage: "elevation", at: day(-24), by: U.designer._id, note: "3D finalised" },
      { stage: "quotation", at: day(-20), by: U.designer._id },
      { stage: "contractor_selection", at: day(-15), by: U.manager._id },
      { stage: "procurement", at: day(-12), by: U.manager._id },
      { stage: "execution", at: day(-8), by: U.supervisor._id },
    ],
    status: "active",
    startDate: day(-40),
    expectedEndDate: day(45),
    contractValue: value,
    budget: 1150000,
    progress: 35,
    manager: U.manager._id,
    designer: U.designer._id,
    supervisor: U.supervisor._id,
    members: [U.designer2._id],
    paymentSchedule: [
      { name: "Booking / Design Advance", percent: 10, amount: value * 0.1, status: "paid" },
      { name: "Before Material Order (Production)", percent: 50, amount: value * 0.5, status: "paid" },
      { name: "Mid Execution", percent: 30, amount: value * 0.3, status: "due" },
      { name: "Handover", percent: 10, amount: value * 0.1, status: "upcoming" },
    ],
    createdBy: admin._id,
  });
  await M.Lead.updateOne({ _id: wonLead._id }, { $set: { client: client._id, project: project._id } });

  for (const [type, title, room, version, status, isFinal] of [
    ["layout_2d", "Furniture layout", "full_home", 1, "superseded", false],
    ["layout_2d", "Furniture layout", "full_home", 2, "approved", true],
    ["render", "Living room renders", "living", 1, "superseded", false],
    ["render", "Living room renders", "living", 2, "superseded", false],
    ["render", "Living room renders", "living", 3, "approved", true],
    ["model_3d", "Kitchen 3D", "kitchen", 1, "approved", true],
    ["elevation", "Master bedroom wardrobe elevation", "master_bedroom", 1, "approved", true],
  ] as const) {
    await M.Design.create({ project: project._id, type, title, room, version, status, isFinal, tool: type === "layout_2d" || type === "elevation" ? "autocad" : type === "render" ? "enscape" : "sketchup", createdBy: U.designer._id });
  }

  const items = [
    { section: "Kitchen", category: "carpentry", description: "Modular kitchen – base & wall units (BWP ply + laminate)", unit: "rft", qty: 22, rate: 14500 },
    { section: "Master Bedroom", category: "carpentry", description: "Sliding wardrobe 8ft with loft", unit: "sqft", qty: 72, rate: 1650 },
    { section: "Living", category: "carpentry", description: "TV unit with back panel", unit: "lumpsum", qty: 1, rate: 85000 },
    { section: "Full Home", category: "false_ceiling", description: "Gypsum false ceiling with cove", unit: "sqft", qty: 900, rate: 110 },
    { section: "Full Home", category: "electrical", description: "Electrical points & light fixtures", unit: "point", qty: 60, rate: 950 },
    { section: "Full Home", category: "painting", description: "Royale emulsion painting", unit: "sqft", qty: 3800, rate: 32 },
  ];
  const qItems = items.map((i) => ({ ...i, gstRate: 18, amount: i.qty * i.rate }));
  const subtotal = qItems.reduce((s, i) => s + i.amount, 0);
  const qid = new mongoose.Types.ObjectId();
  const quoteNo = await nextNumber("QT");
  await M.Quotation.create({ _id: qid, root: qid, quoteNo, version: 1, type: "working", title: "Sen Residence – Working Quotation", project: project._id, client: client._id, lead: wonLead._id, customerName: client.name, items: qItems.map((i) => ({ ...i, rate: i.rate * 1.08, amount: i.amount * 1.08 })), subtotal: subtotal * 1.08, taxableAmount: subtotal * 1.08, taxRate: 18, taxAmount: subtotal * 1.08 * 0.18, total: subtotal * 1.08 * 1.18, status: "superseded", createdBy: U.designer._id });
  await M.Quotation.create({ root: qid, quoteNo, version: 2, type: "working", title: "Sen Residence – Working Quotation", project: project._id, client: client._id, lead: wonLead._id, customerName: client.name, items: qItems, subtotal, taxableAmount: subtotal, taxRate: 18, taxAmount: subtotal * 0.18, total: subtotal * 1.18, status: "approved", isFinal: true, changeSummary: "Reduced kitchen rate after negotiation", approvedAt: day(-20), approvedBy: admin._id, createdBy: U.designer._id });

  await M.WorkOrder.create({ woNo: await nextNumber("WO"), project: project._id, contractor: contractors[0]._id, trade: "carpentry", scope: "All carpentry work as per working drawings", amount: 320000, status: "active", startDate: day(-8), createdBy: U.manager._id });
  await M.WorkOrder.create({ woNo: await nextNumber("WO"), project: project._id, contractor: contractors[1]._id, trade: "electrical", scope: "Electrical points & fixture installation", amount: 57000, status: "active", startDate: day(-6), createdBy: U.manager._id });

  await M.Payment.insertMany([
    { receiptNo: await nextNumber("RCPT", { fy: true }), project: project._id, client: client._id, type: "booking", amount: value * 0.1, date: day(-40), mode: "bank_transfer", receivedBy: U.accountant._id },
    { receiptNo: await nextNumber("RCPT", { fy: true }), project: project._id, client: client._id, type: "milestone", amount: value * 0.5, date: day(-14), mode: "cheque", reference: "CHQ 004512", receivedBy: U.accountant._id },
  ]);
  await M.Expense.insertMany([
    { expenseNo: await nextNumber("EXP"), project: project._id, category: "contractor_payment", contractor: contractors[0]._id, payee: contractors[0].name, amount: 100000, date: day(-5), mode: "bank_transfer", paidBy: U.accountant._id },
    { expenseNo: await nextNumber("EXP"), project: project._id, category: "transport", payee: "Tempo", amount: 3500, date: day(-7), mode: "cash", paidBy: U.supervisor._id },
    { expenseNo: await nextNumber("EXP"), category: "rent", payee: "Office landlord", amount: 45000, date: day(-10), mode: "bank_transfer", paidBy: U.accountant._id },
  ]);

  const poItems = [
    { description: "BWP Plywood 18mm (8x4)", unit: "sheet", qty: 40, rate: 3200, gstRate: 18, amount: 128000 },
    { description: "Laminate 1mm (8x4)", unit: "sheet", qty: 30, rate: 1400, gstRate: 18, amount: 42000 },
  ];
  await M.PurchaseOrder.create({ poNo: await nextNumber("PO"), vendor: vendors[0]._id, deliverTo: "factory", category: "plywood", items: poItems, subtotal: 170000, taxAmount: 30600, total: 200600, status: "ordered", expectedDate: day(2), createdBy: U.store._id, notes: "Factory stock for 3 running sites" });

  await M.Task.insertMany([
    { taskNo: await nextNumber("TSK"), title: "Kitchen carcass installation", project: project._id, category: "site", assignedTo: U.supervisor._id, contractor: contractors[0]._id, assignedBy: U.manager._id, dueDate: day(0), priority: "high", status: "in_progress", checklist: [{ text: "Check level" }, { text: "Fix base units" }, { text: "Fix wall units" }] },
    { taskNo: await nextNumber("TSK"), title: "Daily site photo update", project: project._id, category: "site", assignedTo: U.supervisor._id, assignedBy: U.manager._id, dueDate: day(0), priority: "medium", recurrence: "daily" },
    { taskNo: await nextNumber("TSK"), title: "Revise master bedroom render (client feedback)", project: project._id, category: "design", assignedTo: U.designer2._id, assignedBy: U.designer._id, dueDate: day(1), priority: "medium" },
    { taskNo: await nextNumber("TSK"), title: "Collect mid-execution payment", project: project._id, category: "accounts", assignedTo: U.accountant._id, assignedBy: admin._id, dueDate: day(3), priority: "high" },
    { taskNo: await nextNumber("TSK"), title: "Prepare quotation for Meera Banerjee", lead: leads[3]._id, category: "sales", assignedTo: U.designer._id, assignedBy: admin._id, dueDate: day(-1), priority: "urgent" },
  ]);
  await M.DailyReport.create({ project: project._id, date: day(-1), workDone: "Kitchen base units fixed. Electrical conduit work in master bedroom completed.", manpower: [{ trade: "carpentry", contractor: contractors[0]._id, count: 4 }, { trade: "electrical", contractor: contractors[1]._id, count: 2 }], issues: "Tile delivery delayed by 1 day", nextDayPlan: "Wall units fixing", progress: 35, reportedBy: U.supervisor._id });

  const tpl = await M.Checklist.findOne({ name: "Carpentry QC", isTemplate: true }).lean<any>();
  if (tpl) await M.Checklist.create({ name: "Carpentry QC – Kitchen", trade: "carpentry", project: project._id, template: tpl._id, assignedTo: U.supervisor._id, items: tpl.items.map((i: any, idx: number) => ({ text: i.text, checked: idx < 3, checkedBy: idx < 3 ? U.supervisor._id : undefined, checkedAt: idx < 3 ? day(-1) : undefined })), createdBy: U.manager._id });

  console.log("✔ Demo business data created");
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
