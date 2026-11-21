"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Check, Download, FileIcon, ImageIcon, Paperclip, Plus, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { invalidate, useList, useOne } from "@/hooks/use-api";
import { api, fileUrl } from "@/lib/api-client";
import { FILE_CATEGORIES, PROJECT_STAGES, ROLES, TRADES, UNITS, labelOf } from "@/lib/constants";
import { date, dateTime, money, relative } from "@/lib/format";
import { EntitySelect, type RefConfig } from "./form";
import { Avatar, Button, cx, Empty, IconButton, useConfirm, useToast } from "./ui";

/* ---------------------------- Reference configs -------------------------- */
export const REF: Record<string, RefConfig> = {
  user: { endpoint: "/users", label: "name", sub: (r) => labelOf(ROLES, r.role), params: { isActive: true } },
  project: { endpoint: "/projects", label: (r) => `${r.projectNo} · ${r.name}`, sub: (r) => r.client?.name ?? r.city ?? "" },
  activeProject: { endpoint: "/projects", label: (r) => `${r.projectNo} · ${r.name}`, params: { status: "active" } },
  client: { endpoint: "/clients", label: "name", sub: (r) => `${r.clientNo ?? ""} · ${r.phone ?? ""}` },
  lead: { endpoint: "/leads", label: (r) => `${r.name} (${r.leadNo ?? ""})`, sub: (r) => r.phone },
  vendor: { endpoint: "/vendors", label: "name", sub: (r) => r.phone ?? "", params: { isActive: true } },
  contractor: { endpoint: "/contractors", label: "name", sub: (r) => labelOf(TRADES, r.trade), params: { isActive: true } },
  material: { endpoint: "/materials", label: (r) => r.name, sub: (r) => `${r.code ?? ""} · stock ${r.stockQty} ${r.unit}`, params: { isActive: true } },
  quotation: { endpoint: "/quotations", label: (r) => `${r.quoteNo} v${r.version} – ${r.title}` },
  purchaseOrder: { endpoint: "/purchase-orders", label: (r) => `${r.poNo} – ${r.vendor?.name ?? ""}`, sub: (r) => money(r.total) },
  workOrder: { endpoint: "/work-orders", label: (r) => `${r.woNo} – ${r.contractor?.name ?? ""}`, sub: (r) => r.project?.name ?? "" },
  invoice: { endpoint: "/invoices", label: (r) => `${r.invoiceNo} – ${money(r.total)}`, sub: (r) => r.status },
};

/* ------------------------------ Small helpers ---------------------------- */
export function Person({ user, sub }: { user?: { name?: string } | null; sub?: ReactNode }) {
  if (!user?.name) return <span className="text-stone-300">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar name={user.name} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm">{user.name}</span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
    </span>
  );
}

