# LA-VISTA ERP – production image (Next.js standalone output)
#
# Built and started by the Jenkinsfile, which holds every secret/setting and passes them in with
# "docker run -e …" at deploy time. Nothing secret is baked into the image.

ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- 1. dependencies (cached until package files change) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- 2. build ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- 3. runtime ----
FROM base AS runner
ENV NODE_ENV=production \
    PORT=4044 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/app/storage/uploads

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && mkdir -p /app/storage/uploads \
    && chown -R nextjs:nodejs /app/storage

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Complete sharp install (native libvips for Alpine) for image thumbnails – safety net over file tracing
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/sharp ./node_modules/sharp
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@img ./node_modules/@img

USER nextjs

EXPOSE 4044
VOLUME ["/app/storage/uploads"]

# Reports unhealthy when the app or MongoDB is down
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT}/api/v1/health" > /dev/null || exit 1

CMD ["node", "server.js"]
