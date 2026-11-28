"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Check, ChevronDown, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiClientError, qs } from "@/lib/api-client";
import type { Option } from "@/lib/constants";
import { toInputDate, toInputDateTime } from "@/lib/format";
import { Button, cx, Drawer, Modal, useToast } from "./ui";

/* --------------------------------- Types --------------------------------- */
export type RefConfig = { endpoint: string; label?: string | ((r: any) => string); sub?: (r: any) => string; params?: Record<string, unknown> };

export type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "number"
    | "money"
    | "email"
    | "tel"
    | "url"
    | "textarea"
    | "select"
    | "multiselect"
    | "date"
    | "datetime"
    | "checkbox"
    | "ref"
    | "refs"
    | "password"
    | "rows"
    | "section";
  options?: readonly Option[];
  /** For type "rows": the columns of each row (text / number / money / select). */
  columns?: Field[];
  /** Label of the "add row" button for type "rows". */
  addLabel?: string;
  /** Turn the saved record into the form value (e.g. build rows from older fields). */
  load?: (row: Record<string, any>) => any;
  ref?: RefConfig;
  required?: boolean;
  placeholder?: string;
  span?: 1 | 2 | 3;
  help?: string;
  rows?: number;
  hidden?: (v: Record<string, any>) => boolean;
  disabled?: boolean | ((v: Record<string, any>) => boolean);
  min?: number;
  max?: number;
};

/* ------------------------------ Entity select ---------------------------- */
const refLabel = (cfg: RefConfig, r: any) =>
  !r ? "" : typeof cfg.label === "function" ? cfg.label(r) : r[cfg.label ?? ""] ?? r.name ?? r.title ?? r.projectNo ?? r.id;

const labelCache = new Map<string, string>();

