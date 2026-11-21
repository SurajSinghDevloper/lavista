import "server-only";
import mongoose from "mongoose";
import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { can, type Permission } from "@/lib/permissions";
import { connectDB } from "./db";
import { env } from "./env";
import { getAuthUser, type AuthUser } from "./auth";
import { memoryRateLimit } from "./rate-limit";

/* --------------------------------- Errors -------------------------------- */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "ERROR",
    public details?: unknown
  ) {
    super(message);
  }
}
export const badRequest = (m = "Bad request", d?: unknown) => new ApiError(400, m, "BAD_REQUEST", d);
export const unauthorized = (m = "Authentication required") => new ApiError(401, m, "UNAUTHORIZED");
export const forbidden = (m = "You do not have permission to perform this action") =>
  new ApiError(403, m, "FORBIDDEN");
export const notFound = (m = "Not found") => new ApiError(404, m, "NOT_FOUND");
export const conflict = (m = "Conflict") => new ApiError(409, m, "CONFLICT");
export const tooMany = (m = "Too many requests, please try again later") => new ApiError(429, m, "RATE_LIMITED");

/* -------------------------------- Responses ------------------------------ */
export type Meta = { page?: number; limit?: number; total?: number; pages?: number; [k: string]: unknown };

export function ok(data: unknown, init: { status?: number; meta?: Meta; headers?: HeadersInit } = {}) {
  return NextResponse.json(
    { success: true, data, ...(init.meta ? { meta: init.meta } : {}) },
    { status: init.status ?? 200, headers: init.headers }
  );
}

export function created(data: unknown) {
  return ok(data, { status: 201 });
}

function errorResponse(e: unknown) {
  if (e instanceof ApiError) {
    return NextResponse.json(
      { success: false, error: { code: e.code, message: e.message, details: e.details } },
      { status: e.status }
    );
  }
  if (e instanceof ZodError) {
    const details = e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    const first = details[0];
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: first ? `${first.path ? first.path + ": " : ""}${first.message}` : "Invalid input",
          details,
        },
      },
      { status: 422 }
    );
  }
  if (e instanceof mongoose.Error.ValidationError) {
    const details = Object.values(e.errors).map((er) => ({ path: er.path, message: er.message }));
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: details[0]?.message ?? "Invalid", details } },
      { status: 422 }
    );
  }
  if (e instanceof mongoose.Error.CastError) {
    return NextResponse.json(
      { success: false, error: { code: "BAD_REQUEST", message: `Invalid value for ${e.path}` } },
      { status: 400 }
    );
  }
  const anyErr = e as { code?: number; keyValue?: Record<string, unknown> };
  if (anyErr?.code === 11000) {
    const field = Object.keys(anyErr.keyValue ?? {})[0] ?? "field";
    return NextResponse.json(
      { success: false, error: { code: "DUPLICATE", message: `A record with this ${field} already exists` } },
      { status: 409 }
    );
  }
  console.error("[api] unhandled error", e);
  return NextResponse.json(
    { success: false, error: { code: "SERVER_ERROR", message: "Something went wrong. Please try again." } },
    { status: 500 }
  );
}

/* ------------------------------ Input helpers ---------------------------- */
/** Remove keys starting with `$` or containing `.` (NoSQL operator injection). */
export function stripDollarKeys<T>(input: T): T {
  if (Array.isArray(input)) return input.map((v) => stripDollarKeys(v)) as T;
  if (input && typeof input === "object" && !(input instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (k.startsWith("$") || k.includes(".") || k === "__proto__" || k === "constructor") continue;
      out[k] = stripDollarKeys(v);
    }
    return out as T;
  }
  return input;
}

export async function readJson(req: NextRequest): Promise<unknown> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 2 * 1024 * 1024) throw new ApiError(413, "Request body too large", "PAYLOAD_TOO_LARGE");
  try {
    const text = await req.text();
    if (!text) return {};
    return stripDollarKeys(JSON.parse(text));
  } catch {
    throw badRequest("Invalid JSON body");
  }
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  return schema.parse(await readJson(req));
}

export function isObjectId(v: unknown): v is string {
  return typeof v === "string" && mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(v);
}

export function assertId(id: string | undefined, name = "id"): string {
  if (!isObjectId(id)) throw badRequest(`Invalid ${name}`);
  return id;
}

