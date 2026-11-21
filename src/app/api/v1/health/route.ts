import { access, constants, mkdir } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { connection } from "next/server";
import { connectDB } from "@/server/db";
import { env } from "@/server/env";

/** Liveness/readiness probe for Docker, Jenkins and uptime monitors. 503 if MongoDB or the upload folder is unusable. */
export async function GET() {
  await connection();
  let db = "down";
  try {
    await connectDB();
    db = mongoose.connection.readyState === 1 ? "up" : "down";
  } catch {
    db = "down";
  }
  let uploads = "writable";
  try {
    const dir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.uploadDir);
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
  } catch {
    uploads = "not writable";
  }
  const healthy = db === "up" && uploads === "writable";
  return Response.json(
    { status: healthy ? "ok" : "degraded", db, uploads, time: new Date().toISOString(), version: "v1" },
    { status: healthy ? 200 : 503 }
  );
}
