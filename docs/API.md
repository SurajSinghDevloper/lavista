# LA-VISTA ERP – REST API (v1)

Base URL: `https://<your-domain>/api/v1`

The web app and the mobile app use **the same API**. All responses are JSON:

```jsonc
// success
{ "success": true, "data": { ... }, "meta": { "page": 1, "limit": 20, "total": 57, "pages": 3 } }
// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "phone: Invalid phone", "details": [{ "path": "phone", "message": "Invalid phone" }] } }
```

| HTTP | `error.code` | Meaning |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Malformed input / business rule violated |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `SESSION_EXPIRED` | Not logged in / token expired → refresh |
| 403 | `FORBIDDEN`, `ACCOUNT_DISABLED` | Role not allowed / not assigned to that site |
| 404 | `NOT_FOUND` | |
| 409 | `CONFLICT`, `DUPLICATE` | Duplicate (e.g. open lead with same phone) |
| 413 | `PAYLOAD_TOO_LARGE` | Upload / body too large |
| 422 | `VALIDATION_ERROR` | Field validation failed (`details[]`) |
| 423 | `ACCOUNT_LOCKED` | 5 wrong passwords → locked 15 min |
| 429 | `RATE_LIMITED` | Slow down |

Records always expose `id` (never `_id`). Sub-items (quotation lines, checklist items…) also have `id`; when you send them back, keep the `id` so the server keeps the same line.

---

## 1. Authentication (mobile)

Send header **`X-Client-Type: mobile`** on login and refresh so tokens are returned in the body (web uses httpOnly cookies instead).

```http
POST /auth/login
X-Client-Type: mobile
Content-Type: application/json

{ "email": "supervisor@lavista.in", "password": "…", "deviceName": "Pixel 8 – Sourav" }
```
`email` also accepts the registered phone number.

```json
{ "success": true, "data": { "user": { "id": "…", "name": "…", "role": "supervisor" }, "accessToken": "eyJ…", "refreshToken": "q9…", "expiresIn": 900 } }
```

* Store both tokens in secure storage (Keychain / EncryptedSharedPreferences / expo-secure-store).
* Call every endpoint with `Authorization: Bearer <accessToken>`.
* Access token lives **15 min**. On `401`, call refresh **once**, then retry:

```http
POST /auth/refresh
X-Client-Type: mobile
{ "refreshToken": "q9…" }
→ { "data": { "accessToken": "…", "refreshToken": "<NEW>", "expiresIn": 900 } }
```

