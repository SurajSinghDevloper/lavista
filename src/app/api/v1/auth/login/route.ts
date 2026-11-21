import { z } from "zod";
import {
  clientType,
  dummyPasswordCheck,
  issueTokens,
  setAuthCookies,
  verifyPassword,
} from "@/server/auth";
import { ApiError, ok, parseBody, publicApi, tooMany } from "@/server/http";
import { User } from "@/server/models";
import { dbRateLimit, resetRateLimit } from "@/server/rate-limit";
import { audit } from "@/server/services/core";

const Body = z.object({
  email: z.string().trim().toLowerCase().min(3).max(200),
  password: z.string().min(1).max(200),
  deviceName: z.string().max(100).optional(),
});

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export const POST = publicApi(async ({ req, ip }) => {
  const body = await parseBody(req, Body);
  const ipKey = `login:ip:${ip}`;
  const idKey = `login:id:${body.email}`;
  if (!(await dbRateLimit(ipKey, 30, 15 * 60)) || !(await dbRateLimit(idKey, 10, 15 * 60))) {
    throw tooMany("Too many login attempts. Please wait 15 minutes and try again.");
  }

  // login with email OR phone
  const user = await User.findOne({ $or: [{ email: body.email }, { phone: body.email }] }).select(
    "+passwordHash +failedLogins +lockUntil"
  );
  const invalid = new ApiError(401, "Invalid email/phone or password", "INVALID_CREDENTIALS");
  if (!user) {
    await dummyPasswordCheck(body.password);
    throw invalid;
  }
  if (!user.isActive) throw new ApiError(403, "Your account has been deactivated. Please contact your admin.", "ACCOUNT_DISABLED");
  if (user.lockUntil && user.lockUntil > new Date()) {
    throw new ApiError(423, "Too many wrong passwords – this account is locked for 15 minutes. Try again later, or ask your admin to reset your password.", "ACCOUNT_LOCKED");
  }
  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    user.failedLogins = (user.failedLogins ?? 0) + 1;
    if (user.failedLogins >= MAX_FAILED) {
      user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      user.failedLogins = 0;
    }
    await user.save();
    throw invalid;
  }

  user.failedLogins = 0;
  user.lockUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();
  await resetRateLimit(idKey);

  const client = clientType(req);
  const tokens = await issueTokens(user, {
    client,
    ip,
    userAgent: req.headers.get("user-agent") ?? undefined,
    deviceName: body.deviceName ?? req.headers.get("x-device-name") ?? undefined,
  });
  await audit({ id: String(user._id), name: user.name }, "login", "User", user._id, `${client} login`, { ip });

  const profile = user.toJSON();
  if (client === "mobile") {
    // Mobile apps store tokens in secure storage and send `Authorization: Bearer`.
    return ok({
      user: profile,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });
  }
  const res = ok({ user: profile });
  setAuthCookies(res, tokens);
  return res;
});