export function ProjectLink({ project }: { project?: { id: string; name?: string; projectNo?: string } | null }) {
  if (!project?.id) return <span className="text-stone-300">—</span>;
  return (
    <Link href={`/projects/${project.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-brand-700 hover:underline">
      <span className="text-xs text-muted">{project.projectNo}</span> <span className="text-sm">{project.name}</span>
    </Link>
  );
}

export function StageStepper({ stage, onSelect }: { stage: string; onSelect?: (s: string) => void }) {
  const stages = PROJECT_STAGES.filter((s) => s.value !== "closed");
  const idx = stage === "closed" ? stages.length : stages.findIndex((s) => s.value === stage);
  return (
    <ol className="flex w-full gap-1 overflow-x-auto pb-1">
      {stages.map((s, i) => {
        const done = i < idx;
        const current = i === idx;
        return (
          <li key={s.value} className="min-w-28 flex-1">
            <button
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(s.value)}
              className={cx("group w-full text-left", onSelect && "cursor-pointer")}
              title={onSelect ? `Move to ${s.label}` : s.label}
            >
              <div className={cx("h-1.5 rounded-full transition", done ? "bg-brand-500" : current ? "bg-brand-300" : "bg-stone-200", onSelect && "group-hover:opacity-80")} />
              <p className={cx("mt-1.5 flex items-center gap-1 text-[11px] leading-tight", current ? "font-semibold text-ink" : done ? "text-stone-600" : "text-stone-400")}>
                {done && <Check className="size-3 text-brand-600" />}
                {s.label.replace(/^\d+\.\s*/, "")}
              </p>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ----------------------------- Line items editor ------------------------- */
export type LineItem = {
  id?: string;
  _id?: string;
  section?: string;
  category?: string;
  material?: any;
  description: string;
  specification?: string;
  hsn?: string;
  unit: string;
  qty: number;
  rate: number;
  gstRate?: number;
  receivedQty?: number;
};

export const emptyItem = (gst = 18): LineItem => ({ description: "", unit: "nos", qty: 1, rate: 0, gstRate: gst });

export function LineItemsEditor({
  items,
  onChange,
  showSection,
  showCategory,
  showMaterial,
  showGst = true,
  readOnly,
  defaultGst = 18,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  showSection?: boolean;
  showCategory?: boolean;
  showMaterial?: boolean;
  showGst?: boolean;
  readOnly?: boolean;
  defaultGst?: number;
}) {
  const set = (i: number, patch: Partial<LineItem>) => onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const total = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);
  const sections = useMemo(() => [...new Set(items.map((i) => i.section).filter(Boolean))] as string[], [items]);
  if (readOnly) {
    return (
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-stone-50 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            <tr>
              <th className="w-8 px-3 py-2">#</th>
              {showSection && <th className="px-3 py-2">Area</th>}
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Rate</th>
              {showGst && <th className="px-3 py-2 text-right">GST</th>}
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id ?? it._id ?? i} className="border-t border-line align-top">
                <td className="px-3 py-2 text-xs text-stone-400">{i + 1}</td>
                {showSection && <td className="px-3 py-2 text-stone-600">{it.section}{showCategory && it.category && <span className="block text-xs text-muted">{labelOf(TRADES, it.category)}</span>}</td>}
                <td className="px-3 py-2">{it.description}{it.specification && <span className="block text-xs text-muted">{it.specification}</span>}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{it.qty} {labelOf(UNITS, it.unit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(it.rate, true)}</td>
                {showGst && <td className="px-3 py-2 text-right">{it.gstRate ?? 0}%</td>}
                <td className="px-3 py-2 text-right font-medium tabular-nums">{money((Number(it.qty) || 0) * (Number(it.rate) || 0))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line bg-stone-50/60">
              <td colSpan={20} className="px-3 py-2 text-right text-sm">Subtotal: <strong className="tabular-nums">{money(total)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <datalist id="sections">
        {sections.map((s) => (
          <option key={s} value={s} />
        ))}
        {["Kitchen", "Living", "Dining", "Master Bedroom", "Bedroom 2", "Kids Room", "Foyer", "Pooja", "Bathroom", "Balcony", "Full Home"].map((s) => (
          <option key={"d" + s} value={s} />
        ))}
      </datalist>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-stone-50 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            <tr>
              <th className="w-8 px-2 py-2">#</th>
              {showSection && <th className="w-32 px-2 py-2">Area / Room</th>}
              {showCategory && <th className="w-32 px-2 py-2">Work</th>}
              <th className="px-2 py-2">Description</th>
              <th className="w-24 px-2 py-2">Unit</th>
              <th className="w-20 px-2 py-2 text-right">Qty</th>
              <th className="w-28 px-2 py-2 text-right">Rate</th>
              {showGst && <th className="w-16 px-2 py-2 text-right">GST%</th>}
              <th className="w-28 px-2 py-2 text-right">Amount</th>
              {!readOnly && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id ?? it._id ?? i} className="border-t border-line align-top">
                <td className="px-2 py-2 text-xs text-stone-400">{i + 1}</td>
                {showSection && (
                  <td className="px-1 py-1">
                    <input list="sections" className="input px-2 py-1.5" value={it.section ?? ""} disabled={readOnly} onChange={(e) => set(i, { section: e.target.value })} />
                  </td>
                )}
                {showCategory && (
                  <td className="px-1 py-1">
                    <select className="input px-2 py-1.5" value={it.category ?? ""} disabled={readOnly} onChange={(e) => set(i, { category: e.target.value })}>
                      <option value="">—</option>
                      {TRADES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
                <td className="space-y-1 px-1 py-1">
                  {showMaterial && !readOnly && (
                    <EntitySelect
                      value={it.material ?? null}
                      config={REF.material}
                      placeholder="Pick from catalog (optional)"
                      onChange={(id, row) =>
                        set(i, id && row ? { material: id, description: it.description || row.name, unit: row.unit, rate: it.rate || row.defaultRate || 0, gstRate: row.gstRate ?? it.gstRate, hsn: row.hsn } : { material: null })
                      }
                    />
                  )}
                  <textarea rows={1} className="input min-h-9 px-2 py-1.5" placeholder="Item description" value={it.description} disabled={readOnly} onChange={(e) => set(i, { description: e.target.value })} />
                  {(it.specification || !readOnly) && (
                    <input className="input px-2 py-1 text-xs" placeholder="Specification / brand / finish (optional)" value={it.specification ?? ""} disabled={readOnly} onChange={(e) => set(i, { specification: e.target.value })} />
                  )}
                </td>
                <td className="px-1 py-1">
                  <select className="input px-2 py-1.5" value={it.unit} disabled={readOnly} onChange={(e) => set(i, { unit: e.target.value })}>
                    {UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input type="number" step="any" min={0} className="input px-2 py-1.5 text-right" value={it.qty} disabled={readOnly} onChange={(e) => set(i, { qty: Number(e.target.value) })} />
                </td>
                <td className="px-1 py-1">
                  <input type="number" step="any" min={0} className="input px-2 py-1.5 text-right" value={it.rate} disabled={readOnly} onChange={(e) => set(i, { rate: Number(e.target.value) })} />
                </td>
                {showGst && (
                  <td className="px-1 py-1">
                    <select className="input px-1 py-1.5 text-right" value={it.gstRate ?? 0} disabled={readOnly} onChange={(e) => set(i, { gstRate: Number(e.target.value) })}>
                      {[0, 5, 12, 18, 28].map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
                <td className="px-2 py-2.5 text-right font-medium tabular-nums">{money((Number(it.qty) || 0) * (Number(it.rate) || 0))}</td>
                {!readOnly && (
                  <td className="px-1 py-1.5">
                    <IconButton label="Remove" onClick={() => onChange(items.filter((_, k) => k !== i))}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line bg-stone-50/60">
              <td colSpan={20} className="px-3 py-2">
                <div className="flex items-center justify-between">
                  {!readOnly ? (
                    <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => onChange([...items, { ...emptyItem(defaultGst), section: items.at(-1)?.section, category: items.at(-1)?.category }])}>
                      Add item
                    </Button>
                  ) : (
                    <span />
                  )}
                  <span className="text-sm">
                    Subtotal: <strong className="tabular-nums">{money(total)}</strong>
                  </span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------- File upload ----------------------------- */
export type FileRow = { id: string; originalName: string; mimeType: string; size: number; caption?: string; category?: string; createdAt?: string; uploadedBy?: { name: string } };

export function useUpload() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList | File[], meta: { category?: string; project?: string | null; entityType?: string; entityId?: string; caption?: string } = {}) => {
    if (!files.length) return [] as FileRow[];
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("file", f));
    for (const [k, v] of Object.entries(meta)) if (v) fd.append(k, v);
    setBusy(true);
    try {
      const rows = await api.upload<FileRow[]>("/files", fd);
      toast.success(`${rows.length} file(s) uploaded`);
      invalidate("/files");
      return rows;
    } catch (e) {
      toast.error(e);
      return [];
    } finally {
      setBusy(false);
    }
  };
  return { upload, busy };
}

export function UploadButton({
  onUploaded,
  meta,
  label = "Upload",
  accept,
  multiple = true,
  size = "sm",
  variant = "secondary",
}: {
  onUploaded?: (files: FileRow[]) => void;
  meta?: Parameters<ReturnType<typeof useUpload>["upload"]>[1];
  label?: string;
  accept?: string;
  multiple?: boolean;
  size?: "xs" | "sm" | "md";
  variant?: "secondary" | "primary" | "brand";
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { upload, busy } = useUpload();
  return (
    <>
      <input
        ref={ref}
        type="file"
        hidden
        multiple={multiple}
        accept={accept}
        onChange={async (e) => {
          const rows = await upload(e.target.files ?? [], meta);
          e.target.value = "";
          if (rows.length) onUploaded?.(rows);
        }}
      />
      <Button size={size} variant={variant} loading={busy} icon={<Upload className="size-4" />} onClick={() => ref.current?.click()}>
        {label}
      </Button>
    </>
  );
}

/** Attachments editor bound to a list of file ids (stored on a record). */
export function Attachments({ files, onChange, meta, readOnly }: { files: (FileRow | string)[]; onChange?: (ids: string[]) => void; meta?: Parameters<ReturnType<typeof useUpload>["upload"]>[1]; readOnly?: boolean }) {
  const list = files.filter((f): f is FileRow => typeof f === "object");
  return (
    <div className="space-y-2">
      <FileGrid files={list} onRemove={readOnly ? undefined : (id) => onChange?.(list.filter((f) => f.id !== id).map((f) => f.id))} />
      {!readOnly && (
        <UploadButton
          label="Attach files"
          meta={meta}
          onUploaded={(rows) => onChange?.([...list.map((f) => f.id), ...rows.map((r) => r.id)])}
        />
      )}
    </div>
  );
}

export function FileGrid({ files, onRemove, onDelete }: { files: FileRow[]; onRemove?: (id: string) => void; onDelete?: (id: string) => void }) {
  const [preview, setPreview] = useState<FileRow | null>(null);
  if (!files.length) return null;
  const images = files.filter((f) => f.mimeType.startsWith("image/"));
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {files.map((f) => {
          const isImg = f.mimeType.startsWith("image/") && !f.mimeType.includes("heic");
          return (
            <div key={f.id} className="group relative overflow-hidden rounded-lg border border-line bg-stone-50">
              <button type="button" onClick={() => (isImg ? setPreview(f) : window.open(fileUrl(f.id), "_blank"))} className="block aspect-[4/3] w-full">
                {isImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(f.id)} alt={f.caption ?? f.originalName} loading="lazy" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full flex-col items-center justify-center gap-1 text-stone-400">
                    <FileIcon className="size-8" />
                    <span className="text-[10px] font-semibold uppercase">{f.originalName.split(".").pop()}</span>
                  </span>
                )}
              </button>
              <div className="flex items-center justify-between gap-1 border-t border-line bg-white px-2 py-1">
                <span className="truncate text-[11px]" title={f.originalName}>
                  {f.caption || f.originalName}
                </span>
                <span className="flex shrink-0 items-center">
                  <a href={fileUrl(f.id, true)} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-ink" title="Download">
                    <Download className="size-3.5" />
                  </a>
                  {(onRemove || onDelete) && (
                    <button type="button" className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600" title="Remove" onClick={() => (onDelete ?? onRemove)!(f.id)}>
                      <X className="size-3.5" />
                    </button>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {preview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" onClick={() => setPreview(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl(preview.id)} alt={preview.originalName} className="max-h-full max-w-full rounded-lg object-contain" />
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2" onClick={(e) => e.stopPropagation()}>
            {images.length > 1 &&
              images.map((im) => (
                <button key={im.id} onClick={() => setPreview(im)} className={cx("size-12 overflow-hidden rounded border-2", im.id === preview.id ? "border-white" : "border-transparent opacity-60")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl(im.id)} alt="" className="size-full object-cover" />
                </button>
              ))}
          </div>
        </div>
      )}
    </>
  );
}

/** All files of a project / entity with upload + category filter. */
export function FileLibrary({ project, entityType, entityId, defaultCategory = "site_photo", canUpload = true }: { project?: string; entityType?: string; entityId?: string; defaultCategory?: string; canUpload?: boolean }) {
  const [category, setCategory] = useState("");
  const [uploadCat, setUploadCat] = useState(defaultCategory);
  const toast = useToast();
  const confirm = useConfirm();
  const { rows, mutate, loading } = useList<FileRow>("/files", { project, entityType, entityId, category, limit: 200 });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {FILE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {canUpload && (
          <div className="ml-auto flex items-center gap-2">
            <select className="input w-auto" value={uploadCat} onChange={(e) => setUploadCat(e.target.value)}>
              {FILE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <UploadButton variant="primary" meta={{ project, entityType, entityId, category: uploadCat }} onUploaded={() => mutate()} />
          </div>
        )}
      </div>
      {!loading && rows.length === 0 ? (
        <Empty icon={<ImageIcon className="size-5" />} title="No files yet" hint="Upload site photos, measurement sheets, AutoCAD / SketchUp files, renders, bills…" />
      ) : (
        <FileGrid
          files={rows}
          onDelete={async (id) => {
            if (!(await confirm({ title: "Delete this file?", danger: true, confirmText: "Delete" }))) return;
            try {
              await api.del(`/files/${id}`);
              mutate();
            } catch (e) {
              toast.error(e);
            }
          }}
        />
      )}
    </div>
  );
}

export function FileCount({ files }: { files?: unknown[] }) {
  if (!files?.length) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted">
      <Paperclip className="size-3" />
      {files.length}
    </span>
  );
}

/* ------------------------------ Activity feed ---------------------------- */
export function ActivityFeed({ project, entityId, limit = 50 }: { project?: string; entityId?: string; limit?: number }) {
  const { data, isLoading } = useOne<any[]>(`/activity?${new URLSearchParams({ ...(project ? { project } : {}), ...(entityId ? { entityId } : {}), limit: String(limit) })}`);
  if (isLoading) return <p className="py-6 text-center text-sm text-muted">Loading…</p>;
  if (!data?.length) return <Empty title="No activity yet" />;
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {data.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-white bg-brand-400" />
          <p className="text-sm">{a.message}</p>
          <p className="text-xs text-muted">
            {a.userName ?? "System"} · <span title={dateTime(a.createdAt)}>{relative(a.createdAt)}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}

/* ----------------------------- Print letterhead -------------------------- */
export function useCompany() {
  const { data } = useOne<any>("/settings");
  return { company: data?.company ?? {}, settings: data ?? {} };
}

export function Letterhead({ title, number, dateValue, right }: { title: string; number?: string; dateValue?: string; right?: ReactNode }) {
  const { company } = useCompany();
  return (
    <div className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-lg bg-ink font-display text-lg font-bold text-white">LV</span>
          <div>
            <p className="font-display text-2xl font-bold tracking-wide">{company.name || "LA-VISTA"}</p>
            {company.tagline && <p className="text-xs text-stone-500">{company.tagline}</p>}
          </div>
        </div>
        <p className="mt-2 max-w-xs whitespace-pre-line text-xs text-stone-600">{[company.address, company.city, company.state].filter(Boolean).join(", ")}</p>
        <p className="text-xs text-stone-600">{[company.phone, company.email, company.website].filter(Boolean).join(" · ")}</p>
        {company.gstin && <p className="text-xs text-stone-600">GSTIN: {company.gstin}</p>}
      </div>
      <div className="text-right">
        <p className="text-xl font-semibold uppercase tracking-wider">{title}</p>
        {number && <p className="mt-1 text-sm font-medium">{number}</p>}
        {dateValue && <p className="text-xs text-stone-500">Date: {date(dateValue)}</p>}
        {right}
      </div>
    </div>
  );
}

export function BankDetails() {
  const { company } = useCompany();
  const b = company.bank ?? {};
  if (!b.accountNo && !b.upi) return null;
  return (
    <div className="text-xs text-stone-600">
      <p className="font-semibold text-ink">Bank details</p>
      {b.accountName && <p>A/c name: {b.accountName}</p>}
      {b.accountNo && (
        <p>
          A/c no: {b.accountNo} · IFSC: {b.ifsc}
        </p>
      )}
      {b.bankName && <p>{b.bankName}</p>}
      {b.upi && <p>UPI: {b.upi}</p>}
    </div>
  );
}

/** Amount in words (Indian numbering). */
export function amountInWords(n: number) {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? a[x] : `${b[Math.floor(x / 10)]}${x % 10 ? " " + a[x % 10] : ""}`);
  const three = (x: number) => `${x >= 100 ? a[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " : "") : ""}${x % 100 ? two(x % 100) : ""}`;
  let num = Math.floor(Math.abs(n));
  if (num === 0) return "Zero Rupees Only";
  const parts: string[] = [];
  const crore = Math.floor(num / 1e7);
  num %= 1e7;
  const lakh = Math.floor(num / 1e5);
  num %= 1e5;
  const thousand = Math.floor(num / 1e3);
  num %= 1e3;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (num) parts.push(three(num));
  return `${parts.join(" ")} Rupees Only`;
}

export function Totals({ rows }: { rows: { label: ReactNode; value: number | undefined; strong?: boolean; hidden?: boolean }[] }) {
  return (
    <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
      {rows
        .filter((r) => !r.hidden)
        .map((r, i) => (
          <div key={i} className={cx("flex justify-between gap-4", r.strong && "border-t border-line pt-1.5 text-base font-semibold")}>
            <dt className={r.strong ? "" : "text-stone-500"}>{r.label}</dt>
            <dd className="tabular-nums">{money(r.value, true)}</dd>
          </div>
        ))}
    </dl>
  );
}

export function UserPick({ value, onChange, placeholder = "Assign to…" }: { value: any; onChange: (id: string | null) => void; placeholder?: string }) {
  return <EntitySelect value={value} onChange={onChange} config={REF.user} placeholder={placeholder} />;
}
