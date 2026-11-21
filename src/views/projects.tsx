"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowLeft, Building2, CalendarDays, LayoutGrid, MapPin, Pencil, Phone, Plus, Table2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { useAuth } from "@/components/auth";
import { DataTable, FilterBar, Pagination, SearchBox } from "@/components/data-table";
import { ActivityFeed, FileLibrary, Person, REF, StageStepper } from "@/components/domain";
import { FormDrawer } from "@/components/form";
import { Badge, Button, Card, Empty, KV, Loading, Modal, PageHeader, Progress, Segmented, StatusBadge, Tabs, cx, useConfirm, useToast } from "@/components/ui";
import { invalidate, useList, useOne } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { PROJECT_STAGES, PROJECT_STATUS, PROPERTY_CONFIGS, PROPERTY_TYPES, WORK_SCOPES, labelOf } from "@/lib/constants";
import { date, isOverdue, mapsLink, money, moneyShort, telLink } from "@/lib/format";
import { FinancePanel } from "./accounts";
import { projectColumns, projectFields } from "./config";
import { DesignsPanel } from "./designs";
import { GRNView, MaterialRequestsView, PurchaseOrdersView, SiteConsumption } from "./procurement";
import { QuotationsPanel } from "./quotations";
import { SiteVisitPanel } from "./sales";
import { ChecklistsView, DailyReportsView, WorkOrdersView } from "./site";
import { TasksView } from "./tasks";

/* ---------------------------------- List --------------------------------- */
export function ProjectsPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [view, setView] = useState<"cards" | "table">("cards");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, any>>({ status: "active" });
  const [creating, setCreating] = useState(false);
  const { rows, meta, loading, mutate } = useList("/projects", { q, page, limit: view === "cards" ? 24 : 20, ...filters, sort: "-updatedAt" });
  return (
    <div>
      <PageHeader
        title="Sites"
        subtitle="Every converted project from design to handover"
        actions={
          <>
            <Segmented options={[{ value: "cards", label: <LayoutGrid className="size-4" /> }, { value: "table", label: <Table2 className="size-4" /> }]} value={view} onChange={setView} />
            {can("projects:write") && <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New site</Button>}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Site name, number, address…" />
        <FilterBar
          filters={[
            { name: "status", label: "Status", options: PROJECT_STATUS },
            { name: "stage", label: "Stage", options: PROJECT_STAGES },
            { name: "supervisor", label: "Supervisor", ref: REF.user },
            { name: "designer", label: "Designer", ref: REF.user },
          ]}
          values={filters}
          onChange={(k, v) => (setFilters((f) => ({ ...f, [k]: v })), setPage(1))}
        />
      </div>
      {view === "cards" ? (
        loading && !rows.length ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty icon={<Building2 className="size-5" />} title="No sites" hint="Convert a lead to create a site, or add one directly." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="card flex flex-col p-4 transition hover:border-brand-300 hover:shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted">{p.projectNo}</p>
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="truncate text-xs text-muted">{p.client?.name} {p.city && `· ${p.city}`}</p>
                  </div>
                  <StatusBadge options={PROJECT_STATUS} value={p.status} />
                </div>
                <div className="mt-3"><StatusBadge options={PROJECT_STAGES} value={p.stage} /></div>
                <div className="mt-4 flex items-center gap-2">
                  <Progress value={p.progress} />
                  <span className="text-xs tabular-nums text-muted">{p.progress ?? 0}%</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
                  <span className="flex items-center gap-1.5"><Person user={p.supervisor ?? p.manager} /></span>
                  <span className="text-right">
                    <span className="block font-semibold text-ink">{moneyShort(p.contractValue)}</span>
                    {p.expectedEndDate && <span className={cx(isOverdue(p.expectedEndDate) && p.status === "active" && "text-red-600")}>Handover {date(p.expectedEndDate)}</span>}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : (
        <div className="card">
          <DataTable columns={projectColumns} rows={rows} loading={loading} onRowClick={(r) => router.push(`/projects/${r.id}`)} />
        </div>
      )}
      {meta && meta.pages > 1 && <div className="card mt-4"><Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} /></div>}
      <FormDrawer open={creating} onClose={() => setCreating(false)} title="New site" fields={projectFields} endpoint="/projects" defaults={{ status: "active" }} onSaved={(r) => (mutate(), router.push(`/projects/${r.id}`))} />
    </div>
  );
}

