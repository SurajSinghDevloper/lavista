/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Full backup of a MongoDB database into a folder of EJSON files (no mongodump needed).
 * Every document keeps its exact types (ObjectId, Date, Decimal…), and the indexes are saved too.
 *
 *   MONGODB_URI=<db to back up> npx tsx scripts/db-backup.ts <backups folder>
 *
 * Creates <backups folder>/<db>_<timestamp>/ with one <collection>.ejson per collection
 * (one document per line), plus _manifest.json (counts, indexes, sha256 of each file).
 * Restore with scripts/db-restore.ts.
 */
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import mongoose from "mongoose";

const { EJSON } = mongoose.mongo.BSON;

export function maskUri(uri: string) {
  return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, "//$1:***@");
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const root = process.argv[2];
  if (!uri || !root) throw new Error("usage: MONGODB_URI=… npx tsx scripts/db-backup.ts <backups folder>");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000, autoIndex: false });
  const db = mongoose.connection.db!;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(root, `${db.databaseName}_${stamp}`);
  mkdirSync(dir, { recursive: true });
  console.log(`Backing up ${maskUri(uri)} → ${dir}`);

  const manifest: any = { database: db.databaseName, source: maskUri(uri), startedAt: new Date().toISOString(), format: "ejson-canonical-ndjson", collections: [] };
  const infos = (await db.listCollections({}, { nameOnly: false }).toArray()) as any[];
  for (const info of infos.sort((a, b) => a.name.localeCompare(b.name))) {
    if (info.type === "view") {
      manifest.collections.push({ name: info.name, type: "view", options: info.options });
      continue;
    }
    const coll = db.collection(info.name);
    const file = join(dir, `${info.name}.ejson`);
    const out = createWriteStream(file, { encoding: "utf8" });
    let n = 0;
    for await (const doc of coll.find({}, { batchSize: 1000 })) {
      if (!out.write(EJSON.stringify(doc, { relaxed: false }) + "\n")) await new Promise<void>((r) => out.once("drain", () => r()));
      n++;
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
    const indexes = await coll.indexes();
    manifest.collections.push({ name: info.name, type: info.type ?? "collection", options: info.options ?? {}, documents: n, indexes });
    console.log(`  ${info.name.padEnd(22)} ${String(n).padStart(6)} docs`);
  }

  // verify: every line parses back and the counts match what is in the database now
  let problems = 0;
  for (const c of manifest.collections.filter((x: any) => x.type !== "view")) {
    const text = readFileSync(join(dir, `${c.name}.ejson`), "utf8");
    const lines = text.split("\n").filter(Boolean);
    lines.forEach((l) => EJSON.parse(l, { relaxed: false }));
    c.sha256 = createHash("sha256").update(text).digest("hex");
    const live = await db.collection(c.name).countDocuments();
    if (lines.length !== c.documents) {
      problems++;
      console.error(`  ✖ ${c.name}: file has ${lines.length} lines, expected ${c.documents}`);
    }
    if (live !== c.documents) console.warn(`  ! ${c.name}: ${live} docs in the database now vs ${c.documents} backed up (changed during backup)`);
  }
  manifest.finishedAt = new Date().toISOString();
  manifest.totalDocuments = manifest.collections.reduce((s: number, c: any) => s + (c.documents ?? 0), 0);
  writeFileSync(join(dir, "_manifest.json"), JSON.stringify(manifest, null, 2));
  await mongoose.disconnect();
  if (problems) throw new Error(`${problems} collection file(s) failed verification`);
  console.log(`✔ Backup complete and verified: ${manifest.collections.length} collections, ${manifest.totalDocuments} documents`);
  console.log(dir);
}

main().catch(async (e) => {
  console.error("✖", e.message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
