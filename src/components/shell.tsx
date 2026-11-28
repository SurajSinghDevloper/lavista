"use client";

import {
  BarChart3,
  Bell,
  Boxes,
  Briefcase,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Hammer,
  HardHat,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu as MenuIcon,
  Palette,
  PhoneCall,
  Receipt,
  Search,
  ListChecks,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  User,
  UserCheck,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { ROLES, labelOf } from "@/lib/constants";
import { relative } from "@/lib/format";
import type { Permission } from "@/lib/permissions";
import { invalidate, useList, useOne } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { OptionsReady, useAuth } from "./auth";
import { Avatar, Button, cx, IconButton, Menu, MenuItem, useToast } from "./ui";

type NavItem = { href: string; label: string; icon: LucideIcon; perm?: Permission | Permission[] };
const NAV: { group: string; items: NavItem[] }[] = [
  { group: "", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard:read" }] },
  {
    group: "Sales",
    items: [
      { href: "/leads", label: "Leads", icon: PhoneCall, perm: "leads:read" },
      { href: "/follow-ups", label: "Follow-ups", icon: CalendarCheck, perm: "followups:read" },
      { href: "/site-visits", label: "Site Visits", icon: MapPin, perm: "site_visits:read" },
      { href: "/clients", label: "Clients", icon: Users, perm: "clients:read" },
    ],
  },
  {
    group: "Projects",
    items: [
      { href: "/projects", label: "Sites", icon: Building2, perm: "projects:read" },
      { href: "/designs", label: "Designs & Renders", icon: Palette, perm: "designs:read" },
      { href: "/quotations", label: "Quotations", icon: FileSpreadsheet, perm: "quotations:read" },
    ],
  },
  {
    group: "Execution",
    items: [
      { href: "/tasks", label: "Tasks", icon: ClipboardList, perm: "tasks:read" },
      { href: "/daily-reports", label: "Daily Site Reports", icon: FileText, perm: "daily_reports:read" },
      { href: "/checklists", label: "QC Checklists", icon: ClipboardCheck, perm: "checklists:read" },
      { href: "/contractors", label: "Contractors", icon: HardHat, perm: "contractors:read" },
      { href: "/work-orders", label: "Work Orders", icon: Hammer, perm: "workorders:read" },
    ],
  },
  {
    group: "Procurement",
    items: [
      { href: "/procurement/requests", label: "Material Requests", icon: ClipboardList, perm: "material_requests:read" },
      { href: "/procurement/orders", label: "Purchase Orders", icon: ShoppingCart, perm: "purchase_orders:read" },
      { href: "/procurement/grn", label: "Goods Receipt (GRN)", icon: Truck, perm: "grn:read" },
      { href: "/inventory", label: "Factory Stock", icon: Boxes, perm: "inventory:read" },
      { href: "/vendors", label: "Vendors", icon: Briefcase, perm: "vendors:read" },
    ],
  },
  {
    group: "Accounts",
    items: [
      { href: "/accounts", label: "Site Accounts", icon: Wallet, perm: "accounts:read" },
      { href: "/accounts/payments", label: "Payments Received", icon: Receipt, perm: "payments:read" },
      { href: "/accounts/invoices", label: "Bills / Invoices", icon: FileText, perm: "invoices:read" },
      { href: "/accounts/expenses", label: "Expenses", icon: Wallet, perm: "expenses:read" },
      { href: "/reports", label: "Reports", icon: BarChart3, perm: "reports:read" },
    ],
  },
  {
    group: "Team",
    items: [
      { href: "/team", label: "Team Members", icon: Users, perm: "users:read" },
      { href: "/team/attendance", label: "Attendance", icon: UserCheck, perm: "attendance:read" },
      { href: "/team/roles", label: "Roles & Permissions", icon: ShieldCheck, perm: "users:read" },
      { href: "/settings/options", label: "Dropdown Options", icon: ListChecks, perm: "settings:write" },
      { href: "/settings", label: "Settings", icon: Settings, perm: "settings:write" },
    ],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const all = NAV.flatMap((g) => g.items.map((i) => i.href));
  const active = (href: string) =>
    pathname === href || (pathname.startsWith(href + "/") && !all.some((h) => h !== href && h.startsWith(href) && pathname.startsWith(h)));
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-6">
      {NAV.map((g) => {
        const items = g.items.filter((i) => !i.perm || can(i.perm));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            {g.group && <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">{g.group}</p>}
            <ul className="space-y-0.5">
              {items.map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    className={cx(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
                      active(i.href) ? "bg-white/10 text-white" : "text-stone-400 hover:bg-white/5 hover:text-stone-100"
                    )}
                  >
                    <i.icon className={cx("size-4", active(i.href) ? "text-brand-300" : "")} />
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-5 py-5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-brand-500 font-display text-lg font-bold text-white">LV</span>
      <span>
        <span className="block font-display text-xl font-semibold leading-none tracking-wide text-white">LA-VISTA</span>
        <span className="mt-1 block text-[10px] uppercase tracking-[0.2em] text-stone-500">Interiors ERP</span>
      </span>
    </Link>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-ink lg:flex">
        <Brand />
        <Suspense fallback={<div className="flex-1" />}>
          <NavLinks />
        </Suspense>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden" onClick={onClose}>
          <aside className="flex w-72 flex-col bg-ink" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button onClick={onClose} className="rounded p-2 text-stone-400 hover:text-white" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <Suspense fallback={<div className="flex-1" />}>
              <NavLinks onNavigate={onClose} />
            </Suspense>
          </aside>
          <div className="flex-1 bg-black/40" />
        </div>
      )}
    </>
  );
}

/* ------------------------------ Global search ---------------------------- */
type Hit = { type: string; id: string; title: string; subtitle?: string; href: string };
function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => api.get<Hit[]>(`/search?q=${encodeURIComponent(q)}`).then((h) => (setHits(h), setIdx(0))).catch(() => setHits([])), 200);
    return () => clearTimeout(t);
  }, [q]);

  const go = (h: Hit) => {
    setOpen(false);
    setQ("");
    router.push(h.href);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-line bg-stone-50 px-3 text-sm text-stone-400 transition hover:border-stone-300">
        <Search className="size-4" />
        <span className="flex-1 truncate whitespace-nowrap text-left"><span className="sm:hidden">Search…</span><span className="hidden sm:inline">Search leads, sites, clients, POs…</span></span>
        <kbd className="hidden rounded border border-line bg-white px-1.5 text-[10px] font-medium text-stone-500 sm:inline">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-stone-900/40 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-5 text-stone-400" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  if (e.key === "ArrowDown") setIdx((i) => Math.min(i + 1, hits.length - 1));
                  if (e.key === "ArrowUp") setIdx((i) => Math.max(i - 1, 0));
                  if (e.key === "Enter" && hits[idx]) go(hits[idx]);
                }}
                placeholder="Search by name, phone, number…"
                className="h-14 flex-1 bg-transparent text-base outline-none"
              />
            </div>
            <div className="max-h-[50vh] overflow-y-auto py-2">
              {q.length >= 2 && hits.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No results</p>}
              {hits.map((h, i) => (
                <button key={h.type + h.id} onMouseEnter={() => setIdx(i)} onClick={() => go(h)} className={cx("flex w-full items-center gap-3 px-4 py-2.5 text-left", i === idx && "bg-brand-50")}>
                  <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-stone-400">{h.type}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{h.title}</span>
                    {h.subtitle && <span className="block truncate text-xs text-muted">{h.subtitle}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------ Notifications ---------------------------- */
type Notif = { id: string; title: string; message?: string; link?: string; read: boolean; createdAt: string };
function Notifications() {
  const router = useRouter();
  const { rows, meta, mutate } = useList<Notif>("/notifications", { limit: 20 }, { refreshInterval: 60_000 });
  const unread = (meta?.unread as number) ?? 0;
  const markAll = async () => {
    await api.post("/notifications/read", { all: true });
    mutate();
  };
  return (
    <Menu
      trigger={
        <IconButton label="Notifications" className="relative">
          <Bell className="size-[18px]" />
          {unread > 0 && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
        </IconButton>
      }
    >
      <div className="w-80">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button className="text-xs text-brand-700 hover:underline" onClick={markAll}>
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {rows.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted">You&apos;re all caught up</p>}
          {rows.map((n) => (
            <button
              key={n.id}
              onClick={async () => {
                if (!n.read) await api.post("/notifications/read", { ids: [n.id] });
                mutate();
                if (n.link) router.push(n.link);
              }}
              className={cx("block w-full border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-stone-50", !n.read && "bg-brand-50/50")}
            >
              <p className="text-sm font-medium">{n.title}</p>
              {n.message && <p className="line-clamp-2 text-xs text-stone-600">{n.message}</p>}
              <p className="mt-0.5 text-[10px] text-stone-400">{relative(n.createdAt)}</p>
            </button>
          ))}
        </div>
      </div>
    </Menu>
  );
}

/* ------------------------------- Attendance ------------------------------ */
function AttendanceButton() {
  const toast = useToast();
  const { can } = useAuth();
  const { data, mutate } = useOne<{ checkIn?: string; checkOut?: string } | null>(can("attendance:write") ? "/attendance/today" : null);
  if (!can("attendance:write")) return null;
  const locate = () =>
    new Promise<{ lat: number; lng: number } | null>((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(
        (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => res(null),
        { timeout: 5000 }
      );
    });
  const act = async (kind: "check-in" | "check-out") => {
    try {
      await api.post(`/attendance/${kind}`, { location: await locate() });
      toast.success(kind === "check-in" ? "Checked in" : "Checked out");
      mutate();
      invalidate("/attendance");
    } catch (e) {
      toast.error(e);
    }
  };
  if (data?.checkOut) return <span className="hidden text-xs text-emerald-700 md:inline">Day complete ✓</span>;
  return data?.checkIn ? (
    <Button size="sm" variant="secondary" onClick={() => act("check-out")}>
      Check out
    </Button>
  ) : (
    <Button size="sm" variant="brand" onClick={() => act("check-in")}>
      Check in
    </Button>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  return (
    <Menu
      trigger={
        <button className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-stone-100">
          <Avatar name={user?.name} />
          <span className="hidden text-left md:block">
            <span className="block text-sm font-medium leading-tight">{user?.name}</span>
            <span className="block text-[11px] leading-tight text-muted">{labelOf(ROLES, user?.role)}</span>
          </span>
        </button>
      }
    >
      <MenuItem href="/profile" icon={<User className="size-4" />}>
        My profile & security
      </MenuItem>
      <MenuItem danger onClick={logout} icon={<LogOut className="size-4" />}>
        Log out
      </MenuItem>
    </Menu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const { user, loading } = useAuth();
  return (
    <div className="min-h-screen">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur no-print sm:px-6">
          <IconButton label="Menu" className="lg:hidden" onClick={() => setMenu(true)}>
            <MenuIcon className="size-5" />
          </IconButton>
          <div className="flex-1">
            <GlobalSearch />
          </div>
          <AttendanceButton />
          <Notifications />
          <UserMenu />
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
          {user?.mustChangePassword && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 no-print">
              Please <Link href="/profile" className="font-semibold underline">change your password</Link> – your account is using a temporary password.
            </div>
          )}
          {loading && !user && <div className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-brand-400" />}
          <OptionsReady>{children}</OptionsReady>
        </main>
      </div>
    </div>
  );
}
