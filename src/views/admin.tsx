"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowDown, ArrowUp, Copy, Lock, Plus, RotateCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { mutate as swrMutate } from "swr";
import { useAuth } from "@/components/auth";
import { Badge, Button, Card, cx, LoadError, Loading, Modal, PageHeader, useConfirm, useToast } from "@/components/ui";
import { useOne } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { Option } from "@/lib/constants";
import { applyManagedOptions, MANAGED_KEYS, MANAGED_LISTS, slugify, type ManagedListKey, type OptionsPayload } from "@/lib/options";
import type { Resource } from "@/lib/permissions";

/* ============================ Dropdown options ============================ */
type ListState = { items: Option[]; removed?: Option[]; customized?: boolean };

export function OptionsManagerPage() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const editable = can("settings:write");
  const { data, error, isLoading, mutate } = useOne<{ lists: Record<ManagedListKey, ListState> }>("/settings/options");
  const [key, setKey] = useState<ManagedListKey>("trades");
  const [items, setItems] = useState<Option[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const saved = data?.lists?.[key];
  const def = MANAGED_LISTS[key];
  const locked = new Set<string>(def.locked ?? []);

  useEffect(() => {
    if (saved) setItems(saved.items.map((o) => ({ ...o })));
    setNewLabel("");
  }, [saved, key]);

  const dirty = useMemo(() => JSON.stringify(items) !== JSON.stringify(saved?.items ?? []), [items, saved]);
  const groups = useMemo(() => {
    const g: Record<string, ManagedListKey[]> = {};
    for (const k of MANAGED_KEYS) (g[MANAGED_LISTS[k].group] ??= []).push(k);
    return g;
  }, []);

  if (isLoading) return <Loading />;
  if (error && !data) return <LoadError error={error} onRetry={() => mutate()} />;

  const applied = (payload: OptionsPayload) => {
    applyManagedOptions(payload);
    swrMutate("/api/v1/settings/options", { data: payload }, { revalidate: false });
    mutate();
  };

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    if (items.some((o) => o.label.toLowerCase() === label.toLowerCase())) return toast.error(`"${label}" is already in the list.`);
    const base = slugify(label);
    let value = base;
    for (let n = 2; items.some((o) => o.value === value); n++) value = `${base}_${n}`.slice(0, 60);
    setItems([...items, { value, label }]);
    setNewLabel("");
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };
  const save = async () => {
    if (items.some((o) => !o.label.trim())) return toast.error("Every option needs a name.");
    setSaving(true);
    try {
      const payload = await api.put<OptionsPayload>(`/settings/options/${key}`, { items });
      applied(payload);
      toast.success(`${def.title} saved`);
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    if (!(await confirm({ title: `Reset "${def.title}"?`, message: "The list goes back to the options that came with the software. Records that use your own options keep showing their names.", confirmText: "Reset" }))) return;
    try {
      applied(await api.del<OptionsPayload>(`/settings/options/${key}`));
      toast.success("Back to the default list");
    } catch (e) {
      toast.error(e);
    }
  };
  const pick = async (k: ManagedListKey) => {
    if (dirty && !(await confirm({ title: "Discard unsaved changes?", message: `You changed "${def.title}" but did not save.`, confirmText: "Discard", danger: true }))) return;
    setKey(k);
  };

  return (
    <>
      <PageHeader title="Dropdown options" subtitle="Manage the choices shown in forms – trades, units, lead sources, expense categories… Add your own, rename or delete the default ones." />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card padded={false} className="h-fit">
          <nav className="divide-y divide-line">
            {Object.entries(groups).map(([g, keys]) => (
              <div key={g} className="py-2">
                <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">{g}</p>
                {keys.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => pick(k)}
                    className={cx("flex w-full items-center justify-between px-4 py-1.5 text-left text-sm hover:bg-stone-50", k === key && "bg-brand-50 font-medium text-brand-800")}
                  >
                    <span>{MANAGED_LISTS[k].title}</span>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      {data?.lists?.[k]?.customized && <span className="size-1.5 rounded-full bg-brand-500" title="Changed by you" />}
                      {data?.lists?.[k]?.items.length}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </Card>

        <Card
          title={def.title}
          action={
            editable && (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={reset} disabled={!saved?.customized}>
                  Reset to default
                </Button>
                <Button size="sm" icon={<Save className="size-4" />} loading={saving} disabled={!dirty} onClick={save}>
                  Save
                </Button>
              </div>
            )
          }
        >
          {def.help && <p className="mb-3 text-sm text-muted">{def.help}</p>}
          <ul className="divide-y divide-line rounded-lg border border-line">
            {items.map((o, i) => (
              <li key={o.value} className="flex items-center gap-2 px-2 py-1.5">
                <span className="w-6 text-right text-xs tabular-nums text-stone-400">{i + 1}</span>
                <input
                  className="input py-1.5"
                  value={o.label}
                  disabled={!editable}
                  maxLength={80}
                  onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  aria-label="Option name"
                />
                <code className="hidden w-36 shrink-0 truncate text-[11px] text-stone-400 sm:block" title="Internal code – stays the same when you rename">
                  {o.value}
                </code>
                {editable && (
                  <span className="flex shrink-0 items-center">
                    <button type="button" className="rounded p-1.5 text-stone-400 hover:bg-stone-100 disabled:opacity-30" disabled={i === 0} title="Move up" onClick={() => move(i, -1)}>
                      <ArrowUp className="size-4" />
                    </button>
                    <button type="button" className="rounded p-1.5 text-stone-400 hover:bg-stone-100 disabled:opacity-30" disabled={i === items.length - 1} title="Move down" onClick={() => move(i, 1)}>
                      <ArrowDown className="size-4" />
                    </button>
                    {locked.has(o.value) ? (
                      <span className="p-1.5 text-stone-300" title="Used by the software – can be renamed but not deleted">
                        <Lock className="size-4" />
                      </span>
                    ) : (
                      <button type="button" className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600" title="Delete" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <input className="input" placeholder={`Add a new option to "${def.title}"…`} value={newLabel} maxLength={80} onChange={(e) => setNewLabel(e.target.value)} />
              <Button type="submit" variant="secondary" icon={<Plus className="size-4" />} disabled={!newLabel.trim()}>
                Add
              </Button>
            </form>
          )}
          <p className="mt-3 text-xs text-muted">
            Deleting an option only removes it from the dropdowns – records that already use it keep showing its name. Renaming changes the name everywhere. <Lock className="inline size-3" /> = used by the software, can be renamed but not deleted.
            {dirty && <span className="ml-1 font-medium text-amber-700">You have unsaved changes.</span>}
          </p>
        </Card>
      </div>
    </>
  );
}

/* ========================== Roles & permissions =========================== */
type RoleRow = { value: string; label: string; color?: string; permissions: string[]; builtIn?: boolean; users?: number; defaultPermissions?: string[] | null };
type Act = "read" | "write" | "delete" | "approve" | "all";

const ACTIONS: { value: Act; label: string; hint: string }[] = [
  { value: "read", label: "View", hint: "Open and see the screen / records" },
  { value: "write", label: "Add & edit", hint: "Create new records and change them" },
  { value: "delete", label: "Delete", hint: "Delete records" },
  { value: "approve", label: "Approve", hint: "Approve / finalise (designs, quotations, material requests, stock adjustments)" },
  { value: "all", label: "All records", hint: "See everyone's records and all sites – not only their own or the sites they are assigned to" },
];

const RESOURCE_GROUPS: { group: string; items: { res: Resource; label: string; acts: Act[] }[] }[] = [
  {
    group: "Sales",
    items: [
      { res: "leads", label: "Leads", acts: ["read", "write", "delete", "all"] },
      { res: "followups", label: "Follow-ups", acts: ["read", "write", "delete", "all"] },
      { res: "site_visits", label: "Site visits & measurements", acts: ["read", "write", "delete", "all"] },
      { res: "clients", label: "Clients", acts: ["read", "write", "delete", "all"] },
    ],
  },
  {
    group: "Sites & design",
    items: [
      { res: "projects", label: "Sites / projects", acts: ["read", "write", "delete", "all"] },
      { res: "designs", label: "Designs (2D / 3D / renders)", acts: ["read", "write", "delete", "approve", "all"] },
      { res: "quotations", label: "Quotations", acts: ["read", "write", "delete", "approve", "all"] },
      { res: "tasks", label: "Tasks", acts: ["read", "write", "delete", "all"] },
      { res: "daily_reports", label: "Daily site reports", acts: ["read", "write", "delete", "all"] },
      { res: "checklists", label: "QC checklists", acts: ["read", "write", "delete", "all"] },
    ],
  },
  {
    group: "Purchase & stock",
    items: [
      { res: "vendors", label: "Vendors", acts: ["read", "write", "delete", "all"] },
      { res: "contractors", label: "Contractors", acts: ["read", "write", "delete", "all"] },
      { res: "workorders", label: "Work orders", acts: ["read", "write", "delete", "all"] },
      { res: "materials", label: "Material catalog", acts: ["read", "write", "delete"] },
      { res: "inventory", label: "Stock – issue / return / adjust", acts: ["read", "write", "approve"] },
      { res: "material_requests", label: "Material requests", acts: ["read", "write", "delete", "approve", "all"] },
      { res: "purchase_orders", label: "Purchase orders", acts: ["read", "write", "delete", "all"] },
      { res: "grn", label: "Goods received (GRN)", acts: ["read", "write", "delete", "all"] },
    ],
  },
  {
    group: "Accounts",
    items: [
      { res: "payments", label: "Client receipts", acts: ["read", "write", "delete", "all"] },
      { res: "invoices", label: "Bills / invoices", acts: ["read", "write", "delete", "all"] },
      { res: "expenses", label: "Expenses & payments out", acts: ["read", "write", "delete", "all"] },
      { res: "accounts", label: "Site accounts (profit / loss)", acts: ["read"] },
      { res: "reports", label: "Reports", acts: ["read"] },
    ],
  },
  {
    group: "Team & admin",
    items: [
      { res: "dashboard", label: "Dashboard", acts: ["read"] },
      { res: "users", label: "Team members", acts: ["read", "write", "delete"] },
      { res: "attendance", label: "Attendance", acts: ["read", "write", "delete", "all"] },
      { res: "files", label: "Files & photos", acts: ["read", "write", "delete", "all"] },
      { res: "settings", label: "Settings", acts: ["read", "write"] },
      { res: "audit", label: "Activity log", acts: ["read"] },
    ],
  },
];
const COLORS = ["blue", "pink", "amber", "green", "orange", "violet", "sky", "indigo", "red", "gray"];

export function RolesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = can("*" as any);
  const { data, error, isLoading, mutate } = useOne<RoleRow[]>("/settings/roles");
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [sel, setSel] = useState("manager");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<{ label: string; from: string } | null>(null);

  useEffect(() => {
    if (data) setRoles(data.map((r) => ({ ...r, permissions: [...r.permissions] })));
  }, [data]);
  const dirty = useMemo(() => JSON.stringify(roles.map(strip)) !== JSON.stringify((data ?? []).map(strip)), [roles, data]);

  if (isLoading) return <Loading />;
  if (error && !data) return <LoadError error={error} onRetry={() => mutate()} />;
  const role = roles.find((r) => r.value === sel) ?? roles[0];
  if (!role) return <Loading />;
  const isFull = role.permissions.includes("*");
  const editable = isAdmin && !isFull;
  const has = (res: string, act: Act) => isFull || role.permissions.includes(`${res}:${act}`);

  const update = (patch: Partial<RoleRow>) => setRoles((rs) => rs.map((r) => (r.value === role.value ? { ...r, ...patch } : r)));
  const toggle = (res: string, act: Act, on: boolean) => {
    let p = new Set(role.permissions);
    if (on) {
      p.add(`${res}:${act}`);
      if (act !== "read") p.add(`${res}:read`); // can't edit what you can't see
    } else if (act === "read") p = new Set([...p].filter((x) => !x.startsWith(`${res}:`)));
    else p.delete(`${res}:${act}`);
    update({ permissions: [...p] });
  };
  const setGroupAll = (items: { res: Resource; acts: Act[] }[], on: boolean) => {
    let p = new Set(role.permissions);
    for (const it of items)
      for (const a of it.acts) {
        if (on) p.add(`${it.res}:${a}`);
        else p.delete(`${it.res}:${a}`);
      }
    if (!on) p = new Set([...p].filter((x) => !items.some((it) => x.startsWith(`${it.res}:`))));
    update({ permissions: [...p] });
  };

  const save = async () => {
    setSaving(true);
    try {
      const out = await api.put<RoleRow[]>("/settings/roles", { roles: roles.map(strip) });
      await mutate(out as any, { revalidate: false });
      swrMutate("/api/v1/settings/options");
      swrMutate("/api/v1/auth/me");
      toast.success("Roles saved – changes apply to everyone within a few seconds");
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };
  const addRole = () => {
    if (!adding) return;
    const label = adding.label.trim();
    if (!label) return toast.error("Give the role a name.");
    if (roles.some((r) => r.label.toLowerCase() === label.toLowerCase())) return toast.error("A role with this name already exists.");
    let value = slugify(label);
    for (let n = 2; roles.some((r) => r.value === value); n++) value = `${slugify(label)}_${n}`;
    const from = roles.find((r) => r.value === adding.from);
    const perms = from?.permissions.includes("*") ? [] : [...(from?.permissions ?? ["dashboard:read"])];
    setRoles([...roles, { value, label, color: COLORS[roles.length % COLORS.length], permissions: perms, builtIn: false, users: 0 }]);
    setSel(value);
    setAdding(null);
  };
  const removeRole = async () => {
    if (role.users) return toast.error(`${role.users} team member(s) have this role. Move them to another role first.`);
    if (!(await confirm({ title: `Delete the role "${role.label}"?`, message: "Nobody has this role. It disappears after you save.", danger: true, confirmText: "Delete" }))) return;
    setRoles(roles.filter((r) => r.value !== role.value));
    setSel("manager");
  };

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        subtitle="Decide what each role can see and do. Team members get the permissions of their role."
        actions={
          isAdmin && (
            <>
              <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setAdding({ label: "", from: role.value === "admin" ? "staff" : role.value })}>
                New role
              </Button>
              <Button icon={<Save className="size-4" />} loading={saving} disabled={!dirty} onClick={save}>
                Save changes
              </Button>
            </>
          )
        }
      />
      {!isAdmin && <p className="mb-4 rounded-lg border border-line bg-stone-50 px-4 py-2 text-sm text-muted">Only the admin can change permissions. You can see what each role can do.</p>}
      {dirty && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">You have unsaved changes – click “Save changes”.</p>}
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card padded={false} className="h-fit">
          <ul className="divide-y divide-line">
            {roles.map((r) => (
              <li key={r.value}>
                <button type="button" onClick={() => setSel(r.value)} className={cx("flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-stone-50", r.value === role.value && "bg-brand-50")}>
                  <Badge color={r.color ?? "gray"}>{r.label}</Badge>
                  <span className="text-xs text-muted">{r.users ?? 0} people</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title={
            <span className="flex flex-wrap items-center gap-2">
              <ShieldCheck className="size-4 text-brand-600" />
              {editable ? (
                <input className="input w-56 py-1" value={role.label} maxLength={60} onChange={(e) => update({ label: e.target.value })} aria-label="Role name" />
              ) : (
                role.label
              )}
              {editable && (
                <select className="input w-28 py-1" value={role.color ?? "gray"} onChange={(e) => update({ color: e.target.value })} aria-label="Colour">
                  {COLORS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </span>
          }
          action={
            editable && (
              <div className="flex gap-2">
                {role.defaultPermissions && (
                  <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => update({ permissions: [...role.defaultPermissions!] })}>
                    Default
                  </Button>
                )}
                <Button size="sm" variant="secondary" icon={<Copy className="size-4" />} onClick={() => setAdding({ label: `${role.label} (copy)`, from: role.value })}>
                  Copy
                </Button>
                <Button size="sm" variant="secondary" icon={<Trash2 className="size-4" />} onClick={removeRole}>
                  Delete
                </Button>
              </div>
            )
          }
        >
          {isFull ? (
            <p className="text-sm text-muted">The admin role always has full access to everything, so nobody can be locked out. It can&apos;t be changed.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-stone-500">
                    <th className="py-2 pr-2 font-medium">Area</th>
                    {ACTIONS.map((a) => (
                      <th key={a.value} className="px-2 py-2 text-center font-medium" title={a.hint}>
                        {a.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                {RESOURCE_GROUPS.map((g) => (
                  <tbody key={g.group}>
                    <tr className="border-t border-line bg-stone-50">
                      <td colSpan={ACTIONS.length + 1} className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                        {g.group}
                        {editable && (
                          <span className="ml-3 font-normal normal-case tracking-normal">
                            <button type="button" className="text-brand-700 hover:underline" onClick={() => setGroupAll(g.items, true)}>
                              all
                            </button>
                            {" · "}
                            <button type="button" className="text-brand-700 hover:underline" onClick={() => setGroupAll(g.items, false)}>
                              none
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                    {g.items.map((it) => (
                      <tr key={it.res} className="border-t border-line">
                        <td className="py-1.5 pr-2">{it.label}</td>
                        {ACTIONS.map((a) => (
                          <td key={a.value} className="px-2 py-1.5 text-center">
                            {it.acts.includes(a.value) ? (
                              <input
                                type="checkbox"
                                className="size-4 accent-brand-600"
                                checked={has(it.res, a.value)}
                                disabled={!editable}
                                title={`${a.label}: ${a.hint}`}
                                onChange={(e) => toggle(it.res, a.value, e.target.checked)}
                              />
                            ) : (
                              <span className="text-stone-300">–</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            <strong>All records</strong>: without it, people only see their own records and the sites they are assigned to (manager / designer / supervisor / team member of the site). Changes apply within a few seconds after saving – nobody needs to log out.
          </p>
        </Card>
      </div>

      <Modal
        open={!!adding}
        onClose={() => setAdding(null)}
        title="New role"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(null)}>
              Cancel
            </Button>
            <Button onClick={addRole}>Add role</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">Role name</label>
            <input className="input" autoFocus value={adding?.label ?? ""} maxLength={60} placeholder="e.g. Site Engineer" onChange={(e) => setAdding((a) => a && { ...a, label: e.target.value })} />
          </div>
          <div>
            <label className="label">Start with the permissions of</label>
            <select className="input" value={adding?.from ?? ""} onChange={(e) => setAdding((a) => a && { ...a, from: e.target.value })}>
              {roles
                .filter((r) => r.value !== "admin")
                .map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
            </select>
          </div>
          <p className="text-xs text-muted">You can change every permission after adding. Remember to click “Save changes”.</p>
        </div>
      </Modal>
    </>
  );
}

function strip(r: RoleRow) {
  return { value: r.value, label: r.label, color: r.color, permissions: [...r.permissions].sort() };
}
