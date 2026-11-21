"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChevronLeft, ChevronRight, Download, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth";
import { invalidate, useList, type Row } from "@/hooks/use-api";
import { api, qs } from "@/lib/api-client";
import type { Option } from "@/lib/constants";
import type { Resource } from "@/lib/permissions";
import { EntitySelect, FormDrawer, type Field, type RefConfig } from "./form";
import { Button, cx, Empty, IconButton, LoadError, Menu, MenuItem, PageHeader, Skeleton, useConfirm, useToast } from "./ui";

export type Column<T = Row> = {
  key: string;
  label: ReactNode;
  render?: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  hideOnMobile?: boolean;
  /** Value written to the CSV/Excel export (defaults to the raw field). */
  csv?: (row: T) => unknown;
};

/* ------------------------------- CSV export ------------------------------ */
function csvCell(v: unknown): string | number {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(csvCell).join("; ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return String(o.name ?? o.projectNo ?? o.poNo ?? o.woNo ?? o.invoiceNo ?? o.mrNo ?? o.title ?? o.id ?? "");
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return v as string | number;
}

/** Download every row matching the current filters (up to 5000) as a CSV that opens in Excel. */
export async function exportCsv(endpoint: string, params: Record<string, unknown>, columns: Column[], name: string) {
  const all: Row[] = [];
  for (let page = 1; page <= 25; page++) {
    const r = await api.list<Row>(`${endpoint}${qs({ ...params, page, limit: 200 })}`);
    all.push(...r.data);
    if (!r.meta || page >= r.meta.pages) break;
  }
  const cols = columns.filter((c) => c.csv || typeof c.label === "string");
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = cols.map((c) => esc(typeof c.label === "string" && c.label ? c.label : c.key)).join(",");
  const body = all.map((r) => cols.map((c) => esc(csvCell(c.csv ? c.csv(r) : (r as Record<string, unknown>)[c.key]))).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + header + "\n" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return all.length;
}

export function ExportButton({ onExport }: { onExport: () => Promise<number> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      icon={<Download className="size-4" />}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const n = await onExport();
          toast.success(`Exported ${n} row${n === 1 ? "" : "s"}`);
        } catch (e) {
          toast.error(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      Export
    </Button>
  );
}

export function DataTable<T extends Row>({
  columns,
  rows,
  loading,
  onRowClick,
  empty,
  rowActions,
  footer,
  error,
  onRetry,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  rowActions?: (row: T) => ReactNode;
  footer?: ReactNode;
  /** load error → explain it instead of showing "nothing found" */
  error?: unknown;
  onRetry?: () => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line bg-stone-50/70 text-left">
            {columns.map((c) => (
              <th key={c.key} className={cx("whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500", c.align === "right" && "text-right", c.align === "center" && "text-center", c.hideOnMobile && "hidden md:table-cell")}>
                {c.label}
              </th>
            ))}
            {rowActions && <th className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                  {rowActions && <td />}
                </tr>
              ))
            : rows.map((r) => (
                <tr key={r.id} onClick={() => onRowClick?.(r)} className={cx("border-b border-line transition last:border-0", onRowClick && "cursor-pointer hover:bg-brand-50/40")}>
                  {columns.map((c) => (
                    <td key={c.key} className={cx("px-4 py-3 align-middle", c.align === "right" && "text-right tabular-nums", c.align === "center" && "text-center", c.hideOnMobile && "hidden md:table-cell", c.className)}>
                      {c.render ? c.render(r) : (r as any)[c.key] ?? <span className="text-stone-300">—</span>}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {rowActions(r)}
                    </td>
                  )}
                </tr>
              ))}
        </tbody>
        {footer}
      </table>
      {!loading && rows.length === 0 && (error ? <LoadError compact error={error} onRetry={onRetry} /> : (empty ?? <Empty />))}
    </div>
  );
}

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (!total) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-muted">
      <span>
        {total} record{total === 1 ? "" : "s"}
      </span>
      <div className="flex items-center gap-1">
        <IconButton label="Previous" disabled={page <= 1} onClick={() => onPage(page - 1)} className="disabled:opacity-30">
          <ChevronLeft className="size-4" />
        </IconButton>
        <span>
          Page {page} of {Math.max(1, pages)}
        </span>
        <IconButton label="Next" disabled={page >= pages} onClick={() => onPage(page + 1)} className="disabled:opacity-30">
          <ChevronRight className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => v !== value && onChange(v), 300);
    return () => clearTimeout(t);
  }, [v, value, onChange]);
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
      <input className="input pl-9" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export type FilterDef = { name: string; label: string; options?: readonly Option[]; ref?: RefConfig };