/* --------------------------------- Detail -------------------------------- */
type Tab = "overview" | "visits" | "designs" | "quotes" | "contractors" | "materials" | "tasks" | "reports" | "checklists" | "finance" | "files" | "activity";

function Overview({ p, summary, onStage }: { p: any; summary: any; onStage: (s: string) => void }) {
  const { can } = useAuth();
  const s = summary;
  const t = s?.tasks ?? {};
  const openTasks = (t.todo ?? 0) + (t.in_progress ?? 0) + (t.review ?? 0) + (t.blocked ?? 0);
  return (
    <div className="space-y-5">
      <Card title="Workflow" action={<span className="text-xs text-muted">{can("projects:write") ? "Click a step to move the site" : ""}</span>}>
        <StageStepper stage={p.stage} onSelect={can("projects:write") ? onStage : undefined} />
        <ol className="mt-4 space-y-1.5 border-t border-line pt-3">
          {[...(p.stageHistory ?? [])].reverse().slice(0, 6).map((h: any, i: number) => (
            <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="w-24 text-muted">{date(h.at)}</span>
              <StatusBadge options={PROJECT_STAGES} value={h.stage} />
              {h.note && <span className="text-stone-600">{h.note}</span>}
            </li>
          ))}
        </ol>
      </Card>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Site details" className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <KV label="Client"><Link href={`/clients/${p.client?.id}`} className="hover:underline">{p.client?.name}</Link><a href={telLink(p.client?.phone)} className="block text-xs text-brand-700">{p.client?.phone}</a></KV>
            <KV label="Property">{[labelOf(PROPERTY_CONFIGS, p.propertyConfig), labelOf(PROPERTY_TYPES, p.propertyType)].filter(Boolean).join(" ")}{p.areaSqft ? ` · ${p.areaSqft} sq.ft` : ""}</KV>
            <KV label="Address">
              {p.siteAddress}
              {(p.siteAddress || p.location) && <a className="ml-1 text-xs text-brand-700" target="_blank" rel="noreferrer" href={mapsLink(p.siteAddress, p.location)}><MapPin className="inline size-3" /> Map</a>}
            </KV>
            <KV label="Start">{date(p.startDate)}</KV>
            <KV label="Target handover"><span className={cx(isOverdue(p.expectedEndDate) && p.status === "active" && "text-red-600")}>{date(p.expectedEndDate)}</span></KV>
            <KV label="Progress"><div className="flex items-center gap-2"><Progress value={p.progress} /><span className="text-xs">{p.progress ?? 0}%</span></div></KV>
            <KV label="Scope" className="col-span-2 md:col-span-3"><div className="flex flex-wrap gap-1">{(p.scope ?? []).map((x: string) => <Badge key={x}>{labelOf(WORK_SCOPES, x)}</Badge>)}</div></KV>
          </dl>
          {p.description && <p className="mt-4 whitespace-pre-line rounded-lg bg-stone-50 p-3 text-sm">{p.description}</p>}
        </Card>
        <Card title="Team">
          <ul className="space-y-3">
            <li><p className="text-[11px] uppercase tracking-wide text-stone-400">Project manager</p><Person user={p.manager} /></li>
            <li><p className="text-[11px] uppercase tracking-wide text-stone-400">Designer</p><Person user={p.designer} /></li>
            <li><p className="text-[11px] uppercase tracking-wide text-stone-400">Site supervisor</p><Person user={p.supervisor} /></li>
            {p.members?.length > 0 && <li><p className="text-[11px] uppercase tracking-wide text-stone-400">Members</p><div className="mt-1 space-y-1">{p.members.map((m: any) => <Person key={m.id} user={m} />)}</div></li>}
          </ul>
        </Card>
      </div>
      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <div className="card p-3"><p className="text-xs text-muted">Open tasks</p><p className="text-xl font-semibold">{openTasks}</p>{s.overdueTasks > 0 && <p className="text-xs text-red-600">{s.overdueTasks} overdue</p>}</div>
          <div className="card p-3"><p className="text-xs text-muted">Designs final</p><p className="text-xl font-semibold">{s.designs.reduce((a: number, d: any) => a + d.final, 0)} / {s.designs.reduce((a: number, d: any) => a + d.count, 0)}</p></div>
          <div className="card p-3"><p className="text-xs text-muted">QC checklist</p><p className="text-xl font-semibold">{s.checklist.done}/{s.checklist.total}</p></div>
          <div className="card p-3"><p className="text-xs text-muted">Pending material req.</p><p className={cx("text-xl font-semibold", s.counts.pendingMaterialRequests && "text-amber-700")}>{s.counts.pendingMaterialRequests}</p></div>
          {s.finance && <div className="card p-3"><p className="text-xs text-muted">Received</p><p className="text-xl font-semibold text-emerald-700">{moneyShort(s.finance.received)}</p><p className="text-xs text-muted">of {moneyShort(s.contractValue)}</p></div>}
          {s.finance && <div className="card p-3"><p className="text-xs text-muted">Spent</p><p className="text-xl font-semibold text-rose-700">{moneyShort(s.finance.spent)}</p><p className="text-xs text-muted">Balance {moneyShort(s.finance.balance)}</p></div>}
        </div>
      )}
    </div>
  );
}

