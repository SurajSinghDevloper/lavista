/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Restores a backup made by scripts/db-backup.ts.
 *
 *   MONGODB_URI=<target db> npx tsx scripts/db-restore.ts <backup folder> [--drop]
 *
 * Refuses to touch a database that already has data unless --drop is given (drops each
 * collection in the backup before restoring it). For a non-local server, --drop also needs
 * --confirm-remote, so a production database is never overwritten by accident.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import mongoose from "mongoose";

const { EJSON } = mongoose.mongo.BSON;
const maskUri = (uri: string) => uri.replace(/\/\/([^:@/]+):([^@/]+)@/, "//$1:***@");

async function main() {
  const uri = process.env.MONGODB_URI;
  const dir = process.argv[2];
  const drop = process.argv.includes("--drop");
  if (!uri || !dir) throw new Error("usage: MONGODB_URI=… npx tsx scripts/db-restore.ts <backup folder> [--drop]");
  const local = /\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri.replace(/\/\/[^@/]+@/, "//"));
  if (drop && !local && !process.argv.includes("--confirm-remote")) throw new Error("Target is not a local server – add --confirm-remote if you really mean to overwrite it");

  const manifest = JSON.parse(readFileSync(join(dir, "_manifest.json"), "utf8"));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000, autoIndex: false });
  const db = mongoose.connection.db!;
  console.log(`Restoring ${manifest.database} (${manifest.finishedAt}) → ${maskUri(uri)}`);

  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  if (!drop) {
    for (const c of manifest.collections) {
      if (existing.has(c.name) && (await db.collection(c.name).estimatedDocumentCount()) > 0) {
        throw new Error(`Collection "${c.name}" already has data – use --drop to replace it`);
      }
    }
  }

  for (const c of manifest.collections) {
    if (c.type === "view") continue;
    if (existing.has(c.name)) await db.collection(c.name).drop();
    const options = { ...(c.options ?? {}) };
    delete options.viewOn;
    delete options.pipeline;
    await db.createCollection(c.name, options);
    const coll = db.collection(c.name);
    const lines = readFileSync(join(dir, `${c.name}.ejson`), "utf8").split("\n").filter(Boolean);
    for (let i = 0; i < lines.length; i += 1000) {
      const docs = lines.slice(i, i + 1000).map((l) => EJSON.parse(l, { relaxed: false }));
      if (docs.length) await coll.insertMany(docs, { ordered: true });
    }
    for (const ix of c.indexes ?? []) {
      if (ix.name === "_id_") continue;
      const { key, ...opts } = ix;
      delete opts.v;
      delete opts.ns;
      await coll.createIndex(key, opts);
    }
    const n = await coll.countDocuments();
    if (n !== c.documents) throw new Error(`${c.name}: restored ${n}, expected ${c.documents}`);
    console.log(`  ${c.name.padEnd(22)} ${String(n).padStart(6)} docs`);
  }
  for (const c of manifest.collections.filter((x: any) => x.type === "view")) {
    if (!existing.has(c.name)) await db.createCollection(c.name, c.options);
  }
  await mongoose.disconnect();
  console.log(`✔ Restore complete: ${manifest.totalDocuments} documents`);
}

main().catch(async (e) => {
  console.error("✖", e.message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
