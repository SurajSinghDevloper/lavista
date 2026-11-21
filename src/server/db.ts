import mongoose from "mongoose";
import { env } from "./env";

type Cached = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const g = globalThis as unknown as { __mongoose?: Cached };
const cached: Cached = g.__mongoose ?? (g.__mongoose = { conn: null, promise: null });

// Unknown filter keys are dropped. Operator injection ({$gt: ""}) is prevented in the
// API layer: every body/query passes zod validation + `stripDollarKeys` (see server/http.ts).
mongoose.set("strictQuery", true);

export async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(env.mongoUri, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 10_000,
      autoIndex: true,
    });
  }
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
  return cached.conn;
}
