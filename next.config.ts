import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker (.next/standalone/server.js)
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  serverExternalPackages: ["mongoose", "bcryptjs", "sharp"],
  // sharp's native libvips libraries (.dll / .so) are loaded at runtime and not picked up by file tracing –
  // ship the whole @img folder with the standalone server, otherwise thumbnails fail to load.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@img/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      // every page: no framing at all …
      { source: "/:path((?!api/v1/files/[^/]+/download).*)", headers: securityHeaders },
      // … except our own file previews (PDF shown inside the app's viewer) – same origin only
      {
        source: "/api/v1/files/:id/download",
        headers: securityHeaders.map((h) => (h.key === "X-Frame-Options" ? { ...h, value: "SAMEORIGIN" } : h)),
      },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