export function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const { data: p, mutate, isLoading } = useOne<any>(`/projects/${id}`);
  const { data: summary, mutate: reloadSummary } = useOne<any>(`/projects/${id}/summary`);
  const [tab, setTab] = useState<Tab>("overview");
  const [edit, setEdit] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t) setTab(t);
  }, []);
  const changeTab = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", `?tab=${t}`);
  };

  if (isLoading) return <Loading />;
  if (!p) return <Empty title="Site not found or you are not assigned to it" />;

  const moveStage = async () => {
    try {
      await api.post(`/projects/${id}/stage`, { stage, note });
      toast.success("Stage updated");
      setStage(null);
      setNote("");
      mutate();
      invalidate("/dashboard");
    } catch (e) {
      toast.error(e);
    }
  };
  const del = async () => {
    if (!(await confirm({ title: "Delete this site?", message: "Designs, tasks, reports and checklists of this site will be deleted.", danger: true, confirmText: "Delete" }))) return;
    try {
      await api.del(`/projects/${id}`);
      router.push("/projects");
    } catch (e) {
      toast.error(e);
    }
  };
  const showFinance = can("payments:read") || can("expenses:read") || can("invoices:read");
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "overview", label: "Overview" },
    { value: "visits", label: "Measurements" },
    ...(can("designs:read") ? [{ value: "designs" as Tab, label: "Designs" }] : []),
    ...(can("quotations:read") ? [{ value: "quotes" as Tab, label: "Quotations", count: summary?.counts?.quotations }] : []),
    ...(can("workorders:read") ? [{ value: "contractors" as Tab, label: "Contractors", count: summary?.counts?.workOrders }] : []),
    ...(can("material_requests:read") || can("purchase_orders:read") ? [{ value: "materials" as Tab, label: "Materials" }] : []),
    { value: "tasks", label: "Tasks" },
    ...(can("daily_reports:read") ? [{ value: "reports" as Tab, label: "Daily reports", count: summary?.counts?.dailyReports }] : []),
    ...(can("checklists:read") ? [{ value: "checklists" as Tab, label: "QC checklists" }] : []),
    ...(showFinance ? [{ value: "finance" as Tab, label: "Accounts" }] : []),
    { value: "files", label: "Files & photos" },
    { value: "activity", label: "Activity" },
  ];

  // a ?tab= the role can't see falls back to the overview
  const current: Tab = tabs.some((t) => t.value === tab) ? tab : "overview";

  return (
    <div className="space-y-5">
      <PageHeader
        back={<Link href="/projects" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft className="size-3.5" /> Sites</Link>}
        title={p.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {p.projectNo} <StatusBadge options={PROJECT_STATUS} value={p.status} /> <StatusBadge options={PROJECT_STAGES} value={p.stage} />
            {p.contractValue > 0 && <span>· {money(p.contractValue)}</span>}
          </span>
        }
        actions={
          <>
            {p.client?.phone && <Button variant="secondary" href={telLink(p.client.phone)} icon={<Phone className="size-4" />}>Call client</Button>}
            {can("projects:write") && <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>Edit</Button>}
            {can("projects:delete") && <Button variant="ghost" className="text-red-600" icon={<Trash2 className="size-4" />} onClick={del}>Delete</Button>}
          </>
        }
      />
      <Tabs value={current} onChange={changeTab} tabs={tabs} />
      <div>
        {current === "overview" && <Overview p={p} summary={summary} onStage={setStage} />}
        {current === "visits" && <SiteVisitPanel project={id} address={p.siteAddress} />}
        {current === "designs" && <DesignsPanel project={id} />}
        {current === "quotes" && <QuotationsPanel project={id} />}
        {current === "contractors" && <WorkOrdersView project={id} />}
        {current === "materials" && <MaterialsTab project={id} />}
        {current === "tasks" && <TasksView project={id} embedded />}
        {current === "reports" && <DailyReportsView project={id} />}
        {current === "checklists" && <ChecklistsView project={id} />}
        {current === "finance" && <FinancePanel project={p} summary={summary} reload={() => (mutate(), reloadSummary())} />}
        {current === "files" && <Card><FileLibrary project={id} /></Card>}
        {current === "activity" && <Card><ActivityFeed project={id} limit={100} /></Card>}
      </div>
      <FormDrawer open={edit} onClose={() => setEdit(false)} title="Edit site" fields={projectFields} endpoint="/projects" record={p} onSaved={() => (mutate(), reloadSummary())} />
      <Modal open={!!stage} onClose={() => setStage(null)} title={`Move to: ${labelOf(PROJECT_STAGES, stage)}`} footer={<><Button variant="secondary" onClick={() => setStage(null)}>Cancel</Button><Button onClick={moveStage}>Move</Button></>}>
        <label className="label">Note (optional)</label>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Client approved final layout" />
        <div className="mt-3">
          <button className="text-xs text-brand-700 hover:underline" onClick={() => setStage("closed")}>
            <CalendarDays className="mr-1 inline size-3" />Close site (handover complete)
          </button>
        </div>
      </Modal>
    </div>
  );
}

function MaterialsTab({ project }: { project: string }) {
  const { can } = useAuth();
  const [t, setT] = useState<"requests" | "orders" | "grn" | "consumption">(can("material_requests:read") ? "requests" : "orders");
  return (
    <div>
      <Segmented
        options={[
          ...(can("material_requests:read") ? [{ value: "requests" as const, label: "Requests" }] : []),
          ...(can("purchase_orders:read") ? [{ value: "orders" as const, label: "Purchase orders" }] : []),
          ...(can("grn:read") ? [{ value: "grn" as const, label: "Received (GRN)" }] : []),
          ...(can("inventory:read") ? [{ value: "consumption" as const, label: "Consumption" }] : []),
        ]}
        value={t}
        onChange={setT}
      />
      <div className="mt-4">
        {t === "requests" && <MaterialRequestsView project={project} />}
        {t === "orders" && <PurchaseOrdersView project={project} />}
        {t === "grn" && <GRNView project={project} />}
        {t === "consumption" && <SiteConsumption project={project} />}
      </div>
    </div>
  );
}
