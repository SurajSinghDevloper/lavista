import mongoose from "mongoose";
import { connection } from "next/server";
import { connectDB } from "@/server/db";

/** Liveness/readiness probe for load balancers & uptime monitors. */
export async function GET() {
  await connection();
  let db = "down";
  try {
    await connectDB();
    db = mongoose.connection.readyState === 1 ? "up" : "down";
  } catch {
    db = "down";
  }
  return Response.json(
    { status: db === "up" ? "ok" : "degraded", db, time: new Date().toISOString(), version: "v1" },
    { status: db === "up" ? 200 : 503 }
  );
}