export function EntitySelect({
  value,
  onChange,
  config,
  placeholder = "Search…",
  disabled,
  allowClear = true,
  className,
}: {
  value: any;
  onChange: (id: string | null, row?: any) => void;
  config: RefConfig;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
}) {
  const id: string | null = value && typeof value === "object" ? value.id : value || null;
  const [label, setLabel] = useState<string>(() => (value && typeof value === "object" ? refLabel(config, value) : id ? labelCache.get(id) ?? "" : ""));
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && typeof value === "object") setLabel(refLabel(config, value));
    else if (!id) setLabel("");
    else if (labelCache.has(id)) setLabel(labelCache.get(id)!);
    else
      api
        .get<any>(`${config.endpoint}/${id}`)
        .then((r) => {
          const l = refLabel(config, r);
          labelCache.set(id, l);
          setLabel(l);
        })
        .catch(() => setLabel("(unavailable)"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .list<any>(`${config.endpoint}${qs({ q, limit: 25, ...(config.params ?? {}) })}`)
        .then((r) => alive && setRows(r.data))
        .catch(() => alive && setRows([]))
        .finally(() => alive && setLoading(false));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open, config.endpoint, JSON.stringify(config.params)]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div className={cx("relative", className)} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="input flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed"
      >
        <span className={cx("truncate", !label && "text-stone-400")}>{label || placeholder}</span>
        <span className="flex items-center gap-1">
          {allowClear && id && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
                setLabel("");
              }}
              className="rounded p-0.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            >
              <X className="size-3.5" />
            </span>
          )}
          <ChevronDown className="size-4 text-stone-400" />
        </span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-64 overflow-hidden rounded-lg border border-line bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="size-4 text-stone-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {loading && rows.length === 0 && <p className="px-3 py-2 text-xs text-muted">Searching…</p>}
            {!loading && rows.length === 0 && <p className="px-3 py-2 text-xs text-muted">No matches</p>}
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  const l = refLabel(config, r);
                  labelCache.set(r.id, l);
                  setLabel(l);
                  onChange(r.id, r);
                  setOpen(false);
                  setQ("");
                }}
                className={cx("flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50", r.id === id && "bg-brand-50")}
              >
                <span className="min-w-0">
                  <span className="block truncate">{refLabel(config, r)}</span>
                  {config.sub && <span className="block truncate text-xs text-muted">{config.sub(r)}</span>}
                </span>
                {r.id === id && <Check className="mt-0.5 size-4 text-brand-600" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Multiple references (e.g. team members). */
export function EntityMultiSelect({ value, onChange, config }: { value: any[]; onChange: (ids: string[]) => void; config: RefConfig }) {
  const items: { id: string; label: string }[] = (value ?? []).map((v) => (typeof v === "object" ? { id: v.id, label: refLabel(config, v) } : { id: v, label: labelCache.get(v) ?? "…" }));
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((i) => (
            <span key={i.id} className="inline-flex items-center gap-1 rounded-full bg-stone-100 py-0.5 pl-2.5 pr-1 text-xs">
              {i.label}
              <button type="button" className="rounded-full p-0.5 hover:bg-stone-200" onClick={() => onChange(items.filter((x) => x.id !== i.id).map((x) => x.id))}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <EntitySelect
        value={null}
        config={config}
        placeholder="Add…"
        onChange={(id, row) => {
          if (!id || items.some((i) => i.id === id)) return;
          if (row) labelCache.set(id, refLabel(config, row));
          onChange([...items.map((i) => i.id), id]);
        }}
      />
    </div>
  );
}

export function MultiSelect({ options, value, onChange }: { options: readonly Option[]; value: string[]; onChange: (v: string[]) => void }) {
  const set = new Set(value ?? []);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = set.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(on ? [...set].filter((x) => x !== o.value) : [...set, o.value])}
            className={cx("rounded-full border px-2.5 py-1 text-xs transition", on ? "border-brand-400 bg-brand-50 text-brand-800" : "border-line bg-white text-stone-600 hover:border-stone-300")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- Rows editor ----------------------------- */
const isEmptyRow = (r: Record<string, any>, cols: Field[]) => cols.every((c) => isBlank(r?.[c.name]));

/** Small repeatable table, e.g. a contractor's rate card (trade · work · rate type · rate). */
export function RowsInput({ field, value, onChange, disabled }: { field: Field; value: any[]; onChange: (v: any[]) => void; disabled?: boolean }) {
  const cols = field.columns ?? [];
  const rows: Record<string, any>[] = Array.isArray(value) ? value : [];
  const set = (i: number, patch: Record<string, any>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const cell = (c: Field, r: Record<string, any>, i: number) => {
    const v = r[c.name];
    if (c.type === "select")
      return (
        <select className="input min-w-32 py-1.5" value={v ?? ""} disabled={disabled} onChange={(e) => set(i, { [c.name]: e.target.value })} aria-label={c.label}>
          <option value="">{c.placeholder ?? "Select…"}</option>
          {c.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    if (c.type === "number" || c.type === "money")
      return (
        <div className={c.type === "money" ? "input-group" : undefined}>
          {c.type === "money" && <span className="input-addon" aria-hidden>₹</span>}
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min={c.min ?? 0}
            className="input min-w-20 py-1.5 text-right tabular-nums"
            value={v ?? ""}
            disabled={disabled}
            aria-label={c.label}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            onChange={(e) => set(i, { [c.name]: e.target.value === "" ? "" : Number(e.target.value) })}
          />
        </div>
      );
    return <input className="input min-w-32 py-1.5" value={v ?? ""} placeholder={c.placeholder} disabled={disabled} aria-label={c.label} onChange={(e) => set(i, { [c.name]: e.target.value })} />;
  };
  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500">
              <tr>
                {cols.map((c) => (
                  <th key={c.name} className="px-2 py-1.5 font-medium">
                    {c.label}
                    {c.required && <span className="text-red-500"> *</span>}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? r._id ?? i} className="border-t border-line align-top">
                  {cols.map((c) => (
                    <td key={c.name} className="px-1.5 py-1.5">
                      {cell(c, r, i)}
                    </td>
                  ))}
                  <td className="px-1 py-1.5 text-right">
                    {!disabled && (
                      <button type="button" title="Remove this line" className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!disabled && (
        <Button size="xs" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => onChange([...rows, {}])}>
          {field.addLabel ?? "Add line"}
        </Button>
      )}
    </div>
  );
}

/* ------------------------------ Field renderer --------------------------- */
export function FieldInput({ field, value, onChange, values }: { field: Field; value: any; onChange: (v: any) => void; values: Record<string, any> }) {
  const disabled = typeof field.disabled === "function" ? field.disabled(values) : field.disabled;
  const common = { id: `f-${field.name}`, disabled, placeholder: field.placeholder, required: field.required };
  switch (field.type) {
    case "textarea":
      return <textarea {...common} className="input min-h-20" rows={field.rows ?? 3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "select":
      return (
        <select {...common} className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">{field.placeholder ?? "Select…"}</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "multiselect":
      return <MultiSelect options={field.options ?? []} value={value ?? []} onChange={onChange} />;
    case "checkbox":
      return (
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-brand-600" checked={!!value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
          {field.placeholder ?? "Yes"}
        </label>
      );
    case "date":
      return <input {...common} type="date" className="input" value={toInputDate(value)} onChange={(e) => onChange(e.target.value)} />;
    case "datetime":
      return <input {...common} type="datetime-local" className="input" value={toInputDateTime(value)} onChange={(e) => onChange(e.target.value)} />;
    case "ref":
      return <EntitySelect value={value} onChange={(id) => onChange(id)} config={field.ref!} disabled={disabled} placeholder={field.placeholder ?? "Select…"} />;
    case "refs":
      return <EntityMultiSelect value={value ?? []} onChange={onChange} config={field.ref!} />;
    case "rows":
      return <RowsInput field={field} value={value ?? []} onChange={onChange} disabled={disabled} />;
    case "number":
    case "money":
      return (
        <div className={field.type === "money" ? "input-group" : undefined}>
          {field.type === "money" && <span className="input-addon" aria-hidden>₹</span>}
          <input
            {...common}
            type="number"
            inputMode="decimal"
            step="any"
            min={field.min ?? (field.type === "money" ? 0 : undefined)}
            max={field.max}
            className="input"
            value={value ?? ""}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
      );
    default:
      return <input {...common} type={field.type ?? "text"} className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} autoComplete={field.type === "password" ? "new-password" : undefined} />;
  }
}

export function FormGrid({ fields, values, setValue, errors }: { fields: Field[]; values: Record<string, any>; setValue: (k: string, v: any) => void; errors?: Record<string, string> }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
      {fields.map((f) => {
        if (f.hidden?.(values)) return null;
        if (f.type === "section")
          return (
            <h4 key={f.name} className="col-span-full mt-2 border-b border-line pb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
              {f.label}
            </h4>
          );
        const span = f.span === 1 ? "" : f.type === "textarea" || f.type === "multiselect" || f.type === "refs" || f.type === "rows" || f.span === 2 ? "sm:col-span-2" : "";
        return (
          <div key={f.name} className={span}>
            {f.type !== "checkbox" || f.label ? (
              <label htmlFor={`f-${f.name}`} className="label">
                {f.label}
                {f.required && <span className="text-red-500"> *</span>}
              </label>
            ) : null}
            <FieldInput field={f} value={values[f.name]} values={values} onChange={(v) => setValue(f.name, v)} />
            {errors?.[f.name] ? <p className="mt-1 text-xs text-red-600">{errors[f.name]}</p> : f.help ? <p className="mt-1 text-xs text-muted">{f.help}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

/** "bank.ifsc" → row.bank?.ifsc */
const getPath = (row: Record<string, any> | null | undefined, name: string) =>
  name.includes(".") ? name.split(".").reduce<any>((o, k) => (o == null ? undefined : o[k]), row) : row?.[name];

/** Convert API record → form values (populated refs → id strings, dates kept). */
export function toFormValues(fields: Field[], row: Record<string, any> | null | undefined, defaults: Record<string, any> = {}) {
  const v: Record<string, any> = { ...defaults, ...(row?.id ? { id: row.id } : {}) };
  for (const f of fields) {
    if (f.type === "section") continue;
    const raw = f.load && row ? f.load(row) : getPath(row, f.name);
    if (raw === undefined) continue;
    if (f.type === "ref") v[f.name] = raw && typeof raw === "object" ? raw : raw ?? null;
    else if (f.type === "refs") v[f.name] = (raw ?? []).map((x: any) => (typeof x === "object" ? x : x));
    else v[f.name] = raw;
  }
  return v;
}

/** Form values → API payload. */
export function toPayload(fields: Field[], values: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const f of fields) {
    if (f.type === "section" || f.hidden?.(values)) continue;
    let v = values[f.name];
    if (v === undefined) continue;
    if (f.type === "ref") v = v && typeof v === "object" ? v.id : v || null;
    if (f.type === "refs") v = (v ?? []).map((x: any) => (typeof x === "object" ? x.id : x));
    if ((f.type === "number" || f.type === "money") && v === "") v = null;
    if ((f.type === "date" || f.type === "datetime") && v === "") v = null;
    if (f.type === "rows") {
      const cols = f.columns ?? [];
      v = (v ?? [])
        .filter((r: any) => r && !isEmptyRow(r, cols))
        .map((r: any) => {
          const o: Record<string, any> = r.id ? { id: r.id } : {};
          for (const c of cols) {
            let x = r[c.name];
            if ((c.type === "number" || c.type === "money") && x === "") x = null;
            if (x !== undefined) o[c.name] = x;
          }
          return o;
        });
    }
    if (f.type === "datetime" && v) v = new Date(v).toISOString();
    if (f.name.includes(".")) {
      // nested field, e.g. bank.ifsc → { bank: { ifsc } }
      const [head, ...rest] = f.name.split(".");
      let o = (out[head] ??= {});
      rest.slice(0, -1).forEach((k) => (o = o[k] ??= {}));
      o[rest[rest.length - 1]] = v;
    } else out[f.name] = v;
  }
  return out;
}

export function useFormState(initial: Record<string, any> | (() => Record<string, any>)) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  return {
    values,
    setValues,
    errors,
    setErrors,
    setValue: (k: string, v: any) => {
      setValues((x) => ({ ...x, [k]: v }));
      setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));
    },
  };
}

/** Empty for a required-field check (text, number, date, select, ref, multi-select). */
export function isBlank(v: unknown) {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return !(v as { id?: string }).id;
  return false;
}

export function errorsFrom(e: unknown): Record<string, string> {
  if (e instanceof ApiClientError && e.details) {
    return Object.fromEntries(e.details.map((d) => [d.path.split(".")[0], d.message]));
  }
  return {};
}

/* ------------------------------ Form drawer ------------------------------ */
export function FormDrawer({
  open,
  onClose,
  title,
  fields,
  endpoint,
  record,
  defaults,
  onSaved,
  transform,
  submitLabel,
  modal,
  extra,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  fields: Field[];
  endpoint: string; // e.g. "/vendors"
  record?: Record<string, any> | null; // edit when present
  defaults?: Record<string, any>;
  onSaved?: (row: any) => void;
  transform?: (payload: Record<string, any>) => Record<string, any>;
  submitLabel?: string;
  modal?: boolean;
  extra?: ReactNode;
}) {
  const toast = useToast();
  const form = useFormState(() => toFormValues(fields, record, defaults));
  const [saving, setSaving] = useState(false);

  // Fill the form when it opens or a different record is loaded – never on a background re-render,
  // otherwise whatever the person typed would be wiped (e.g. when an error message appears).
  useEffect(() => {
    if (open) {
      form.setValues(toFormValues(fields, record, defaults));
      form.setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record?.id]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    // check required fields here so people get "Client is required" next to the field, not a server error
    const missing = fields.filter((f) => f.required && f.type !== "section" && !f.hidden?.(form.values) && isBlank(form.values[f.name]));
    const badRows = fields
      .filter((f) => f.type === "rows" && !f.hidden?.(form.values))
      .flatMap((f) => {
        const cols = f.columns ?? [];
        const rows = (form.values[f.name] ?? []).filter((r: any) => r && !isEmptyRow(r, cols));
        return rows.some((r: any) => cols.some((c) => c.required && isBlank(r[c.name]))) ? [f] : [];
      });
    if (!missing.length && badRows.length) {
      const f = badRows[0];
      const need = (f.columns ?? []).filter((c) => c.required).map((c) => c.label).join(", ");
      form.setErrors({ [f.name]: `Each line needs: ${need}` });
      toast.error(`${f.label}: each line needs ${need}`);
      return;
    }
    if (missing.length) {
      form.setErrors(Object.fromEntries(missing.map((f) => [f.name, `${f.label} is required`])));
      toast.error(missing.length === 1 ? `${missing[0].label} is required` : `Please fill in the required fields: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      let payload = toPayload(fields, form.values);
      if (transform) payload = transform(payload);
      const row = record?.id ? await api.patch(`${endpoint}/${record.id}`, payload) : await api.post(endpoint, payload);
      toast.success(record?.id ? "Saved" : "Created");
      onSaved?.(row);
      onClose();
    } catch (err) {
      form.setErrors(errorsFrom(err));
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <form id="drawer-form" onSubmit={submit} className="space-y-4">
      <FormGrid fields={fields} values={form.values} setValue={form.setValue} errors={form.errors} />
      {extra}
    </form>
  );
  const footer = (
    <>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" form="drawer-form" loading={saving}>
        {submitLabel ?? (record?.id ? "Save changes" : "Create")}
      </Button>
    </>
  );
  return modal ? (
    <Modal open={open} onClose={onClose} title={title} footer={footer} size="lg">
      {body}
    </Modal>
  ) : (
    <Drawer open={open} onClose={onClose} title={title} footer={footer}>
      {body}
    </Drawer>
  );
}
