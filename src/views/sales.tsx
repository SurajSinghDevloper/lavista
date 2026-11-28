"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowLeft, Building2, CalendarPlus, CheckCircle2, FileSpreadsheet, LocateFixed, MapPin, MessageCircle, MoreHorizontal, Pencil, Phone, Plus, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { useAuth } from "@/components/auth";
import { DataTable, ExportButton, FilterBar, Pagination, ResourcePage, SearchBox, exportCsv } from "@/components/data-table";
import { ActivityFeed, Attachments, FileLibrary, Person, ProjectLink, REF } from "@/components/domain";
import { EntitySelect, FormDrawer, FormGrid, errorsFrom, toPayload, useFormState, type Field } from "@/components/form";
import { Badge, Button, Card, Drawer, Empty, IconButton, KV, LoadError, Loading, Menu, MenuItem, Modal, PageHeader, Segmented, StatusBadge, Tabs, cx, useConfirm, useToast } from "@/components/ui";
import { invalidate, useList, useOne } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import {
  FOLLOWUP_STATUS,
  FOLLOWUP_TYPES,
  LEAD_PRIORITY,
  LEAD_SOURCES,
  LEAD_STATUS,
  PROPERTY_CONFIGS,
  PROPERTY_TYPES,
  QUOTE_STATUS,
  SITE_VISIT_STATUS,
  WORK_SCOPES,
  labelOf,
} from "@/lib/constants";
import { date, dateTime, isOverdue, mapsLink, money, relative, telLink, toInputDateTime, waLink } from "@/lib/format";
import { clientFields, followupColumns, followupFields, leadFields, projectColumns } from "./config";

/* =================================== Leads ================================ */
const leadColumns = [
  { key: "name", label: "Lead", render: (r: any) => <span><span className="font-medium">{r.name}</span><span className="block text-xs text-muted">{r.leadNo} · {r.phone}</span></span> },
  { key: "requirement", label: "Requirement", render: (r: any) => <span className="text-sm">{[labelOf(PROPERTY_CONFIGS, r.propertyConfig), labelOf(PROPERTY_TYPES, r.propertyType)].filter(Boolean).join(" ")}<span className="block text-xs text-muted">{r.city}</span></span>, hideOnMobile: true },
  { key: "budget", label: "Budget", render: (r: any) => money(r.budget), align: "right" as const },
  { key: "source", label: "Source", render: (r: any) => labelOf(LEAD_SOURCES, r.source), hideOnMobile: true },
  { key: "status", label: "Status", render: (r: any) => <StatusBadge options={LEAD_STATUS} value={r.status} /> },
  { key: "priority", label: "", render: (r: any) => <StatusBadge options={LEAD_PRIORITY} value={r.priority} /> },
  { key: "nextFollowUpAt", label: "Next follow-up", render: (r: any) => (r.nextFollowUpAt ? <span className={isOverdue(r.nextFollowUpAt) ? "text-red-600" : ""}>{dateTime(r.nextFollowUpAt)}</span> : "—"), hideOnMobile: true },
  { key: "assignedTo", label: "Owner", render: (r: any) => <Person user={r.assignedTo} />, hideOnMobile: true },
];

/** Small pencil inside a card that is itself a link – opens the edit drawer instead of the page. */
export function CardEditButton({ label, onClick }: { label: string; onClick: () => void }) {
  const run = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };
  return (
    <span
      role="button"
      tabIndex={0}
      title={label}
      aria-label={label}
      onClick={run}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && run(e)}
      className="inline-flex rounded p-1 text-stone-400 transition hover:bg-stone-100 hover:text-ink"
    >
      <Pencil className="size-3.5" />
    </span>
  );
}

