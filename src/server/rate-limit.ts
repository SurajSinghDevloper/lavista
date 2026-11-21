import { RateLimit } from "./models/auth";

/* In-memory fixed window limiter – per server instance (cheap, for general API traffic). */
const buckets = new Map<string, { count: number; reset: number }>();
let lastSweep = Date.now();

export function memoryRateLimit(key: string, limit: number, windowSec: number) {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
    lastSweep = now;
  }
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowSec * 1000 });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

/* Mongo-backed limiter – shared across instances (for login / password endpoints). */
export async function dbRateLimit(key: string, limit: number, windowSec: number) {
  const now = new Date();
  const doc = await RateLimit.findOneAndUpdate(
    { _id: key, expiresAt: { $gt: now } },
    { $inc: { count: 1 } },
    { returnDocument: "after" }
  ).lean<{ count: number }>();
  if (doc) return doc.count <= limit;
  await RateLimit.updateOne(
    { _id: key },
    { $set: { count: 1, expiresAt: new Date(now.getTime() + windowSec * 1000) } },
    { upsert: true }
  );
  return true;
}

export async function resetRateLimit(key: string) {
  await RateLimit.deleteOne({ _id: key });
}
