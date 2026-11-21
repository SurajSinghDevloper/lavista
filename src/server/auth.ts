import "server-only";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import type { Role } from "@/lib/constants";
import { permissionsFor, type Permission } from "@/lib/permissions";
import { connectDB } from "./db";
import { env } from "./env";
import { Session, User } from "./models/auth";

export const COOKIE_ACCESS = "lv_at";
export const COOKIE_REFRESH = "lv_rt";
export const COOKIE_FLAG = "lv_in"; // non-sensitive "logged in" hint for the proxy

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
  sessionId: string;
};

/* -------------------------------- Passwords ------------------------------ */
export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

let dummyHash: Promise<string> | null = null;
/** Spend the same time as a real check so unknown emails can't be detected by timing. */
export async function dummyPasswordCheck(pw: string) {
  dummyHash ??= bcrypt.hash("lavista-dummy-password", 12);
  await bcrypt.compare(pw, await dummyHash);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password must contain letters and numbers";
  return null;
}

/* ------------------------------ Access tokens ---------------------------- */
type AccessClaims = { sub: string; sid: string; role: Role; tv: number };

export async function signAccessToken(c: AccessClaims) {
  return new SignJWT({ sid: c.sid, role: c.role, tv: c.tv })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(c.sub)
    .setIssuer("lavista")
    .setAudience("lavista-api")
    .setIssuedAt()
    .setExpirationTime(`${env.accessTtlMin}m`)
    .sign(env.jwtSecret);
}

async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, env.jwtSecret, {
      issuer: "lavista",
      audience: "lavista-api",
      algorithms: ["HS256"],
    });
    return {
      sub: String(payload.sub),
      sid: String(payload.sid),
      role: payload.role as Role,
      tv: Number(payload.tv ?? 0),
    };
  } catch {
    return null;
  }
}

/** Resolve the caller from `Authorization: Bearer` (mobile) or the access cookie (web). */
export async function getAuthUser(req: NextRequest): Promise<{ user: AuthUser; viaCookie: boolean } | null> {
  const header = req.headers.get("authorization");
  let token: string | undefined;
  let viaCookie = false;
  if (header?.toLowerCase().startsWith("bearer ")) token = header.slice(7).trim();
  else {
    token = req.cookies.get(COOKIE_ACCESS)?.value;
    viaCookie = !!token;
  }
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims) return null;

  await connectDB();
  const [user, session] = await Promise.all([
    User.findById(claims.sub).select("name email role isActive tokenVersion extraPermissions").lean<{
      _id: unknown;
      name: string;
      email: string;
      role: Role;
      isActive: boolean;
      tokenVersion: number;
      extraPermissions?: string[];
    }>(),
    Session.exists({ _id: claims.sid, revokedAt: null, expiresAt: { $gt: new Date() } }),
  ]);
  if (!user || !user.isActive || !session || (user.tokenVersion ?? 0) !== claims.tv) return null;

  return {
    viaCookie,
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: permissionsFor(user.role, user.extraPermissions ?? []),
      sessionId: claims.sid,
    },
  };
}

/* ----------------------------- Refresh sessions -------------------------- */
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

type SessionMeta = { client: "web" | "mobile"; userAgent?: string; ip?: string; deviceName?: string };

export async function createSession(userId: string, meta: SessionMeta, family: string = randomUUID()) {
  const refreshToken = randomBytes(48).toString("base64url");
  const session = await Session.create({
    user: userId,
    tokenHash: sha256(refreshToken),
    family,
    client: meta.client,
    userAgent: meta.userAgent?.slice(0, 300),
    ip: meta.ip,
    deviceName: meta.deviceName?.slice(0, 100),
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + env.refreshTtlDays * 86400_000),
  });
  return { refreshToken, sessionId: String(session._id) };
}

export async function issueTokens(
  user: { _id: unknown; role: Role; tokenVersion?: number },
  meta: SessionMeta,
  family?: string
) {
  const { refreshToken, sessionId } = await createSession(String(user._id), meta, family);
  const accessToken = await signAccessToken({
    sub: String(user._id),
    sid: sessionId,
    role: user.role,
    tv: user.tokenVersion ?? 0,
  });
  return { accessToken, refreshToken, sessionId, expiresIn: env.accessTtlMin * 60 };
}

/**
 * Rotate a refresh token. If an already-rotated (revoked) token is presented,
 * the whole family is revoked – a stolen token can only be used once.
 */
export async function rotateRefreshToken(refreshToken: string, meta: SessionMeta) {
  const session = await Session.findOne({ tokenHash: sha256(refreshToken) });
  if (!session) return null;
  if (session.revokedAt) {
    await Session.updateMany(
      { family: session.family, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: "refresh_token_reuse" } }
    );
    return null;
  }
  if (session.expiresAt < new Date()) return null;

  const user = await User.findById(session.user).select("role tokenVersion isActive").lean<{
    _id: unknown;
    role: Role;
    tokenVersion: number;
    isActive: boolean;
  }>();
  if (!user || !user.isActive) return null;

  session.revokedAt = new Date();
  session.revokedReason = "rotated";
  await session.save();
  return issueTokens(user, { ...meta, deviceName: meta.deviceName ?? session.deviceName }, session.family);
}

export async function revokeSession(sessionId: string, reason = "logout") {
  await Session.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });
}

export async function revokeAllSessions(userId: string, reason = "logout_all", exceptSessionId?: string) {
  await Session.updateMany(
    { user: userId, revokedAt: null, ...(exceptSessionId ? { _id: { $ne: exceptSessionId } } : {}) },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );
}

export async function revokeByRefreshToken(refreshToken: string) {
  await Session.updateOne(
    { tokenHash: sha256(refreshToken), revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: "logout" } }
  );
}

/* --------------------------------- Cookies ------------------------------- */
export function setAuthCookies(res: NextResponse, tokens: { accessToken: string; refreshToken: string }) {
  const secure = env.cookieSecure;
  res.cookies.set(COOKIE_ACCESS, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: env.accessTtlMin * 60,
  });
  res.cookies.set(COOKIE_REFRESH, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: env.refreshTtlDays * 86400,
  });
  res.cookies.set(COOKIE_FLAG, "1", {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: env.refreshTtlDays * 86400,
  });
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(COOKIE_ACCESS, "", { path: "/", maxAge: 0 });
  res.cookies.set(COOKIE_REFRESH, "", { path: "/api/v1/auth", maxAge: 0 });
  res.cookies.set(COOKIE_FLAG, "", { path: "/", maxAge: 0 });
}

export function clientType(req: NextRequest): "web" | "mobile" {
  return req.headers.get("x-client-type")?.toLowerCase() === "mobile" ? "mobile" : "web";
}
