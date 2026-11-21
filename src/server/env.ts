function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  get mongoUri() {
    return required("MONGODB_URI");
  },
  get jwtSecret() {
    const s = required("JWT_ACCESS_SECRET");
    if (process.env.NODE_ENV === "production" && s.length < 32) {
      throw new Error("JWT_ACCESS_SECRET must be at least 32 characters in production");
    }
    return new TextEncoder().encode(s);
  },
  accessTtlMin: Number(process.env.ACCESS_TOKEN_TTL_MIN || 15),
  refreshTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30),
  appUrl: process.env.APP_URL || "http://localhost:3000",
  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR || "./storage/uploads",
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 25) * 1024 * 1024,
  leadWebhookKey: process.env.LEAD_WEBHOOK_KEY || "",
  metaVerifyToken: process.env.META_VERIFY_TOKEN || "",
  metaAppSecret: process.env.META_APP_SECRET || "",
  metaPageAccessToken: process.env.META_PAGE_ACCESS_TOKEN || "",
  isProd: process.env.NODE_ENV === "production",
};