export function FilterBar({ filters, values, onChange }: { filters: FilterDef[]; values: Record<string, any>; onChange: (k: string, v: any) => void }) {
  return (
    <>
      {filters.map((f) =>
        f.ref ? (
          <EntitySelect key={f.name} className="w-full sm:w-52" value={values[f.name] ?? null} onChange={(id) => onChange(f.name, id ?? "")} config={f.ref} placeholder={f.label} />
        ) : (
          <select key={f.name} className="input w-full sm:w-44" value={values[f.name] ?? ""} onChange={(e) => onChange(f.name, e.target.value)}>
            <option value="">{f.label}: All</option>
            {f.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )
      )}
    </>
  );
}

/* ------------------------------ Resource page ---------------------------- */
export type ResourcePageProps = {
  title?: string;
  subtitle?: ReactNode;
  endpoint: string;
  resource: Resource;
  columns: Column[];
  fields?: Field[];
  filters?: FilterDef[];
  defaults?: Record<string, any>;
  baseParams?: Record<string, unknown>;
  rowHref?: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  searchPlaceholder?: string;
  createLabel?: string;
  entityName?: string;
  headerActions?: ReactNode;
  rowMenu?: (row: Row, reload: () => void) => ReactNode;
  embedded?: boolean;
  canCreate?: boolean;
  canDelete?: boolean;
  transform?: (payload: Record<string, any>) => Record<string, any>;
  sort?: string;
  limit?: number;
  invalidates?: string[];
  formModal?: boolean;
  topContent?: ReactNode;
  onCreate?: () => void;
  /** Merged into the payload on create (e.g. { project: id } inside a site tab). */
  createExtra?: Record<string, any>;
};

export function ResourcePage(p: ResourcePageProps) {
  const router = useRouter();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);

  const params = { q, page, limit: p.limit ?? 20, sort: p.sort, ...p.baseParams, ...filterValues };
  const { rows, meta, loading, mutate, error } = useList(p.endpoint, params);
  const reload = () => {
    mutate();
    if (p.invalidates) invalidate(...p.invalidates);
  };

  const canWrite = can(`${p.resource}:write`);
  const canDelete = p.canDelete !== false && can(`${p.resource}:delete`);
  const name = p.entityName ?? "record";

  // ?open=<id> (from global search / notifications) and ?<filter>=value (deep links)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("open");
    if (id && p.fields) api.get<Row>(`${p.endpoint}/${id}`).then(setEditing).catch(() => undefined);
    const init: Record<string, string> = {};
    for (const f of p.filters ?? []) if (sp.get(f.name)) init[f.name] = sp.get(f.name)!;
    if (Object.keys(init).length) setFilterValues(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.endpoint]);

  const openEdit = async (row: Row) => {
    try {
      setEditing(await api.get<Row>(`${p.endpoint}/${row.id}`));
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = async (row: Row) => {
    if (!(await confirm({ title: `Delete this ${name}?`, message: "This cannot be undone.", confirmText: "Delete", danger: true }))) return;
    try {
      await api.del(`${p.endpoint}/${row.id}`);
      toast.success("Deleted");
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  const click = p.onRowClick ?? (p.rowHref ? (r: Row) => router.push(p.rowHref!(r)) : p.fields && canWrite ? openEdit : undefined);

  const actions =
    p.rowMenu || (p.fields && canWrite) || canDelete
      ? (row: Row) => (
          <Menu
            trigger={
              <IconButton label="Actions">
                <MoreHorizontal className="size-4" />
              </IconButton>
            }
          >
            {p.fields && canWrite && (
              <MenuItem icon={<Pencil className="size-4" />} onClick={() => openEdit(row)}>
                Edit
              </MenuItem>
            )}
            {p.rowMenu?.(row, reload)}
            {canDelete && (
              <MenuItem danger icon={<Trash2 className="size-4" />} onClick={() => remove(row)}>
                Delete
              </MenuItem>
            )}
          </Menu>
        )
      : undefined;

  const exportBtn = (
    <ExportButton onExport={() => exportCsv(p.endpoint, { q, sort: p.sort, ...p.baseParams, ...filterValues }, p.columns, p.title ?? p.entityName ?? "export")} />
  );
  const createBtn =
    (p.fields || p.onCreate) && canWrite && p.canCreate !== false ? (
      <Button icon={<Plus className="size-4" />} onClick={() => (p.onCreate ? p.onCreate() : setCreating(true))}>
        {p.createLabel ?? "Add"}
      </Button>
    ) : null;

  return (
    <div>
      {!p.embedded && (
        <PageHeader
          title={p.title}
          subtitle={p.subtitle}
          actions={
            <>
              {p.headerActions}
              {exportBtn}
              {createBtn}
            </>
          }
        />
      )}
      {p.topContent}
      <div className="card overflow-visible">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder={p.searchPlaceholder}
          />
          {p.filters && (
            <FilterBar
              filters={p.filters}
              values={filterValues}
              onChange={(k, v) => {
                setFilterValues((f) => ({ ...f, [k]: v }));
                setPage(1);
              }}
            />
          )}
          {p.embedded && <div className="ml-auto flex gap-2">{p.headerActions}{exportBtn}{createBtn}</div>}
        </div>
        <DataTable columns={p.columns} rows={rows} loading={loading} error={error} onRetry={() => mutate()} onRowClick={click} rowActions={actions} empty={<Empty title={`No ${name}s found`} hint={canWrite && p.fields ? `Click "${p.createLabel ?? "Add"}" to create one.` : undefined} />} />
        {meta && <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />}
      </div>
      {p.fields && (
        <FormDrawer
          open={creating || !!editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
            if (new URLSearchParams(window.location.search).has("open")) window.history.replaceState(null, "", window.location.pathname);
          }}
          title={editing ? `Edit ${name}` : `New ${name}`}
          fields={p.fields}
          endpoint={p.endpoint}
          record={editing}
          defaults={{ ...p.defaults, ...p.createExtra }}
          onSaved={reload}
          transform={(pl) => {
            const t = p.transform ? p.transform(pl) : pl;
            return editing ? t : { ...p.createExtra, ...t };
          }}
          modal={p.formModal}
        />
      )}
    </div>
  );
}
