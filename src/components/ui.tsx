"use client";

import { clsx } from "clsx";
import { Loader2, X } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { colorOf, labelOf, type Option } from "@/lib/constants";
import { initials } from "@/lib/format";

export const cx = clsx;

/* --------------------------------- Button -------------------------------- */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "brand" | "success";
const btnVariants: Record<BtnVariant, string> = {
  primary: "bg-ink text-white hover:bg-stone-800 shadow-xs",
  brand: "bg-brand-600 text-white hover:bg-brand-700 shadow-xs",
  secondary: "bg-white text-ink border border-line hover:bg-stone-50 shadow-xs",
  ghost: "text-stone-600 hover:bg-stone-100 hover:text-ink",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-xs",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs",
};
const btnSizes = { xs: "h-7 px-2 text-xs gap-1", sm: "h-8 px-3 text-xs gap-1.5", md: "h-9 px-3.5 text-sm gap-2", lg: "h-11 px-5 text-sm gap-2" };

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  className,
  children,
  href,
  ...props
}: ComponentProps<"button"> & { variant?: BtnVariant; size?: keyof typeof btnSizes; loading?: boolean; icon?: ReactNode; href?: string }) {
  const cls = cx(
    "inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
    btnVariants[variant],
    btnSizes[size],
    className
  );
  const content = (
    <>
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} disabled={loading || props.disabled} {...props}>
      {content}
    </button>
  );
}

export function IconButton({ className, label, ...props }: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cx("inline-flex size-8 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-ink", className)}
      {...props}
    />
  );
}

/* --------------------------------- Badge --------------------------------- */
const badgeColors: Record<string, string> = {
  gray: "bg-stone-100 text-stone-700 ring-stone-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  purple: "bg-purple-50 text-purple-700 ring-purple-200",
  pink: "bg-pink-50 text-pink-700 ring-pink-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  yellow: "bg-yellow-50 text-yellow-800 ring-yellow-200",
  lime: "bg-lime-50 text-lime-800 ring-lime-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
};

export function Badge({ color = "gray", children, className }: { color?: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", badgeColors[color] ?? badgeColors.gray, className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ options, value, className }: { options: readonly Option[]; value?: string | null; className?: string }) {
  if (!value) return null;
  return (
    <Badge color={colorOf(options, value)} className={className}>
      {labelOf(options, value)}
    </Badge>
  );
}

/* ---------------------------------- Card --------------------------------- */
export function Card({ className, children, title, action, padded = true }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode; padded?: boolean }) {
  return (
    <section className={cx("card", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {action}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, icon, tone = "default", href }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "default" | "good" | "bad" | "warn" | "brand"; href?: string }) {
  const tones = { default: "text-ink", good: "text-emerald-700", bad: "text-red-600", warn: "text-amber-700", brand: "text-brand-700" };
  const body = (
    <div className="card flex h-full items-start justify-between gap-3 p-4 transition hover:border-stone-300">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className={cx("mt-1 truncate text-2xl font-semibold tracking-tight", tones[tone])}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
      {icon && <div className="rounded-lg bg-brand-50 p-2 text-brand-600">{icon}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Progress({ value, className, tone }: { value?: number; className?: string; tone?: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-stone-100", className)}>
      <div className={cx("h-full rounded-full transition-all", tone ?? (v >= 100 ? "bg-emerald-500" : "bg-brand-500"))} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Avatar({ name, size = "md" }: { name?: string; size?: "sm" | "md" | "lg" }) {
  const s = { sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-12 text-base" }[size];
  return <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800", s)}>{initials(name)}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-stone-400", className)} />;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      <Spinner /> {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-stone-200/70", className)} />;
}

export function Empty({ title = "Nothing here yet", hint, action, icon }: { title?: string; hint?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      {icon && <div className="mb-1 rounded-full bg-stone-100 p-3 text-stone-400">{icon}</div>}
      <p className="text-sm font-medium text-stone-700">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function KV({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children || <span className="text-stone-300">—</span>}</dd>
    </div>
  );
}

/* ---------------------------------- Tabs --------------------------------- */
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx("-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cx(
            "relative -mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition",
            value === t.value ? "border-brand-500 text-ink" : "border-transparent text-stone-500 hover:text-ink"
          )}
        >
          {t.label}
          {t.count != null && <span className="rounded-full bg-stone-100 px-1.5 text-[10px] text-stone-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-white p-0.5 shadow-xs">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cx("whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition", value === o.value ? "bg-ink text-white" : "text-stone-600 hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Modal / Drawer --------------------------- */
function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

export function Modal({ open, onClose, title, children, footer, size = "md" }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  useEscape(open, onClose);
  if (!open) return null;
  const w = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal className={cx("flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl", w)}>
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-stone-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, footer, width = "max-w-2xl", subtitle }: { open: boolean; onClose: () => void; title?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-stone-900/30 backdrop-blur-[1px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal className={cx("flex h-full w-full flex-col bg-white shadow-2xl", width)}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            {subtitle && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-stone-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------- Toast -------------------------------- */
type Toast = { id: number; kind: "success" | "error" | "info"; message: string };
const ToastCtx = createContext<{ push: (kind: Toast["kind"], message: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((kind: Toast["kind"], message: string) => {
    const id = ++idRef.current;
    setItems((x) => [...x, { id, kind, message }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-lg",
              t.kind === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
              t.kind === "error" && "border-red-200 bg-red-50 text-red-800",
              t.kind === "info" && "border-line bg-white text-ink"
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  return {
    success: (m: string) => ctx?.push("success", m),
    error: (m: unknown) => ctx?.push("error", m instanceof Error ? m.message : String(m)),
    info: (m: string) => ctx?.push("info", m),
  };
}

/* ------------------------------ Confirm dialog --------------------------- */
type ConfirmOpts = { title: string; message?: ReactNode; confirmText?: string; danger?: boolean };
const ConfirmCtx = createContext<((o: ConfirmOpts) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={state?.danger ? "danger" : "primary"} onClick={() => close(true)}>
              {state?.confirmText ?? "Confirm"}
            </Button>
          </>
        }
      >
        <div className="text-sm text-stone-600">{state?.message}</div>
      </Modal>
    </ConfirmCtx>
  );
}

export function useConfirm() {
  const c = useContext(ConfirmCtx);
  return c ?? (async (o: ConfirmOpts) => window.confirm(o.title));
}

/* --------------------------------- Menu ---------------------------------- */
export function Menu({ trigger, children, align = "right" }: { trigger: ReactNode; children: ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div className={cx("absolute z-40 mt-1 min-w-48 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg", align === "right" ? "right-0" : "left-0")} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ children, onClick, danger, icon, href }: { children: ReactNode; onClick?: () => void; danger?: boolean; icon?: ReactNode; href?: string }) {
  const cls = cx("flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-stone-50", danger ? "text-red-600" : "text-stone-700");
  if (href)
    return (
      <Link href={href} className={cls}>
        {icon}
        {children}
      </Link>
    );
  return (
    <button type="button" className={cls} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}
