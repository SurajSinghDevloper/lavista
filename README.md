# LA-VISTA ERP (web)

Interior-design business management for LA-VISTA — from the first enquiry to site handover and accounts.

**Stack:** Next.js 16.4 (App Router, Turbopack, Cache Components) · React 19 · TypeScript · Tailwind CSS 4 · MongoDB 8 (Mongoose 9) · Zod 4 · JWT (jose)

The UI and the future mobile app share one REST API under `/api/v1` — see [docs/API.md](docs/API.md).

---

## Quick start

```bash
cd web
cp .env.example .env.local      # then set real secrets (see below)
npm install
npm run seed                    # admin user + material catalog + QC checklist templates
npm run seed:demo               # optional: demo team, leads, a running site, POs, tasks…
npm run dev                     # http://localhost:4044
```

Default admin (from `.env.local`): `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
Demo team (with `seed:demo`), password `Team@12345`:
`manager@`, `designer@`, `designer2@`, `supervisor@`, `accounts@`, `store@`, `office@` (all `@lavista.in`).

| Script | |
| --- | --- |
| `npm run dev` | dev server on port 4044 |
| `npm run build && npm start` | production (standalone output, port 4044) |
| `npm run typecheck` / `npm run lint` | checks |
| `npm run seed` / `npm run seed:demo` | seed data (idempotent) |

### Environment (`.env.local`)

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET` | ≥ 32 random chars — `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `ACCESS_TOKEN_TTL_MIN` / `REFRESH_TOKEN_TTL_DAYS` | token lifetimes (15 min / 30 days) |
| `APP_URL` | public URL (used for CSRF origin checks) |
| `COOKIE_SECURE` | `true` = login cookies only over HTTPS (default in production); `false` while testing on plain `http://IP:port` |
| `CORS_ORIGINS` | extra browser origins allowed to call the API (native apps don't need this) |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | file storage (local disk; swap `src/server/storage.ts` for S3/R2 later) |
| `LEAD_WEBHOOK_KEY` | API key for the website enquiry form |
| `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN` | Meta Lead Ads webhook |
| `APP_TIMEZONE` | defaults to `Asia/Kolkata` (attendance dates) |

---

## What's inside (mapped to the meeting notes)

| Notes | Module |
| --- | --- |
| Lead → follow-ups → site visit (measurements, photos) | **Leads** (list + drag-drop pipeline), **Follow-ups**, **Site visits** with measurement table, GPS & photo/AutoCAD uploads |
| Designing + Quotation → Conversion | Lead **Convert** → client + site (visits & quotations move over) |
| 2D changes multiple times, final layout · 3D 2-3 times ("renders unmanageable") · Elevation | **Designs & renders**: versioned per site + type + room, client feedback per version, *Mark final* supersedes old versions and advances the site stage |
| Working quotation v1 → v2 → v3 → final | **Quotations**: room-wise items, revisions, sent / changes / approve; approval sets contract value + payment milestones; print/PDF |
| Contractor selection | **Contractors** + **Work orders** (agreed amount, paid, balance) |
| Material order with vendors, GRN categories · PO site-wise or independent · Factory part (stock, 3 sites ← 10 ply) | **Material requests → Purchase orders → GRN** (category-wise, factory or site) → **Factory stock** (weighted avg cost, issue to site / return / adjust, site consumption) |
| Task creation + allotment daily-wise, repeat until site close · office member task distribution | **Tasks**: my / team / board / workload / *daily allotment* (bulk); daily/weekly repeat stops when the site closes; checklist, photo proof, comments |
| Supervisor → track → blunder → checklist | **Daily site reports** (work, manpower, issues, photos, progress) + **QC checklists** (templates per trade, tick with who/when) |
| Bill generation of site | **Bills / invoices** (proforma, running, tax, final; CGST/SGST/IGST) |
| Payment in advance, show site-wise (A, B, C = A−B) | **Site accounts** cards: Received (A) − Spent (B) = Balance (C), outstanding, next milestone; receipts, expenses, payables |
| Website? Meta API? Map? | Website enquiry webhook, Meta Lead Ads webhook, Google Maps links for sites/visits/attendance |
| Team management | **Team** (roles & permissions), **Attendance** (GPS check-in/out), notifications, activity log, reports |

Workflow stages: Site visit → 2D → 3D → Elevation → Working quotation → Contractor selection → Procurement → Execution → Billing → Handover → Closed (several move automatically).

### Roles
`admin` (everything) · `manager` · `designer` · `supervisor` · `accountant` · `store` · `staff`.
Designers, supervisors and office staff only see sites they're assigned to. Permission map: `src/lib/permissions.ts` (also viewable in Team → *Role permissions*).

---

## Security

* Short-lived JWT access token (15 min) + **rotating refresh tokens** stored hashed; re-use of an old refresh token revokes the whole session family.
* Web: httpOnly `SameSite` cookies + Origin check on every state-changing request (CSRF). Mobile: `Authorization: Bearer`.
* bcrypt (cost 12), account lock after 5 failed logins, DB-backed login rate limits, per-user API rate limits.
* Every input validated with Zod; `$`-operator keys stripped (NoSQL injection); Mongoose `strictQuery`.
* Role + site-level data scoping enforced on the server for every list/get/update/delete.
* Uploads: extension whitelist + magic-byte sniffing, served with `nosniff` + sandbox CSP, auth-checked per site.
* Audit log of every create/update/delete/login; security headers (HSTS, X-Frame-Options, etc.).
* Role/permission changes and deactivation immediately invalidate existing tokens.

## Project layout

```
src/
  app/(app)/…         pages (thin server components → client views)
  app/api/v1/…        REST route handlers (thin → src/server/resources)
  app/print/…         printable quotation / bill / PO / receipt
  proxy.ts            optimistic auth redirect for pages (Next 16 "proxy", formerly middleware)
  server/             DB, models, auth, http wrapper, CRUD factory, services, resources (server-only)
  lib/                shared constants, permissions, API client, formatters (shareable with mobile)
  components/         UI kit, forms, data table, shell
  views/              page components per module
scripts/seed.ts       seed data
docs/API.md           API guide for the mobile app
```

## Deployment (Docker + Jenkins)

`Jenkinsfile` is the **single place for all secrets and settings** (MongoDB URI, JWT secret, keys, admin login, port). Every deploy it:

1. checks out `master`, runs `npm ci`, type-check and lint
2. builds the Docker image `lavista:<build-number>` (standalone Next.js on Node 24 Alpine — no secrets inside the image)
3. optionally seeds the database (tick **RUN_SEED** – creates the admin from `ADMIN_*`, material catalog, QC templates; safe to re-run)
4. replaces the `lavista` container on port **4044**, passing each setting with `docker run -e NAME`
5. waits for `/api/v1/health` (fails the build if the app or MongoDB is down) and keeps the last 3 images for rollback

Jenkins needs only the `GitPat` credential (GitHub token) and a NodeJS tool named `NODE_HOME`.
Uploaded files live in the Docker volume `lavista-uploads` (mounted at `/app/storage/uploads`) and survive redeploys.

Keep the GitHub repository **private** — the Jenkinsfile contains the production secrets.

When a domain + SSL is ready (e.g. nginx in front of port 4044), set in the Jenkinsfile:
`APP_URL = 'https://your-domain'` and `COOKIE_SECURE = 'true'`.

Rollback: `docker rm -f lavista` then re-run the previous image with the same `docker run` line using `lavista:<older-build>`.

Other notes: back up MongoDB daily; before running several app instances, move uploads to S3/R2 (`src/server/storage.ts`).