function LeadBoard({ params, onEdit }: { params: Record<string, unknown>; onEdit?: (lead: any) => void }) {
  const toast = useToast();
  const { rows, mutate } = useList("/leads", { ...params, limit: 200, sort: "-updatedAt" });
  const [drag, setDrag] = useState<string | null>(null);
  const cols = LEAD_STATUS.filter((s) => s.value !== "on_hold");
  const move = async (id: string, status: string) => {
    try {
      await api.patch(`/leads/${id}`, { status });
      mutate();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {cols.map((c) => {
        const items = rows.filter((r) => r.status === c.value);
        return (
          <div
            key={c.value}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => drag && move(drag, c.value)}
            className="flex w-64 shrink-0 flex-col rounded-xl bg-stone-100/80 p-2"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <StatusBadge options={LEAD_STATUS} value={c.value} />
              <span className="text-xs text-muted">{items.length}</span>
            </div>
            <div className="flex min-h-24 flex-col gap-2">
              {items.map((l) => (
                <Link
                  key={l.id}
                  href={`/leads/${l.id}`}
                  draggable
                  onDragStart={() => setDrag(l.id)}
                  onDragEnd={() => setDrag(null)}
                  className="rounded-lg border border-line bg-white p-3 shadow-xs transition hover:border-brand-300"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{l.name}</p>
                    <StatusBadge options={LEAD_PRIORITY} value={l.priority} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{[labelOf(PROPERTY_CONFIGS, l.propertyConfig), l.city].filter(Boolean).join(" · ")}</p>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-medium">{l.budget ? money(l.budget) : ""}</span>
                    <span className="flex items-center gap-1">
                      {l.nextFollowUpAt && <span className={isOverdue(l.nextFollowUpAt) ? "text-red-600" : "text-muted"}>{date(l.nextFollowUpAt)}</span>}
                      {onEdit && <CardEditButton label="Edit lead" onClick={() => onEdit(l)} />}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LeadsPage() {
  const router = useRouter();
  const toast = useToast();
  const { can } = useAuth();
  const [view, setView] = useState<"list" | "board">("list");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const canEdit = can("leads:write");
  const openEdit = async (r: any) => {
    try {
      setEditing(await api.get(`/leads/${r.id}`));
    } catch (e) {
      toast.error(e);
    }
  };
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("status")) setFilters({ status: sp.get("status") });
  }, []);
  const params = { q, page, ...filters };
  const { rows, meta, loading, mutate, error } = useList("/leads", params);
  const filterDefs = [
    { name: "status", label: "Status", options: LEAD_STATUS },
    { name: "source", label: "Source", options: LEAD_SOURCES },
    { name: "priority", label: "Priority", options: LEAD_PRIORITY },
    { name: "assignedTo", label: "Owner", ref: REF.user },
  ];
  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Every enquiry from website, Meta ads, referrals & walk-ins"
        actions={
          <>
            <Segmented options={[{ value: "list", label: "List" }, { value: "board", label: "Pipeline" }]} value={view} onChange={setView} />
            <ExportButton
              onExport={() =>
                exportCsv(
                  "/leads",
                  { q, ...filters },
                  [
                    { key: "leadNo", label: "Lead no" },
                    { key: "name", label: "Name" },
                    { key: "phone", label: "Phone" },
                    { key: "email", label: "Email" },
                    { key: "city", label: "City" },
                    { key: "propertyType", label: "Property", csv: (r) => [labelOf(PROPERTY_CONFIGS, r.propertyConfig), labelOf(PROPERTY_TYPES, r.propertyType)].filter(Boolean).join(" ") },
                    { key: "budget", label: "Budget" },
                    { key: "source", label: "Source", csv: (r) => labelOf(LEAD_SOURCES, r.source) },
                    { key: "status", label: "Status", csv: (r) => labelOf(LEAD_STATUS, r.status) },
                    { key: "priority", label: "Priority", csv: (r) => labelOf(LEAD_PRIORITY, r.priority) },
                    { key: "assignedTo", label: "Owner" },
                    { key: "nextFollowUpAt", label: "Next follow-up" },
                    { key: "createdAt", label: "Created" },
                  ],
                  "leads"
                )
              }
            />
            {can("leads:write") && (
              <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                New lead
              </Button>
            )}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Name, phone, city…" />
        <FilterBar filters={view === "board" ? filterDefs.filter((f) => f.name !== "status") : filterDefs} values={filters} onChange={(k, v) => (setFilters((f) => ({ ...f, [k]: v })), setPage(1))} />
      </div>
      {view === "board" ? (
        <LeadBoard params={{ q, ...filters, status: undefined }} onEdit={canEdit ? openEdit : undefined} />
      ) : (
        <div className="card overflow-visible">
          <DataTable
            columns={leadColumns}
            rows={rows}
            loading={loading}
            error={error}
            onRetry={() => mutate()}
            onRowClick={(r) => router.push(`/leads/${r.id}`)}
            empty={<Empty title="No leads found" />}
            rowActions={
              canEdit
                ? (r) => (
                    <Menu trigger={<IconButton label="Actions"><MoreHorizontal className="size-4" /></IconButton>}>
                      <MenuItem icon={<Pencil className="size-4" />} onClick={() => openEdit(r)}>Edit</MenuItem>
                    </Menu>
                  )
                : undefined
            }
          />
          {meta && <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />}
        </div>
      )}
      <FormDrawer open={creating} onClose={() => setCreating(false)} title="New lead" fields={leadFields} endpoint="/leads" defaults={{ status: "new", priority: "warm", source: "walk_in" }} onSaved={(r) => (mutate(), router.push(`/leads/${r.id}`))} />
      <FormDrawer open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit lead – ${editing.name}` : "Edit lead"} fields={leadFields} endpoint="/leads" record={editing} onSaved={() => invalidate("/leads")} />
    </div>
  );
}

/* ------------------------------ Follow-up panel -------------------------- */
function FollowUpPanel({ lead, project }: { lead?: string; project?: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const { rows, mutate } = useList("/followups", { lead, project, limit: 100, sort: "-scheduledAt" });
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState<any>(null);
  const [tomorrow] = useState(() => toInputDateTime(new Date(Date.now() + 86400000)));
  const [outcome, setOutcome] = useState("");
  const [next, setNext] = useState("");
  const [completingBusy, setCompletingBusy] = useState(false);
  const done = async () => {
    if (completingBusy) return; // a double tap would schedule the next follow-up twice
    setCompletingBusy(true);
    try {
      await api.patch(`/followups/${completing.id}`, { status: "done", outcome, nextFollowUpAt: next ? new Date(next).toISOString() : null });
      toast.success("Follow-up completed");
      setCompleting(null);
      setOutcome("");
      setNext("");
      mutate();
      invalidate("/leads");
    } catch (e) {
      toast.error(e);
    } finally {
      setCompletingBusy(false);
    }
  };
  const fields = followupFields.filter((f) => f.name !== "lead");
  return (
    <div className="space-y-3">
      {can("followups:write") && (
        <Button size="sm" icon={<CalendarPlus className="size-4" />} onClick={() => setCreating(true)}>
          Schedule follow-up
        </Button>
      )}
      {rows.length === 0 ? (
        <Empty title="No follow-ups yet" />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {rows.map((f) => (
            <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusBadge options={FOLLOWUP_STATUS} value={f.status} />
                  <span className="text-xs font-medium">{labelOf(FOLLOWUP_TYPES, f.type)}</span>
                  <span className={cx("text-xs", f.status === "pending" && isOverdue(f.scheduledAt) ? "text-red-600" : "text-muted")}>{dateTime(f.scheduledAt)}</span>
                </div>
                {f.purpose && <p className="mt-1 text-sm">{f.purpose}</p>}
                {f.outcome && <p className="mt-1 rounded bg-stone-50 px-2 py-1 text-sm text-stone-700">↳ {f.outcome}</p>}
                <p className="mt-1 text-xs text-muted">{f.assignedTo?.name}</p>
              </div>
              {can("followups:write") && (
                <div className="flex gap-1">
                  {f.status === "pending" && (
                    <Button size="xs" variant="success" icon={<CheckCircle2 className="size-3.5" />} onClick={() => setCompleting(f)}>
                      Done
                    </Button>
                  )}
                  {/* done / missed / cancelled ones stay editable so the outcome can be corrected */}
                  <Button size="xs" variant="secondary" onClick={() => setEditing(f)}>
                    Edit
                  </Button>
                </div>
              )}
              {can("followups:delete") && (
                <button
                  className="rounded p-1 text-stone-300 hover:text-red-600"
                  title="Delete follow-up"
                  onClick={async () => {
                    if (!(await confirm({ title: "Delete this follow-up?", danger: true, confirmText: "Delete" }))) return;
                    try {
                      await api.del(`/followups/${f.id}`);
                      mutate();
                      invalidate("/leads");
                    } catch (e) {
                      toast.error(e);
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormDrawer
        modal
        open={creating || !!editing}
        onClose={() => (setCreating(false), setEditing(null))}
        title={editing ? "Edit follow-up" : "Schedule follow-up"}
        fields={fields}
        endpoint="/followups"
        record={editing}
        defaults={{ type: "call", scheduledAt: tomorrow }}
        transform={(p) => (editing ? p : { ...p, lead, project })}
        onSaved={() => (mutate(), invalidate("/leads"))}
      />
      <Modal
        open={!!completing}
        onClose={() => setCompleting(null)}
        title="Complete follow-up"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompleting(null)}>
              Cancel
            </Button>
            <Button loading={completingBusy} onClick={done}>Save</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">What was discussed?</label>
            <textarea className="input" rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
          </div>
          <div>
            <label className="label">Next follow-up (optional)</label>
            <input type="datetime-local" className="input" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* --------------------------- Site visit & measurements ------------------- */
type M = { id?: string; room?: string; item?: string; length?: number | ""; width?: number | ""; height?: number | ""; unit: string; notes?: string };

function MeasurementsEditor({ rows, onChange }: { rows: M[]; onChange: (r: M[]) => void }) {
  const set = (i: number, p: Partial<M>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-2 py-2">Room</th>
            <th className="px-2 py-2">Wall / item</th>
            <th className="w-20 px-2 py-2">L</th>
            <th className="w-20 px-2 py-2">W</th>
            <th className="w-20 px-2 py-2">H</th>
            <th className="w-20 px-2 py-2">Unit</th>
            <th className="px-2 py-2">Notes</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className="border-t border-line">
              <td className="p-1"><input className="input px-2 py-1" list="rooms" value={r.room ?? ""} onChange={(e) => set(i, { room: e.target.value })} /></td>
              <td className="p-1"><input className="input px-2 py-1" value={r.item ?? ""} onChange={(e) => set(i, { item: e.target.value })} /></td>
              {(["length", "width", "height"] as const).map((k) => (
                <td key={k} className="p-1"><input type="number" step="any" className="input px-2 py-1" value={r[k] ?? ""} onChange={(e) => set(i, { [k]: e.target.value === "" ? "" : Number(e.target.value) })} /></td>
              ))}
              <td className="p-1">
                <select className="input py-1 pl-1 pr-6" value={r.unit} onChange={(e) => set(i, { unit: e.target.value })}>
                  {["ft", "in", "m", "cm", "mm"].map((u) => <option key={u}>{u}</option>)}
                </select>
              </td>
              <td className="p-1"><input className="input px-2 py-1" value={r.notes ?? ""} onChange={(e) => set(i, { notes: e.target.value })} /></td>
              <td className="p-1"><button type="button" className="rounded p-1 text-stone-400 hover:text-red-600" onClick={() => onChange(rows.filter((_, k) => k !== i))}><Trash2 className="size-4" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <datalist id="rooms">{["Living", "Dining", "Kitchen", "Master Bedroom", "Bedroom 2", "Kids Room", "Foyer", "Pooja", "Bathroom", "Balcony"].map((r) => <option key={r} value={r} />)}</datalist>
      <div className="border-t border-line bg-stone-50/60 p-2">
        <Button size="xs" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => onChange([...rows, { unit: "ft", room: rows.at(-1)?.room }])}>
          Add measurement
        </Button>
      </div>
    </div>
  );
}

export function SiteVisitDrawer({ open, onClose, record, lead, project, address, onSaved }: { open: boolean; onClose: () => void; record?: any; lead?: string; project?: string; address?: string; onSaved?: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const remove = async () => {
    if (!(await confirm({ title: "Delete this site visit?", message: "Measurements recorded in it are deleted too. Uploaded photos stay in Files.", danger: true, confirmText: "Delete" }))) return;
    try {
      await api.del(`/site-visits/${record.id}`);
      toast.success("Site visit deleted");
      invalidate("/site-visits", "/leads");
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  const fields: Field[] = [
    { name: "scheduledAt", label: "Visit date & time", type: "datetime", required: true },
    { name: "status", label: "Status", type: "select", options: SITE_VISIT_STATUS },
    { name: "visitedAt", label: "Actually visited on", type: "datetime", hidden: (v) => v.status !== "completed", help: "Leave empty to use the time it is marked completed" },
    { name: "visitedBy", label: "Team visiting", type: "refs", ref: REF.user },
    { name: "address", label: "Site address", type: "textarea", rows: 2 },
    { name: "requirements", label: "Client requirements noted", type: "textarea" },
    { name: "notes", label: "Internal notes", type: "textarea" },
  ];
  const f = useFormState({});
  const [measurements, setMeasurements] = useState<M[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    f.setValues(record ? { ...record } : { scheduledAt: toInputDateTime(new Date(Date.now() + 86400000)), status: "scheduled", address });
    setMeasurements(record?.measurements ?? []);
    setPhotos(record?.photos ?? []);
    setLoc(record?.location ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record]);
  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...toPayload(fields, f.values),
        measurements: measurements.map((m) => ({ ...m, length: m.length === "" ? undefined : m.length, width: m.width === "" ? undefined : m.width, height: m.height === "" ? undefined : m.height })),
        photos: photos.map((p) => (typeof p === "object" ? p.id : p)),
        location: loc,
      };
      if (record?.id) await api.patch(`/site-visits/${record.id}`, payload);
      else await api.post("/site-visits", { ...payload, lead, project });
      toast.success("Site visit saved");
      onSaved?.();
      invalidate("/site-visits", "/leads");
      onClose();
    } catch (e) {
      f.setErrors(errorsFrom(e));
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-4xl"
      title={record ? "Site visit & measurements" : "Schedule site visit"}
      footer={
        <>
          {record?.id && can("site_visits:delete") && (
            <Button variant="ghost" className="mr-auto text-red-600" icon={<Trash2 className="size-4" />} onClick={remove}>
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>{can("site_visits:write") ? "Cancel" : "Close"}</Button>
          {can("site_visits:write") && <Button loading={saving} onClick={save}>{record?.id ? "Save changes" : "Save"}</Button>}
        </>
      }
    >
      <div className="space-y-5">
        <FormGrid fields={fields} values={f.values} setValue={f.setValue} errors={f.errors} />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button
            size="sm"
            variant="secondary"
            icon={<LocateFixed className="size-4" />}
            onClick={() => navigator.geolocation?.getCurrentPosition((p) => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }), () => toast.error("Location not available"))}
          >
            Capture GPS location
          </Button>
          {loc && (
            <a className="text-brand-700 hover:underline" href={mapsLink(undefined, loc)} target="_blank" rel="noreferrer">
              {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)} – open in Maps
            </a>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Measurements</h4>
          <MeasurementsEditor rows={measurements} onChange={setMeasurements} />
          <p className="mt-1 text-xs text-muted">Tip: you can also upload the pen-&-paper sheet photo or the AutoCAD file below.</p>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Site photos & measurement sheets</h4>
          <Attachments files={photos} onChange={(ids) => setPhotos((prev) => ids.map((id) => prev.find((p: any) => (p.id ?? p) === id) ?? id))} meta={{ category: "site_photo", project, entityType: "SiteVisit", entityId: record?.id }} />
        </div>
      </div>
    </Drawer>
  );
}

export function SiteVisitPanel({ lead, project, address }: { lead?: string; project?: string; address?: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const { rows, mutate } = useList("/site-visits", { lead, project, limit: 50 });
  const [open, setOpen] = useState<any>(false);
  const openVisit = (id: string) => api.get(`/site-visits/${id}`).then(setOpen).catch(toast.error);
  return (
    <div className="space-y-3">
      {can("site_visits:write") && (
        <Button size="sm" icon={<MapPin className="size-4" />} onClick={() => setOpen(null)}>
          Schedule site visit
        </Button>
      )}
      {rows.length === 0 ? (
        <Empty title="No site visits yet" />
      ) : (
        <ul className="space-y-2">
          {rows.map((v) => (
            <li key={v.id} className="cursor-pointer rounded-lg border border-line p-3 hover:border-brand-300" onClick={() => openVisit(v.id)}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge options={SITE_VISIT_STATUS} value={v.status} />
                  <span className="text-sm font-medium">{dateTime(v.visitedAt ?? v.scheduledAt)}</span>
                </div>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted">{v.visitedBy?.map((u: any) => u.name).join(", ")}</span>
                  <Button size="xs" variant="secondary" icon={can("site_visits:write") ? <Pencil className="size-3.5" /> : undefined} onClick={(e) => (e.stopPropagation(), openVisit(v.id))}>
                    {can("site_visits:write") ? "Edit" : "View"}
                  </Button>
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {v.measurements?.length ?? 0} measurements · {v.photos?.length ?? 0} photos {v.address && `· ${v.address}`}
              </p>
              {v.requirements && <p className="mt-1 line-clamp-2 text-sm">{v.requirements}</p>}
            </li>
          ))}
        </ul>
      )}
      <SiteVisitDrawer open={open !== false} onClose={() => setOpen(false)} record={open || undefined} lead={lead} project={project} address={address} onSaved={mutate} />
    </div>
  );
}

/* ------------------------------ Convert modal ---------------------------- */
function ConvertModal({ lead, open, onClose }: { lead: any; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { rows: quotes } = useList(open ? "/quotations" : null, { lead: lead.id, limit: 5, sort: "-createdAt" });
  const fields: Field[] = [
    { name: "projectName", label: "Site / project name", required: true },
    { name: "siteAddress", label: "Site address", type: "textarea", rows: 2 },
    { name: "city", label: "City" },
    { name: "contractValue", label: "Contract value (can update later from approved quotation)", type: "money" },
    { name: "startDate", label: "Start date", type: "date" },
    { name: "expectedEndDate", label: "Target handover", type: "date" },
    { name: "manager", label: "Project manager", type: "ref", ref: REF.user },
    { name: "designer", label: "Designer", type: "ref", ref: REF.user },
    { name: "supervisor", label: "Site supervisor", type: "ref", ref: REF.user },
    { name: "gstin", label: "Client GSTIN (optional)" },
    { name: "existingClient", label: "Attach to existing client instead (repeat client)", type: "ref", ref: REF.client },
  ];
  const f = useFormState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open)
      f.setValues({
        projectName: `${lead.name} – ${[labelOf(PROPERTY_CONFIGS, lead.propertyConfig), labelOf(PROPERTY_TYPES, lead.propertyType)].filter(Boolean).join(" ") || "Interior"}`,
        siteAddress: lead.address,
        city: lead.city,
        contractValue: quotes.find((q: any) => q.status === "approved")?.total ?? quotes[0]?.total ?? lead.budget ?? "",
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quotes.length]);
  const submit = async () => {
    setSaving(true);
    try {
      const r: any = await api.post(`/leads/${lead.id}/convert`, toPayload(fields, f.values));
      toast.success(`Converted – ${r.project.projectNo} created`);
      invalidate("/leads", "/projects", "/clients");
      router.push(`/projects/${r.project.id}`);
    } catch (e) {
      f.setErrors(errorsFrom(e));
      toast.error(e);
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Convert lead → client & site" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="success" loading={saving} onClick={submit}>Convert</Button></>}>
      <p className="mb-4 text-sm text-muted">Creates a client record and a site. Site visits, measurements and quotations of this lead move to the site automatically.</p>
      <FormGrid fields={fields} values={f.values} setValue={f.setValue} errors={f.errors} />
    </Modal>
  );
}

/* ------------------------------- Lead detail ----------------------------- */
export function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const { data: lead, mutate, isLoading, error } = useOne<any>(`/leads/${id}`);
  const [tab, setTab] = useState<"followups" | "visits" | "quotes" | "files" | "activity">("followups");
  const [edit, setEdit] = useState(false);
  const [convert, setConvert] = useState(false);
  const [lost, setLost] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const { rows: quotes } = useList(`/quotations`, { lead: id, limit: 50 });
  if (isLoading) return <Loading />;
  if (!lead) return error ? <LoadError error={error} onRetry={() => mutate()} /> : <Empty title="Lead not found" />;

  const setStatus = async (status: string, extra: any = {}) => {
    try {
      await api.patch(`/leads/${id}`, { status, ...extra });
      mutate();
      toast.success("Status updated");
    } catch (e) {
      toast.error(e);
    }
  };
  const del = async () => {
    if (!(await confirm({ title: "Delete this lead?", message: "Follow-ups will be deleted too.", danger: true, confirmText: "Delete" }))) return;
    try {
      await api.del(`/leads/${id}`);
      router.push("/leads");
    } catch (e) {
      toast.error(e);
    }
  };
  const converted = !!lead.project;

  return (
    <div className="space-y-5">
      <PageHeader
        back={<Link href="/leads" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft className="size-3.5" /> Leads</Link>}
        title={lead.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{lead.leadNo}</span>
            <StatusBadge options={LEAD_STATUS} value={lead.status} />
            <StatusBadge options={LEAD_PRIORITY} value={lead.priority} />
            <span>· added {relative(lead.createdAt)}</span>
          </span>
        }
        actions={
          <>
            <Button variant="secondary" href={telLink(lead.phone)} icon={<Phone className="size-4" />}>Call</Button>
            <Button variant="secondary" href={waLink(lead.phone, `Hello ${lead.name}, this is LA-VISTA Interiors.`)} icon={<MessageCircle className="size-4" />}>WhatsApp</Button>
            {can("leads:write") && <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>Edit</Button>}
            {converted ? (
              <Button variant="brand" href={`/projects/${lead.project.id}`} icon={<Building2 className="size-4" />}>Open site</Button>
            ) : (
              can(["leads:write", "projects:write"]) && <Button variant="success" icon={<CheckCircle2 className="size-4" />} onClick={() => setConvert(true)}>Convert to site</Button>
            )}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card title="Details">
            <dl className="grid grid-cols-2 gap-4">
              <KV label="Phone"><a href={telLink(lead.phone)} className="text-brand-700">{lead.phone}</a></KV>
              <KV label="Alt. phone">{lead.alternatePhone}</KV>
              <KV label="Email" className="col-span-2">{lead.email}</KV>
              <KV label="Address" className="col-span-2">
                {lead.address}
                {(lead.address || lead.location) && <a href={mapsLink(lead.address, lead.location)} target="_blank" rel="noreferrer" className="ml-1 text-xs text-brand-700 hover:underline">Map ↗</a>}
              </KV>
              <KV label="City">{lead.city}</KV>
              <KV label="Property">{[labelOf(PROPERTY_CONFIGS, lead.propertyConfig), labelOf(PROPERTY_TYPES, lead.propertyType)].filter(Boolean).join(" ")}</KV>
              <KV label="Area">{lead.areaSqft ? `${lead.areaSqft} sq.ft` : ""}</KV>
              <KV label="Budget">{lead.budget ? money(lead.budget) : ""}</KV>
              <KV label="Scope" className="col-span-2"><div className="flex flex-wrap gap-1">{(lead.scope ?? []).map((s: string) => <Badge key={s}>{labelOf(WORK_SCOPES, s)}</Badge>)}</div></KV>
              <KV label="Source">{labelOf(LEAD_SOURCES, lead.source)}</KV>
              <KV label="Referred by">{lead.referredBy ?? lead.sourceDetails}</KV>
              <KV label="Owner"><Person user={lead.assignedTo} /></KV>
              <KV label="Next follow-up">{lead.nextFollowUpAt ? dateTime(lead.nextFollowUpAt) : ""}</KV>
              {lead.status === "lost" && <KV label="Lost reason" className="col-span-2">{lead.lostReason}</KV>}
              {converted && <KV label="Site" className="col-span-2"><ProjectLink project={lead.project} /></KV>}
            </dl>
            {lead.notes && <p className="mt-4 whitespace-pre-line rounded-lg bg-stone-50 p-3 text-sm text-stone-700">{lead.notes}</p>}
          </Card>
          {can("leads:write") && !converted && (
            <Card title="Move pipeline">
              <div className="flex flex-wrap gap-1.5">
                {LEAD_STATUS.filter((s) => !["won", "lost"].includes(s.value)).map((s) => (
                  <button key={s.value} onClick={() => setStatus(s.value)} className={cx("rounded-full border px-2.5 py-1 text-xs", lead.status === s.value ? "border-brand-400 bg-brand-50 font-medium" : "border-line hover:border-stone-300")}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="secondary" icon={<XCircle className="size-4" />} onClick={() => setLost(true)}>Mark lost</Button>
                {can("leads:delete") && <Button size="sm" variant="ghost" className="text-red-600" onClick={del}>Delete</Button>}
              </div>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2">
          <Card padded={false}>
            <Tabs
              className="px-3"
              value={tab}
              onChange={setTab}
              tabs={[
                { value: "followups", label: "Follow-ups" },
                { value: "visits", label: "Site visit & measurements" },
                { value: "quotes", label: "Quotations", count: quotes.length },
                { value: "files", label: "Files" },
                { value: "activity", label: "Activity" },
              ]}
            />
            <div className="p-4">
              {tab === "followups" && <FollowUpPanel lead={id} />}
              {tab === "visits" && <SiteVisitPanel lead={id} address={lead.address} />}
              {tab === "quotes" && (
                <div className="space-y-3">
                  {can("quotations:write") && <Button size="sm" icon={<FileSpreadsheet className="size-4" />} href={`/quotations/new?lead=${id}`}>New quotation</Button>}
                  {quotes.length === 0 ? (
                    <Empty title="No quotations yet" />
                  ) : (
                    <ul className="divide-y divide-line rounded-lg border border-line">
                      {quotes.map((q) => (
                        <li key={q.id}>
                          <Link href={`/quotations/${q.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50">
                            <span>
                              <span className="text-sm font-medium">{q.title}</span>
                              <span className="block text-xs text-muted">{q.quoteNo} · v{q.version} · {date(q.date)}</span>
                            </span>
                            <span className="flex items-center gap-3">
                              <StatusBadge options={QUOTE_STATUS} value={q.status} />
                              <span className="text-sm font-semibold tabular-nums">{money(q.total)}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {tab === "files" && <FileLibrary entityType="Lead" entityId={id} defaultCategory="document" />}
              {tab === "activity" && <ActivityFeed entityId={id} />}
            </div>
          </Card>
        </div>
      </div>

      <FormDrawer open={edit} onClose={() => setEdit(false)} title="Edit lead" fields={leadFields} endpoint="/leads" record={lead} onSaved={() => mutate()} />
      <ConvertModal lead={lead} open={convert} onClose={() => setConvert(false)} />
      <Modal open={lost} onClose={() => setLost(false)} title="Mark lead as lost" footer={<><Button variant="secondary" onClick={() => setLost(false)}>Cancel</Button><Button variant="danger" onClick={() => (setStatus("lost", { lostReason }), setLost(false))}>Mark lost</Button></>}>
        <label className="label">Reason</label>
        <select className="input" value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
          <option value="">Select…</option>
          {["Budget mismatch", "Went with competitor", "Project postponed", "Not reachable", "Only enquiry", "Location not serviceable", "Other"].map((r) => <option key={r}>{r}</option>)}
        </select>
      </Modal>
    </div>
  );
}

/* -------------------------------- Follow-ups ------------------------------ */
export function FollowUpsPage() {
  const [view, setView] = useState<"today" | "upcoming" | "all">("today");
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const base =
    view === "today"
      ? { status: "pending", to: today.toISOString(), sort: "scheduledAt" }
      : view === "upcoming"
        ? { status: "pending", from: new Date().toISOString(), sort: "scheduledAt" }
        : { sort: "-scheduledAt" };
  return (
    <ResourcePage
      title="Follow-ups"
      subtitle="Calls, meetings and WhatsApp follow-ups with leads"
      endpoint="/followups"
      resource="followups"
      entityName="follow-up"
      columns={followupColumns}
      fields={followupFields}
      defaults={{ type: "call", status: "pending" }}
      filters={[{ name: "type", label: "Type", options: FOLLOWUP_TYPES }, { name: "assignedTo", label: "Owner", ref: REF.user }]}
      baseParams={base}
      createLabel="Schedule follow-up"
      headerActions={<Segmented options={[{ value: "today", label: "Due today & overdue" }, { value: "upcoming", label: "Upcoming" }, { value: "all", label: "All" }]} value={view} onChange={setView} />}
    />
  );
}

/* -------------------------------- Site visits ----------------------------- */
export function SiteVisitsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("scheduled");
  const [page, setPage] = useState(1);
  const { rows, meta, loading, mutate } = useList("/site-visits", { q, status, page, sort: status === "scheduled" ? "scheduledAt" : "-scheduledAt" });
  const [open, setOpen] = useState<any>(false);
  const openVisit = (id: string) => api.get(`/site-visits/${id}`).then(setOpen).catch(toast.error);
  const [newFor, setNewFor] = useState<{ lead?: string; project?: string } | null>(null);
  return (
    <div>
      <PageHeader
        title="Site visits"
        subtitle="Measurement visits & site photos (Phase 1)"
        actions={can("site_visits:write") && <Button icon={<Plus className="size-4" />} onClick={() => setNewFor({})}>Schedule visit</Button>}
      />
      <div className="card">
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Address, requirement…" />
          <select className="input w-auto" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="">All</option>
            {SITE_VISIT_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <DataTable
          loading={loading}
          rows={rows}
          onRowClick={(r) => openVisit(r.id)}
          rowActions={(r) => (
            <Menu trigger={<IconButton label="Actions"><MoreHorizontal className="size-4" /></IconButton>}>
              <MenuItem icon={<Pencil className="size-4" />} onClick={() => openVisit(r.id)}>{can("site_visits:write") ? "Edit visit & measurements" : "View visit & measurements"}</MenuItem>
              {r.lead && <MenuItem href={`/leads/${r.lead.id}`}>Open lead</MenuItem>}
              {r.project && <MenuItem href={`/projects/${r.project.id}?tab=visits`}>Open site</MenuItem>}
            </Menu>
          )}
          columns={[
            { key: "scheduledAt", label: "When", render: (r) => dateTime(r.visitedAt ?? r.scheduledAt) },
            { key: "for", label: "Lead / site", render: (r) => (r.project ? <ProjectLink project={r.project} /> : <Link href={`/leads/${r.lead?.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{r.lead?.name} <span className="text-xs text-muted">{r.lead?.phone}</span></Link>) },
            { key: "address", label: "Address", render: (r) => <span className="line-clamp-1 max-w-xs">{r.address}</span> },
            { key: "team", label: "Team", render: (r) => r.visitedBy?.map((u: any) => u.name).join(", ") },
            { key: "m", label: "Measurements", render: (r) => r.measurements?.length ?? 0, align: "right" },
            { key: "status", label: "Status", render: (r) => <StatusBadge options={SITE_VISIT_STATUS} value={r.status} /> },
          ]}
        />
        {meta && <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />}
      </div>
      <SiteVisitDrawer open={open !== false} onClose={() => setOpen(false)} record={open || undefined} onSaved={mutate} />
      <Modal open={!!newFor && !newFor.lead && !newFor.project} onClose={() => setNewFor(null)} title="Site visit for…">
        <div className="space-y-3">
          <div><label className="label">Lead</label><EntitySelect value={null} config={REF.lead} onChange={(id) => id && setNewFor({ lead: id })} /></div>
          <p className="text-center text-xs text-muted">— or —</p>
          <div><label className="label">Existing site</label><EntitySelect value={null} config={REF.project} onChange={(id) => id && setNewFor({ project: id })} /></div>
        </div>
      </Modal>
      <SiteVisitDrawer open={!!newFor && !!(newFor.lead || newFor.project)} onClose={() => setNewFor(null)} lead={newFor?.lead} project={newFor?.project} onSaved={mutate} />
    </div>
  );
}

/* ---------------------------------- Clients ------------------------------- */
export function ClientsPage() {
  return (
    <ResourcePage
      title="Clients"
      subtitle="Converted customers and their sites"
      endpoint="/clients"
      resource="clients"
      entityName="client"
      columns={[
        { key: "name", label: "Client", render: (r) => <span><span className="font-medium">{r.name}</span><span className="block text-xs text-muted">{r.clientNo}</span></span> },
        { key: "phone", label: "Phone" },
        { key: "email", label: "Email", hideOnMobile: true },
        { key: "city", label: "City" },
        { key: "createdAt", label: "Since", render: (r) => date(r.createdAt), hideOnMobile: true },
      ]}
      fields={clientFields}
      rowHref={(r) => `/clients/${r.id}`}
      createLabel="Add client"
      searchPlaceholder="Name, phone, client no…"
    />
  );
}

export function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAuth();
  const { data: c, mutate, isLoading, error } = useOne<any>(`/clients/${id}`);
  const { rows: sites } = useList("/projects", { client: id, limit: 50 });
  const { rows: pays } = useList(can("payments:read") ? "/payments" : null, { client: id, limit: 50 });
  const [edit, setEdit] = useState(false);
  const router = useRouter();
  if (isLoading) return <Loading />;
  if (!c) return error ? <LoadError error={error} onRetry={() => mutate()} /> : <Empty title="Client not found" />;
  return (
    <div className="space-y-5">
      <PageHeader
        back={<Link href="/clients" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft className="size-3.5" /> Clients</Link>}
        title={c.name}
        subtitle={c.clientNo}
        actions={
          <>
            <Button variant="secondary" href={telLink(c.phone)} icon={<Phone className="size-4" />}>Call</Button>
            <Button variant="secondary" href={waLink(c.phone)} icon={<MessageCircle className="size-4" />}>WhatsApp</Button>
            {can("clients:write") && <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>Edit</Button>}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Contact">
          <dl className="grid grid-cols-2 gap-4">
            <KV label="Phone">{c.phone}</KV>
            <KV label="Alt. phone">{c.alternatePhone}</KV>
            <KV label="Email" className="col-span-2">{c.email}</KV>
            <KV label="Address" className="col-span-2">{c.address}</KV>
            <KV label="City">{c.city}</KV>
            <KV label="GSTIN">{c.gstin}</KV>
          </dl>
        </Card>
        <div className="space-y-5 lg:col-span-2">
          <Card title="Sites" padded={false}>
            <DataTable columns={projectColumns} rows={sites} onRowClick={(r) => router.push(`/projects/${r.id}`)} />
          </Card>
          {can("payments:read") && (
            <Card title="Payments received" padded={false}>
              <DataTable
                rows={pays}
                columns={[
                  { key: "receiptNo", label: "Receipt" },
                  { key: "date", label: "Date", render: (r) => date(r.date) },
                  { key: "project", label: "Site", render: (r) => r.project?.name },
                  { key: "amount", label: "Amount", render: (r) => money(r.amount), align: "right" },
                ]}
              />
            </Card>
          )}
        </div>
      </div>
      <FormDrawer open={edit} onClose={() => setEdit(false)} title="Edit client" fields={clientFields} endpoint="/clients" record={c} onSaved={() => mutate()} />
    </div>
  );
}