**Refresh tokens rotate** – always save the new one. Re-using an old refresh token revokes the whole session family (stolen-token protection) → user must log in again. Refresh tokens live 30 days.

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/logout` `{ refreshToken }` | Log out this device |
| `POST /auth/logout-all` | Log out every device |
| `GET /auth/me` | Profile + `permissions[]` (use to show/hide screens) |
| `PATCH /auth/me` | Update own name / phone / avatar |
| `POST /auth/change-password` `{ currentPassword, newPassword }` | |
| `GET /auth/sessions` · `DELETE /auth/sessions/:id` | Logged-in devices |

`user.mustChangePassword = true` → force the change-password screen.

### Permissions
`GET /auth/me` returns e.g. `["projects:read","tasks:write",…]` (`"*"` = admin). Format `<resource>:<read|write|delete|approve|all>`. Without `<resource>:all` the user only sees records for **sites they are assigned to** (manager / designer / supervisor / member) or records they own.

---

## 2. Conventions for list endpoints

`GET /<resource>?q=&page=1&limit=20&sort=-createdAt&<filter>=<value>`

* `limit` max 200 · `sort` = field or `-field` (whitelisted per resource)
* `from` / `to` (ISO or `YYYY-MM-DD`) filter the resource's main date field
* Multiple values: `status=todo,in_progress`
* Reference filters take an id; `none` = empty (e.g. `project=none`)

Standard CRUD: `GET /x`, `POST /x`, `GET /x/:id`, `PATCH /x/:id` (partial), `DELETE /x/:id`.

---

## 3. Endpoints

### Sales
| Method & path | Notes |
| --- | --- |
| `/leads` CRUD | filters: `status, source, priority, assignedTo, city` |
| `POST /leads/:id/convert` | `{ projectName, siteAddress, contractValue, manager, designer, supervisor, existingClient? }` → creates client + site |
| `/followups` CRUD | filters `lead, project, status, assignedTo`; PATCH `{status:"done", outcome, nextFollowUpAt}` auto-schedules next |
| `/site-visits` CRUD | `measurements[] {room,item,length,width,height,unit,notes}`, `photos[]` file ids, `location {lat,lng}` |
| `/clients` CRUD | |

### Sites & design
| Method & path | Notes |
| --- | --- |
| `/projects` CRUD | filters `stage, status, client, supervisor, designer` |
| `POST /projects/:id/stage` | `{ stage, note }` – stages: `site_visit, design_2d, design_3d, elevation, quotation, contractor_selection, procurement, execution, billing, handover, closed` |
| `GET /projects/:id/summary` | finance (received/spent/balance), task counts, design status, checklist % |
| `/designs` CRUD | `type: layout_2d, model_3d, render, elevation, working_drawing`; version auto-increments per site+type+room |
| `POST /designs/:id/approve` | marks final, supersedes older versions, advances stage |
| `/quotations` CRUD | `items[] {section, category, description, unit, qty, rate}`; totals computed server-side |
| `POST /quotations/:id/revise` | creates next version (v2, v3…) |
| `POST /quotations/:id/status` | `{ status: sent | changes_requested | approved | rejected, clientFeedback }` |

### Execution
| Method & path | Notes |
| --- | --- |
| `/tasks` CRUD | `recurrence: none|daily|weekly` (re-creates itself until site closes); assignee may only change `status, checklist, files` |
| `POST /tasks/:id/comments` | `{ text, files[] }` |
| `POST /tasks/bulk` | `{ tasks: [...] }` – daily allotment |
| `GET /tasks/workload` | open / overdue / due today per member |
| `/daily-reports` CRUD | `{ project, date, workDone, manpower[], issues, nextDayPlan, progress, photos[] }` |
| `/checklists` CRUD | `isTemplate=true` for templates |
| `POST /checklists/:id/apply` | `{ project, assignedTo }` – template → site |
| `PATCH /checklists/:id/items/:itemId` | `{ checked, remark, photo }` |
| `/contractors`, `/work-orders` CRUD | work order `paidAmount` follows expenses |

### Procurement & stock
| Method & path | Notes |
| --- | --- |
| `/vendors`, `/materials` CRUD | materials `?lowStock=true` |
| `/material-requests` CRUD · `POST /:id/decide` `{action: approve|reject, reason}` | |
| `/purchase-orders` CRUD · `POST /:id/status` | no `project` = factory stock PO |
| `GET /grn` · `POST /grn` · `DELETE /grn/:id` | receiving updates PO + stock; delete reverses |
| `POST /inventory/issue` · `/inventory/return` | `{ project, items:[{material, qty}], materialRequest? }` |
| `POST /inventory/adjust` | `{ material, qty(+/-), rate, notes }` |
| `GET /inventory/ledger` · `GET /inventory/consumption?project=` | |

### Accounts
| Method & path | Notes |
| --- | --- |
| `/payments` CRUD | client receipts; updates invoice & milestone status |
| `/invoices` CRUD · `POST /:id/status` | GST split CGST/SGST or IGST (`interState`) |
| `/expenses` CRUD | link `purchaseOrder` / `workOrder` to update paid amounts |
| `GET /accounts/summary` | site-wise Received (A) − Spent (B) = Balance (C) |
| `GET /accounts/payables` | vendor & contractor dues |

### Team & system
| Method & path | Notes |
| --- | --- |
| `/users` CRUD (DELETE = deactivate) · `POST /users/:id/reset-password` | |
| `GET /users/lookup?role=` | lightweight list for pickers |
| `GET /attendance` · `POST /attendance/check-in` · `POST /attendance/check-out` · `GET /attendance/today` | send `{ location: {lat,lng}, project? }` from the phone GPS |
| `POST /files` (multipart) | fields: `file` (1–20), `category`, `project`, `entityType`, `entityId`, `caption` → returns file records; put ids into `photos[]` / `files[]` |
| `GET /files?project=&entityType=&entityId=` · `GET /files/:id/download` (`?download=1`) · `DELETE /files/:id` | download needs the Bearer header |
| `GET /notifications` (`meta.unread`) · `POST /notifications/read` `{ids}|{all:true}` | |
| `GET /dashboard` · `GET /reports?from=&to=` · `GET /search?q=` · `GET /activity?project=` | |
| `GET /settings` · `PUT /settings/:key` | |
| `GET /health` | uptime probe |

Allowed upload types: jpg, png, webp, gif, heic, pdf, dwg, dxf, skp, xlsx, xls, csv, docx, doc, pptx, zip, rar, mp4, mov, txt (max `MAX_UPLOAD_MB`, default 25 MB). Content is sniffed; renamed executables/HTML are rejected.

### Integrations (no login – key/signature protected)
| Method & path | Auth |
| --- | --- |
| `POST /integrations/leads` | header `x-api-key: <LEAD_WEBHOOK_KEY>` – website enquiry form |
| `GET/POST /integrations/meta` | Meta webhook verify token + `X-Hub-Signature-256` HMAC |