export function clientIp(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/* ------------------------------ CORS & CSRF ------------------------------ */
function allowedOrigins(req: NextRequest) {
  const self = req.nextUrl.origin;
  return new Set([self, env.appUrl, ...env.corsOrigins]);
}

export function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins(req).has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Type, X-Device-Name",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function checkCsrf(req: NextRequest, viaCookie: boolean) {
  if (!viaCookie) return; // Bearer tokens (mobile) are not subject to CSRF
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin") || (req.headers.get("referer") ? new URL(req.headers.get("referer")!).origin : null);
  if (!origin || !allowedOrigins(req).has(origin)) {
    throw forbidden("Cross-site request blocked");
  }
}

/* ------------------------------ Route wrapper ---------------------------- */
export type Params = Record<string, string>;
export type Ctx = {
  req: NextRequest;
  user: AuthUser;
  params: Params;
  ip: string;
};
export type PublicCtx = Omit<Ctx, "user"> & { user: AuthUser | null };

type RouteContext = { params: Promise<Record<string, string | string[]>> };

type Opts = {
  /** Required permission(s). Omit for "any logged-in user". */
  perm?: Permission | Permission[];
  /** Per-user request budget for this route (in-memory). */
  rate?: { limit: number; windowSec: number };
};

async function resolveParams(context?: RouteContext): Promise<Params> {
  const raw = (await context?.params) ?? {};
  const out: Params = {};
  for (const [k, v] of Object.entries(raw)) out[k] = Array.isArray(v) ? v.join("/") : v;
  return out;
}

function finalize(req: NextRequest, res: Response) {
  for (const [k, v] of Object.entries(corsHeaders(req))) res.headers.set(k, v);
  return res;
}

/** Authenticated API route. */
export function api(opts: Opts, handler: (ctx: Ctx) => Promise<unknown>) {
  return async (req: NextRequest, context?: RouteContext) => {
    try {
      const auth = await getAuthUser(req);
      if (!auth) throw unauthorized();
      checkCsrf(req, auth.viaCookie);
      if (opts.perm && !can(auth.user.permissions, opts.perm)) throw forbidden();
      const limit = opts.rate ?? { limit: 600, windowSec: 300 };
      if (!memoryRateLimit(`u:${auth.user.id}:${req.nextUrl.pathname}:${req.method}`, limit.limit, limit.windowSec)) {
        throw tooMany();
      }
      await connectDB();
      const result = await handler({ req, user: auth.user, params: await resolveParams(context), ip: clientIp(req) });
      return finalize(req, result instanceof Response ? result : ok(result));
    } catch (e) {
      unstable_rethrow(e); // let Next.js internal signals (prerender bail-out, redirects) propagate
      return finalize(req, errorResponse(e));
    }
  };
}

/** Public API route (login, webhooks). Must apply its own protection. */
export function publicApi(handler: (ctx: PublicCtx) => Promise<unknown>) {
  return async (req: NextRequest, context?: RouteContext) => {
    try {
      if (!memoryRateLimit(`ip:${clientIp(req)}:${req.nextUrl.pathname}`, 120, 60)) throw tooMany();
      await connectDB();
      const auth = await getAuthUser(req).catch(() => null);
      const result = await handler({
        req,
        user: auth?.user ?? null,
        params: await resolveParams(context),
        ip: clientIp(req),
      });
      return finalize(req, result instanceof Response ? result : ok(result));
    } catch (e) {
      unstable_rethrow(e); // let Next.js internal signals (prerender bail-out, redirects) propagate
      return finalize(req, errorResponse(e));
    }
  };
}

/** Pagination & sorting helper for list endpoints. */
export function listParams(req: NextRequest, opts: { sortable?: string[]; defaultSort?: string; maxLimit?: number } = {}) {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(opts.maxLimit ?? 200, Math.max(1, Number(sp.get("limit")) || 20));
  let sort = opts.defaultSort ?? "-createdAt";
  const requested = sp.get("sort");
  if (requested) {
    const field = requested.replace(/^-/, "");
    if ((opts.sortable ?? ["createdAt", "updatedAt"]).includes(field)) sort = requested;
  }
  const q = (sp.get("q") || "").trim().slice(0, 100);
  return { page, limit, skip: (page - 1) * limit, sort, q, sp };
}

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
