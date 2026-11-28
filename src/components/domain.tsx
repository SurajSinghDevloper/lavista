"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileIcon,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Paperclip,
  Pencil,
  PlayCircle,
  Plus,
  RotateCw,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invalidate, useList, useOne } from "@/hooks/use-api";
import { api, fileUrl } from "@/lib/api-client";
import { FILE_CATEGORIES, PROJECT_STAGES, RATE_TYPES, ROLES, TRADES, UNITS, labelOf } from "@/lib/constants";
import { date, dateTime, fileSize, money, relative } from "@/lib/format";
import { EntitySelect, type RefConfig } from "./form";
import { Avatar, Button, cx, Empty, IconButton, Modal, useConfirm, useToast } from "./ui";

/* ---------------------------- Reference configs -------------------------- */
export const REF: Record<string, RefConfig> = {
  user: { endpoint: "/users", label: "name", sub: (r) => labelOf(ROLES, r.role), params: { isActive: true } },
  project: { endpoint: "/projects", label: (r) => `${r.projectNo} · ${r.name}`, sub: (r) => r.client?.name ?? r.city ?? "" },
  activeProject: { endpoint: "/projects", label: (r) => `${r.projectNo} · ${r.name}`, params: { status: "active" } },
  client: { endpoint: "/clients", label: "name", sub: (r) => `${r.clientNo ?? ""} · ${r.phone ?? ""}` },
  lead: { endpoint: "/leads", label: (r) => `${r.name} (${r.leadNo ?? ""})`, sub: (r) => r.phone },
  vendor: { endpoint: "/vendors", label: "name", sub: (r) => r.phone ?? "", params: { isActive: true } },
  contractor: {
    endpoint: "/contractors",
    label: "name",
    sub: (r) => {
      const lines: any[] = r.rates?.length ? r.rates : [{ trade: r.trade, rateType: r.rateType, rate: r.rate }];
      return lines
        .slice(0, 3)
        .map((l) => `${labelOf(TRADES, l.trade)}${l.rate ? ` ₹${Number(l.rate).toLocaleString("en-IN")}${l.rateType ? ` ${labelOf(RATE_TYPES, l.rateType).toLowerCase()}` : ""}` : ""}`)
        .join(" · ");
    },
    params: { isActive: true },
  },
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
                    <select className="input py-1.5 pl-2 pr-7" value={it.category ?? ""} disabled={readOnly} onChange={(e) => set(i, { category: e.target.value })}>
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
                  <select className="input py-1.5 pl-2 pr-7" value={it.unit} disabled={readOnly} onChange={(e) => set(i, { unit: e.target.value })}>
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
                    <select className="input py-1.5 pl-1 pr-6 text-right" value={it.gstRate ?? 0} disabled={readOnly} onChange={(e) => set(i, { gstRate: Number(e.target.value) })}>
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
  const toast = useToast();
  // files just uploaded are only ids on the record until it is saved – remember their details so they show at once
  const [known, setKnown] = useState<Record<string, FileRow>>({});
  const [edits, setEdits] = useState<Record<string, Partial<FileRow>>>({});
  const [editing, setEditing] = useState<FileRow | null>(null);
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState("other");
  const ids = files.map((f) => (typeof f === "string" ? f : f.id));
  const list = files
    .map((f) => (typeof f === "string" ? known[f] : f))
    .filter((f): f is FileRow => !!f)
    .map((f) => ({ ...f, ...edits[f.id] }));
  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api.patch(`/files/${editing.id}`, { caption, category });
      setEdits((e) => ({ ...e, [editing.id]: { caption, category } }));
      setEditing(null);
      toast.success("Saved");
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <div className="space-y-2">
      <FileGrid
        files={list}
        onRemove={readOnly ? undefined : (id) => onChange?.(ids.filter((x) => x !== id))}
        onEdit={readOnly ? undefined : (f) => (setEditing(f), setCaption(f.caption ?? ""), setCategory(f.category ?? "other"))}
      />
      {!readOnly && (
        <UploadButton
          label="Attach files"
          meta={meta}
          onUploaded={(rows) => {
            setKnown((k) => ({ ...k, ...Object.fromEntries(rows.map((r) => [r.id, r])) }));
            onChange?.([...ids, ...rows.map((r) => r.id)]);
          }}
        />
      )}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit file details"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="truncate text-xs text-muted">{editing?.originalName}</p>
          <div>
            <label className="label">Caption</label>
            <input className="input" value={caption} maxLength={300} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Kitchen – wall A before work" />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {FILE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const PREVIEWABLE = /^image\/(jpeg|png|webp|gif)$/;

type ViewKind = "image" | "pdf" | "video" | "excel" | "word" | "csv" | "text" | "none";
function viewKind(f: FileRow): ViewKind {
  const m = f.mimeType;
  const ext = f.originalName.split(".").pop()?.toLowerCase() ?? "";
  if (PREVIEWABLE.test(m)) return "image";
  if (m === "application/pdf") return "pdf";
  if (m === "video/mp4" || m === "video/quicktime") return "video";
  if (ext === "xlsx") return "excel";
  if (ext === "docx") return "word";
  if (m === "text/csv" || ext === "csv") return "csv";
  if (m === "text/plain" || ext === "txt") return "text";
  return "none";
}

function FileTile({ f, onOpen, onRemove, onEdit }: { f: FileRow; onOpen: () => void; onRemove?: () => void; onEdit?: () => void }) {
  const kind = viewKind(f);
  const img = kind === "image";
  const ext = f.originalName.split(".").pop()?.toUpperCase();
  const [broken, setBroken] = useState(false);
  return (
    <div className="group relative overflow-hidden rounded-lg border border-line bg-stone-50">
      <button type="button" onClick={onOpen} className="block aspect-[4/3] w-full" title={kind === "none" ? "Details / download" : "Preview"}>
        {img && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(f.id, false, true)} alt={f.caption ?? f.originalName} loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-1 text-stone-400">
            {kind === "video" ? (
              <PlayCircle className="size-8 text-sky-400" />
            ) : f.mimeType.startsWith("image/") ? (
              <ImageIcon className="size-8" />
            ) : kind === "excel" || kind === "csv" ? (
              <FileSpreadsheet className="size-8 text-emerald-500" />
            ) : kind === "word" || kind === "text" ? (
              <FileText className="size-8 text-blue-500" />
            ) : (
              <FileIcon className={cx("size-8", kind === "pdf" && "text-red-400")} />
            )}
            <span className="text-[10px] font-semibold">{ext}</span>
            {kind !== "none" && <span className="text-[9px] text-stone-400 opacity-0 transition group-hover:opacity-100">Click to preview</span>}
          </span>
        )}
      </button>
      <div className="flex items-center justify-between gap-1 border-t border-line bg-white px-2 py-1">
        <span className="truncate text-[11px]" title={`${f.originalName} · ${fileSize(f.size)}`}>
          {f.caption || f.originalName}
        </span>
        <span className="flex shrink-0 items-center">
          {onEdit && (
            <button type="button" className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-ink" title="Edit caption / category" onClick={onEdit}>
              <Pencil className="size-3.5" />
            </button>
          )}
          <a href={fileUrl(f.id, true)} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-ink" title="Download">
            <Download className="size-3.5" />
          </a>
          {onRemove && (
            <button type="button" className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600" title="Remove" onClick={onRemove}>
              <X className="size-3.5" />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

const MAX_TEXT = 2 * 1024 * 1024; // don't pull huge files into the browser for a preview

function parseCsv(text: string, maxRows = 500) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function SheetTable({ rows }: { rows: unknown[][] }) {
  const shown = rows.slice(0, 500);
  const width = Math.min(60, Math.max(1, ...shown.map((r) => r.length)));
  const show = (v: unknown) => (v == null ? "" : v instanceof Date ? v.toLocaleDateString("en-IN") : String(v));
  return (
    <div className="max-h-full overflow-auto rounded-lg bg-white">
      <table className="min-w-full border-collapse text-xs text-ink">
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} className={i === 0 ? "sticky top-0 bg-stone-100 font-semibold" : i % 2 ? "bg-stone-50" : ""}>
              <td className="border border-line px-2 py-1 text-right text-[10px] text-stone-400">{i + 1}</td>
              {Array.from({ length: width }, (_, j) => (
                <td key={j} className="max-w-xs truncate border border-line px-2 py-1" title={show(r[j])}>
                  {show(r[j])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 500 && <p className="p-2 text-center text-xs text-muted">Showing the first 500 rows – download to see everything.</p>}
    </div>
  );
}

/** Loads Excel / Word / CSV / text in the browser and shows it. */
function DocumentPreview({ f, kind }: { f: FileRow; kind: ViewKind }) {
  const [state, setState] = useState<{ loading: boolean; error?: string; sheets?: { name: string; rows: unknown[][] }[]; html?: string; text?: string }>({ loading: true });
  const [sheet, setSheet] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (f.size > (kind === "excel" || kind === "word" ? 15 * 1024 * 1024 : MAX_TEXT)) throw new Error("This file is too big to preview here – please download it.");
        const res = await fetch(fileUrl(f.id), { credentials: "same-origin" });
        if (!res.ok) throw new Error("Could not load the file for preview. Please download it instead.");
        if (kind === "excel") {
          const { default: readXlsxFile } = await import("read-excel-file/browser");
          const sheets = await readXlsxFile(await res.blob());
          if (alive) setState({ loading: false, sheets: sheets.map((s) => ({ name: s.sheet, rows: s.data as unknown[][] })) });
        } else if (kind === "word") {
          const mammoth = await import("mammoth");
          const out = await mammoth.convertToHtml({ arrayBuffer: await res.arrayBuffer() });
          if (alive) setState({ loading: false, html: out.value });
        } else {
          const text = await res.text();
          if (alive) setState(kind === "csv" ? { loading: false, sheets: [{ name: "CSV", rows: parseCsv(text) }] } : { loading: false, text });
        }
      } catch (e) {
        if (alive) setState({ loading: false, error: e instanceof Error && e.message.length < 140 ? e.message : "This file could not be previewed. Please download it to open it." });
      }
    })();
    return () => {
      alive = false;
    };
  }, [f.id, f.size, kind]);

  if (state.loading) return <p className="text-sm text-white/70">Opening preview…</p>;
  if (state.error) return <NoPreview f={f} message={state.error} />;
  if (state.sheets) {
    const s = state.sheets[sheet] ?? state.sheets[0];
    return (
      <div className="flex size-full max-w-6xl flex-col gap-2" onClick={(e) => e.stopPropagation()}>
        {state.sheets.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {state.sheets.map((x, i) => (
              <button key={x.name + i} type="button" onClick={() => setSheet(i)} className={cx("rounded px-2.5 py-1 text-xs", i === sheet ? "bg-white text-ink" : "bg-white/10 text-white hover:bg-white/20")}>
                {x.name}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1">{s.rows.length ? <SheetTable rows={s.rows} /> : <p className="text-sm text-white/70">This sheet is empty.</p>}</div>
      </div>
    );
  }
  if (state.html != null)
    // the converted document is shown in a sandboxed frame (no scripts can run)
    return (
      <iframe
        title={f.originalName}
        sandbox=""
        className="size-full max-w-4xl rounded-lg bg-white"
        srcDoc={`<!doctype html><meta charset="utf-8"><style>body{font:14px/1.6 system-ui,sans-serif;color:#1c1917;padding:32px 40px;max-width:820px;margin:auto}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:4px 8px}</style>${state.html}`}
        onClick={(e) => e.stopPropagation()}
      />
    );
  return (
    <pre className="size-full max-w-5xl overflow-auto whitespace-pre-wrap rounded-lg bg-white p-4 text-xs text-ink" onClick={(e) => e.stopPropagation()}>
      {state.text}
    </pre>
  );
}

function NoPreview({ f, message }: { f: FileRow; message?: string }) {
  const ext = f.originalName.split(".").pop()?.toUpperCase();
  const hint: Record<string, string> = {
    DWG: "AutoCAD drawing – open it in AutoCAD / DWG viewer.",
    DXF: "AutoCAD drawing – open it in AutoCAD / DWG viewer.",
    SKP: "SketchUp model – open it in SketchUp.",
    HEIC: "iPhone photo format – most computers can open it after downloading.",
    HEIF: "iPhone photo format – most computers can open it after downloading.",
    ZIP: "Compressed folder – download and extract it.",
    RAR: "Compressed folder – download and extract it.",
    XLS: "Old Excel format – download to open in Excel.",
    DOC: "Old Word format – download to open in Word.",
    PPTX: "PowerPoint – download to open it.",
  };
  return (
    <div className="max-w-sm rounded-xl bg-white p-6 text-center text-ink" onClick={(e) => e.stopPropagation()}>
      <FileIcon className="mx-auto size-10 text-stone-400" />
      <p className="mt-3 break-all font-medium">{f.originalName}</p>
      <p className="mt-1 text-xs text-muted">
        {ext} · {fileSize(f.size)}
        {f.uploadedBy?.name ? ` · ${f.uploadedBy.name}` : ""}
        {f.createdAt ? ` · ${dateTime(f.createdAt)}` : ""}
      </p>
      <p className="mt-3 text-sm text-stone-600">{message ?? hint[ext ?? ""] ?? "This type of file can't be shown in the browser."}</p>
      <a href={fileUrl(f.id, true)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-stone-800">
        <Download className="size-4" /> Download
      </a>
    </div>
  );
}

/** Full-screen viewer for every kind of file: photos (zoom / rotate), PDF, video, Excel, Word, CSV, text. ← → to move, Esc to close. */
function FileViewer({ files, index, onIndex, onClose }: { files: FileRow[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const f = files[index];
  const count = files.length;
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const go = (i: number) => {
    setZoom(1);
    setRotate(0);
    onIndex((i + count) % count);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && count > 1) go(index + 1);
      if (e.key === "ArrowLeft" && count > 1) go(index - 1);
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(6, z * 1.25));
      if (e.key === "-") setZoom((z) => Math.max(0.25, z / 1.25));
    };
    window.addEventListener("keydown", h);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = overflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count, onClose]);
  if (!f) return null;
  const kind = viewKind(f);
  const nav = "absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/25";
  const tool = "rounded p-2 hover:bg-white/15 disabled:opacity-30";
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90" onClick={onClose} role="dialog" aria-label={`Preview of ${f.originalName}`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-white" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 truncate">
          {f.caption || f.originalName}{" "}
          <span className="text-white/50">
            · {index + 1} / {count} · {fileSize(f.size)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {kind === "image" && (
            <>
              <button type="button" className={tool} title="Zoom out (−)" onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}>
                <ZoomOut className="size-5" />
              </button>
              <button type="button" className="rounded px-2 py-1 text-xs tabular-nums hover:bg-white/15" title="Fit to screen" onClick={() => setZoom(1)}>
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" className={tool} title="Zoom in (+)" onClick={() => setZoom((z) => Math.min(6, z * 1.25))}>
                <ZoomIn className="size-5" />
              </button>
              <button type="button" className={tool} title="Rotate" onClick={() => setRotate((r) => (r + 90) % 360)}>
                <RotateCw className="size-5" />
              </button>
            </>
          )}
          {(kind === "pdf" || kind === "image" || kind === "video") && (
            <a href={fileUrl(f.id)} target="_blank" rel="noopener" className={tool} title="Open in a new tab">
              <ExternalLink className="size-5" />
            </a>
          )}
          <a href={fileUrl(f.id, true)} className={tool} title="Download original">
            <Download className="size-5" />
          </a>
          <button type="button" className={tool} title="Close (Esc)" onClick={onClose}>
            <X className="size-5" />
          </button>
        </span>
      </div>
      <div className={cx("relative flex min-h-0 flex-1 justify-center px-4 pb-4", kind === "image" && zoom > 1 ? "items-start overflow-auto" : "items-center")}>
        {kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={f.id}
            src={fileUrl(f.id)}
            alt={f.originalName}
            className={cx("rounded-lg object-contain transition-transform", zoom <= 1 && "max-h-full max-w-full")}
            style={{ transform: `scale(${zoom}) rotate(${rotate}deg)`, transformOrigin: zoom > 1 ? "top center" : "center" }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2))}
          />
        )}
        {kind === "pdf" && <iframe key={f.id} title={f.originalName} src={`${fileUrl(f.id)}#view=FitH`} className="size-full max-w-5xl rounded-lg bg-white" onClick={(e) => e.stopPropagation()} />}
        {kind === "video" && (
          <video key={f.id} src={fileUrl(f.id)} controls playsInline className="max-h-full max-w-full rounded-lg bg-black" onClick={(e) => e.stopPropagation()}>
            <track kind="captions" />
          </video>
        )}
        {(kind === "excel" || kind === "word" || kind === "csv" || kind === "text") && <DocumentPreview key={f.id} f={f} kind={kind} />}
        {kind === "none" && <NoPreview f={f} />}
        {count > 1 && (
          <>
            <button type="button" className={cx(nav, "left-4")} title="Previous (←)" onClick={(e) => (e.stopPropagation(), go(index - 1))}>
              <ChevronLeft className="size-6" />
            </button>
            <button type="button" className={cx(nav, "right-4")} title="Next (→)" onClick={(e) => (e.stopPropagation(), go(index + 1))}>
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="flex justify-center gap-2 overflow-x-auto px-4 pb-4" onClick={(e) => e.stopPropagation()}>
          {files.map((im, i) => (
            <button key={im.id} type="button" onClick={() => go(i)} title={im.originalName} className={cx("flex size-12 shrink-0 items-center justify-center overflow-hidden rounded border-2 bg-white/10 text-[9px] font-semibold text-white/80", i === index ? "border-white" : "border-transparent opacity-60")}>
              {viewKind(im) === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(im.id, false, true)} alt="" className="size-full object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
              ) : (
                im.originalName.split(".").pop()?.toUpperCase()
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FileGrid({ files, onRemove, onDelete, onEdit }: { files: FileRow[]; onRemove?: (id: string) => void; onDelete?: (id: string) => void; onEdit?: (f: FileRow) => void }) {
  const [index, setIndex] = useState<number | null>(null);
  if (!files.length) return null;
  const remove = onDelete ?? onRemove;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {files.map((f, i) => (
          <FileTile key={f.id} f={f} onOpen={() => setIndex(i)} onRemove={remove ? () => remove(f.id) : undefined} onEdit={onEdit ? () => onEdit(f) : undefined} />
        ))}
      </div>
      {index !== null && <FileViewer files={files} index={index} onIndex={setIndex} onClose={() => setIndex(null)} />}
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
  const [editing, setEditing] = useState<FileRow | null>(null);
  const [caption, setCaption] = useState("");
  const [editCat, setEditCat] = useState("other");
  const saveEdit = async () => {
    try {
      await api.patch(`/files/${editing!.id}`, { caption, category: editCat });
      setEditing(null);
      mutate();
    } catch (e) {
      toast.error(e);
    }
  };
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
          onEdit={canUpload ? (file) => (setEditing(file), setCaption(file.caption ?? ""), setEditCat(file.category ?? "other")) : undefined}
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
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit file details"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="truncate text-xs text-muted">{editing?.originalName}</p>
          <div>
            <label className="label">Caption</label>
            <input className="input" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Kitchen – wall A before work" />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={editCat} onChange={(e) => setEditCat(e.target.value)}>
              {FILE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
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
          {company.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(company.logo)} alt="" className="h-12 max-w-40 object-contain" />
          ) : (
            <span className="flex size-11 items-center justify-center rounded-lg bg-ink font-display text-lg font-bold text-white">LV</span>
          )}
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
