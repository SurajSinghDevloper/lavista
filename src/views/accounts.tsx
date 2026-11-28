"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowLeft, LayoutGrid, MessageCircle, Plus, Printer, Save, Send, Table2, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useMemo, useState } from "react";
import { useAuth } from "@/components/auth";
import { DataTable, ResourcePage } from "@/components/data-table";
import { LineItemsEditor, ProjectLink, REF, Totals, emptyItem, useCompany, type LineItem } from "@/components/domain";
import { EntitySelect, FormDrawer } from "@/components/form";
import { Button, Card, Empty, KV, LoadError, Loading, MenuItem, PageHeader, Progress, Segmented, StatCard, StatusBadge, Tabs, cx, useConfirm, useToast } from "@/components/ui";
import { invalidate, useList, useOne } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { EXPENSE_CATEGORIES, INVOICE_STATUS, INVOICE_TYPES, MILESTONE_STATUS, PAYMENT_MODES, PROJECT_STAGES, RECEIPT_TYPES } from "@/lib/constants";
import { date, money, moneyShort, toInputDate, waLink } from "@/lib/format";
import { expenseColumns, expenseFields, paymentColumns, paymentFields } from "./config";

/* --------------------------- Site-wise accounts -------------------------- */
export function AccountsPage() {
  const router = useRouter();
  const { data, isLoading, error, mutate } = useOne<any>("/accounts/summary");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [status, setStatus] = useState("active");
  if (!data) return error && !isLoading ? <LoadError error={error} onRetry={() => mutate()} /> : <Loading />;
  const sites = data.sites.filter((s: any) => !status || s.status === status);
  // the cards add up the sites shown below (same filter); office figures are company-wide
  const sum = (k: string) => Math.round(sites.reduce((a: number, s: any) => a + (Number(s[k]) || 0), 0) * 100) / 100;
  const t = {
    contractValue: sum("contractValue"),
    invoiced: sum("invoiced"),
    received: sum("received"),
    spent: sum("spent"),
    materialFromStock: sum("materialFromStock"),
    cost: sum("cost"),
    balance: Math.round((sum("received") - sum("cost")) * 100) / 100,
    outstanding: Math.round(sites.reduce((a: number, s: any) => a + Math.max(0, Number(s.outstanding) || 0), 0) * 100) / 100,
    officeOverheads: data.totals.officeOverheads,
    factoryPurchases: data.totals.factoryPurchases,
  };
  const scopeLabel = status === "active" ? "active sites" : status === "completed" ? "completed sites" : "all sites";
  return (
    <div className="space-y-5">
      <PageHeader
        title="Site accounts"
        subtitle="Advance & milestone payments shown site-wise — Received (A) − Spent (B) = Balance (C)"
        actions={
          <>
            <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Active sites</option>
              <option value="completed">Completed</option>
              <option value="">All sites</option>
            </select>
            <Segmented options={[{ value: "cards", label: <LayoutGrid className="size-4" /> }, { value: "table", label: <Table2 className="size-4" /> }]} value={view} onChange={setView} />
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Contract value" value={moneyShort(t.contractValue)} hint={`Billed ${moneyShort(t.invoiced)}`} />
        <StatCard label="Received (A)" value={moneyShort(t.received)} tone="good" />
        <StatCard label="Site cost (B)" value={moneyShort(t.cost)} tone="bad" hint={`Cash ${moneyShort(t.spent)} + factory material ${moneyShort(t.materialFromStock)}`} />
        <StatCard label="Balance (C = A − B)" value={moneyShort(t.balance)} tone={t.balance >= 0 ? "brand" : "bad"} />
        <StatCard label="Client outstanding" value={moneyShort(t.outstanding)} tone="warn" />
        <StatCard label="Office overheads" value={moneyShort(t.officeOverheads)} hint={`All time · factory stock bought ${moneyShort(t.factoryPurchases)}`} />
      </div>
      <p className="-mt-2 text-xs text-muted">
        Totals are for the {sites.length} {scopeLabel} listed below (office overheads are company-wide). B = expenses paid for the site + material issued to it from factory stock (at average cost). Factory stock purchases are not overheads – their cost reaches each site when the material is issued.
      </p>

      {sites.length === 0 ? (
        <Empty title="No sites" />
      ) : view === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((s: any) => {
            const pct = s.contractValue ? Math.min(100, (s.received / s.contractValue) * 100) : 0;
            return (
              <button key={s.id} onClick={() => router.push(`/projects/${s.id}?tab=finance`)} className="card p-4 text-left transition hover:border-brand-300">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.name}</p>
                    <p className="text-xs text-muted">{s.projectNo} · {s.client}</p>
                  </div>
                  <StatusBadge options={PROJECT_STAGES} value={s.stage} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-emerald-50 py-2"><p className="text-[10px] font-semibold uppercase text-emerald-700">A · Received</p><p className="text-sm font-semibold">{moneyShort(s.received)}</p></div>
                  <div className="rounded-lg bg-rose-50 py-2" title={`Cash ${money(s.spent)} + factory material ${money(s.materialFromStock)}`}><p className="text-[10px] font-semibold uppercase text-rose-700">B · Cost</p><p className="text-sm font-semibold">{moneyShort(s.cost)}</p></div>
                  <div className={cx("rounded-lg py-2", s.balance >= 0 ? "bg-brand-50" : "bg-red-100")}><p className="text-[10px] font-semibold uppercase text-brand-700">C · Balance</p><p className={cx("text-sm font-semibold", s.balance < 0 && "text-red-700")}>{moneyShort(s.balance)}</p></div>
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-muted"><span>Collected {Math.round(pct)}% of {moneyShort(s.contractValue)}</span><span>{s.outstanding < 0 ? `Excess ${moneyShort(-s.outstanding)}` : `Due ${moneyShort(s.outstanding)}`}</span></div>
                  <Progress value={pct} tone="bg-emerald-500" />
                </div>
                {s.nextMilestone && <p className="mt-3 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">Next due: {s.nextMilestone.name} – {money(s.nextMilestone.amount)}</p>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <DataTable
            rows={sites}
            onRowClick={(r) => router.push(`/projects/${r.id}?tab=finance`)}
            columns={[
              { key: "name", label: "Site", render: (r) => <span><span className="font-medium">{r.name}</span><span className="block text-xs text-muted">{r.projectNo} · {r.client}</span></span> },
              { key: "contractValue", label: "Contract", render: (r) => money(r.contractValue), align: "right" },
              { key: "invoiced", label: "Billed", render: (r) => money(r.invoiced), align: "right" },
              { key: "received", label: "Received (A)", render: (r) => <span className="text-emerald-700">{money(r.received)}</span>, align: "right" },
              { key: "spent", label: "Cash spent", render: (r) => money(r.spent), align: "right", hideOnMobile: true },
              { key: "materialFromStock", label: "Factory material", render: (r) => money(r.materialFromStock), align: "right", hideOnMobile: true },
              { key: "cost", label: "Cost (B)", render: (r) => <span className="text-rose-700">{money(r.cost)}</span>, align: "right" },
              { key: "balance", label: "Balance (C)", render: (r) => <strong className={r.balance < 0 ? "text-red-700" : ""}>{money(r.balance)}</strong>, align: "right" },
              { key: "outstanding", label: "Outstanding", render: (r) => money(r.outstanding), align: "right" },
              { key: "lastPaymentAt", label: "Last payment", render: (r) => date(r.lastPaymentAt), hideOnMobile: true },
            ]}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Receipts -------------------------------- */
export function PaymentsView({ project }: { project?: string }) {
  const { company } = useCompany();
  const receiptText = (r: any) =>
    `Dear ${r.client?.name ?? "Sir/Madam"}, we have received ${money(r.amount)} on ${date(r.date)} towards ${r.project?.name ?? "your project"} (receipt ${r.receiptNo}). Thank you – ${company.name || "LA-VISTA"}.`;
  return (
    <ResourcePage
      title={project ? undefined : "Payments received"}
      subtitle="Client advances & milestone payments — milestones update automatically"
      embedded={!!project}
      endpoint="/payments"
      resource="payments"
      entityName="payment"
      columns={project ? paymentColumns.filter((c) => c.key !== "project") : paymentColumns}
      fields={project ? paymentFields.filter((f) => f.name !== "project").map((f) => (f.name === "invoice" ? { ...f, ref: { ...REF.invoice, params: { project } } } : f)) : paymentFields}
      baseParams={project ? { project } : undefined}
      createExtra={project ? { project } : undefined}
      defaults={{ type: "advance", mode: "bank_transfer", date: toInputDate(new Date()) }}
      filters={[{ name: "type", label: "Against", options: RECEIPT_TYPES }, { name: "mode", label: "Mode", options: PAYMENT_MODES }, ...(project ? [] : [{ name: "project", label: "Site", ref: REF.project }])]}
      createLabel="Record payment"
      invalidates={["/projects", "/accounts", "/invoices", "/dashboard"]}
      rowMenu={(r) => (
        <>
          <MenuItem icon={<Printer className="size-4" />} onClick={() => window.open(`/print/receipt/${r.id}`, "_blank")}>Print receipt</MenuItem>
          {r.client?.phone && (
            <MenuItem icon={<MessageCircle className="size-4" />} onClick={() => window.open(waLink(r.client.phone, receiptText(r)), "_blank", "noopener")}>
              Send receipt on WhatsApp
            </MenuItem>
          )}
        </>
      )}
    />
  );
}

/* -------------------------------- Expenses ------------------------------- */
export function ExpensesView({ project }: { project?: string }) {
  const sp = useSearchParams();
  const po = sp.get("po");
  const [poOpen, setPoOpen] = useState(!!po);
  return (
    <>
      <ResourcePage
        title={project ? undefined : "Expenses"}
        subtitle="Vendor & contractor payments, site expenses and office overheads"
        embedded={!!project}
        endpoint="/expenses"
        resource="expenses"
        entityName="expense"
        columns={project ? expenseColumns.filter((c) => c.key !== "project") : expenseColumns}
        fields={project ? expenseFields.filter((f) => f.name !== "project") : expenseFields}
        baseParams={project ? { project } : undefined}
        createExtra={project ? { project } : undefined}
        defaults={{ category: "site_misc", mode: "cash", date: toInputDate(new Date()) }}
        filters={[{ name: "category", label: "Category", options: EXPENSE_CATEGORIES }, ...(project ? [] : [{ name: "project", label: "Site", ref: REF.project }])]}
        createLabel="Add expense"
        invalidates={["/projects", "/accounts", "/purchase-orders", "/work-orders", "/dashboard"]}
      />
      {po && (
        <FormDrawer
          open={poOpen}
          onClose={() => (setPoOpen(false), window.history.replaceState(null, "", window.location.pathname))}
          title="Record vendor payment"
          fields={expenseFields}
          endpoint="/expenses"
          defaults={{ category: "vendor_payment", purchaseOrder: po, mode: "bank_transfer", date: toInputDate(new Date()) }}
          onSaved={() => invalidate("/expenses", "/purchase-orders")}
        />
      )}
    </>
  );
}

/* --------------------------------- Invoices ------------------------------ */
const invColumns = [
  { key: "invoiceNo", label: "Bill", render: (r: any) => <span><span className="font-medium">{r.invoiceNo}</span><span className="block text-xs text-muted">{INVOICE_TYPES.find((t) => t.value === r.type)?.label}</span></span> },
  { key: "date", label: "Date", render: (r: any) => date(r.date) },
  { key: "project", label: "Site", render: (r: any) => <ProjectLink project={r.project} /> },
  { key: "total", label: "Total", render: (r: any) => money(r.total), align: "right" as const },
  { key: "balance", label: "Balance", render: (r: any) => <span className={r.balance > 0 && r.status !== "draft" ? "font-medium text-amber-700" : ""}>{money(r.balance)}</span>, align: "right" as const },
  { key: "status", label: "Status", render: (r: any) => <StatusBadge options={INVOICE_STATUS} value={r.status} /> },
];

export function InvoicesView({ project }: { project?: string }) {
  const router = useRouter();
  return (
    <ResourcePage
      title={project ? undefined : "Bills / invoices"}
      subtitle="Bill generation for sites — proforma, running bills, GST tax invoices and final bill"
      embedded={!!project}
      endpoint="/invoices"
      resource="invoices"
      entityName="invoice"
      columns={project ? invColumns.filter((c) => c.key !== "project") : invColumns}
      baseParams={project ? { project } : undefined}
      filters={[{ name: "status", label: "Status", options: INVOICE_STATUS }, { name: "type", label: "Type", options: INVOICE_TYPES }, ...(project ? [] : [{ name: "project", label: "Site", ref: REF.project }])]}
      rowHref={(r) => `/accounts/invoices/${r.id}`}
      onCreate={() => router.push(`/accounts/invoices/new${project ? `?project=${project}` : ""}`)}
      createLabel="New bill"
    />
  );
}

function InvoiceEditor({ initial }: { initial: any }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const [inv, setInv] = useState<any>(initial);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false); // status change in progress
  const locked = ["paid", "cancelled"].includes(inv.status);
  const readOnly = locked || !can("invoices:write");
  const set = (p: any) => setInv((x: any) => ({ ...x, ...p }));
  const subtotal = inv.items.reduce((s: number, i: LineItem) => s + i.qty * i.rate, 0);
  const disc = Math.min(Number(inv.discountAmount) || 0, subtotal);
  const ratio = subtotal ? (subtotal - disc) / subtotal : 0;
  const tax = inv.items.reduce((s: number, i: LineItem) => s + (i.qty * i.rate * ratio * (i.gstRate ?? 0)) / 100, 0);
  const exact = Math.round((subtotal - disc + tax) * 100) / 100;
  const total = Math.round(exact); // same rule as the server: bills round to the nearest rupee
  const roundOff = total - exact;
  const { rows: pays } = useList(inv.id ? "/payments" : null, { invoice: inv.id, limit: 50 });
  const { company } = useCompany();
  const shareText = `Dear ${inv.client?.name ?? "Sir/Madam"}, please find ${inv.invoiceNo} for ${inv.project?.name ?? "your project"}: ${money(total)}${inv.amountPaid ? `, received ${money(inv.amountPaid)}, balance ${money(total - inv.amountPaid)}` : ""}${inv.dueDate ? `, due by ${date(inv.dueDate)}` : ""}. – ${company.name || "LA-VISTA"}`;

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        type: inv.type,
        quotation: inv.quotation?.id ?? inv.quotation ?? null,
        date: inv.date || null,
        dueDate: inv.dueDate || null,
        items: inv.items.map(({ receivedQty: _r, ...i }: any) => (void _r, { ...i, material: null })),
        discountAmount: inv.discountAmount || 0,
        interState: !!inv.interState,
        notes: inv.notes,
        terms: inv.terms,
      };
      const r: any = inv.id ? await api.patch(`/invoices/${inv.id}`, payload) : await api.post("/invoices", { ...payload, project: inv.project?.id ?? inv.project });
      toast.success("Bill saved");
      invalidate("/invoices", "/accounts");
      if (!inv.id) router.replace(`/accounts/invoices/${r.id}`);
      else setInv((x: any) => ({ ...x, ...r }));
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };
  const setStatus = async (status: string) => {
    if (status === "cancelled" && !(await confirm({ title: "Cancel this bill?", danger: true, confirmText: "Cancel bill" }))) return;
    setBusy(true);
    try {
      const r: any = await api.post(`/invoices/${inv.id}/status`, { status });
      setInv((x: any) => ({ ...x, ...r }));
      invalidate("/invoices", "/accounts");
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        back={<Link href="/accounts/invoices" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft className="size-3.5" /> Bills</Link>}
        title={inv.id ? inv.invoiceNo : "New bill"}
        subtitle={inv.id && <span className="flex items-center gap-2"><StatusBadge options={INVOICE_STATUS} value={inv.status} /> {inv.project && <ProjectLink project={inv.project} />}</span>}
        actions={
          <>
            {inv.id && <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.open(`/print/invoice/${inv.id}`, "_blank")}>Print / PDF</Button>}
            {inv.id && inv.client?.phone && inv.status !== "draft" && (
              <Button variant="secondary" icon={<MessageCircle className="size-4" />} onClick={() => window.open(waLink(inv.client.phone, shareText), "_blank", "noopener")}>
                WhatsApp
              </Button>
            )}
            {inv.id && inv.status === "draft" && can("invoices:write") && <Button variant="secondary" icon={<Send className="size-4" />} loading={busy} onClick={() => setStatus("issued")}>Issue bill</Button>}
            {inv.id && ["draft", "issued"].includes(inv.status) && can("invoices:write") && <Button variant="ghost" className="text-red-600" icon={<XCircle className="size-4" />} disabled={busy} onClick={() => setStatus("cancelled")}>Cancel</Button>}
            {!locked && can("invoices:write") && <Button icon={<Save className="size-4" />} loading={saving} onClick={save}>Save</Button>}
          </>
        }
      />
      <Card title="Bill details">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="label">Site *</label>
            {inv.id ? <p className="py-2"><ProjectLink project={inv.project} /></p> : <EntitySelect value={inv.project ?? null} onChange={(id) => set({ project: id })} config={REF.project} />}
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={inv.type} disabled={readOnly} onChange={(e) => set({ type: e.target.value })}>{INVOICE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={!!inv.interState} disabled={readOnly} onChange={(e) => set({ interState: e.target.checked })} /> Inter-state (IGST)</label>
          </div>
          <div><label className="label">Bill date</label><input type="date" className="input" value={toInputDate(inv.date)} disabled={readOnly} onChange={(e) => set({ date: e.target.value })} /></div>
          <div><label className="label">Due date</label><input type="date" className="input" value={toInputDate(inv.dueDate)} disabled={readOnly} onChange={(e) => set({ dueDate: e.target.value })} /></div>
          <div><label className="label">Discount (₹)</label><input type="number" className="input" value={inv.discountAmount ?? 0} disabled={readOnly} onChange={(e) => set({ discountAmount: Number(e.target.value) })} /></div>
        </div>
      </Card>
      <Card title="Items">
        <LineItemsEditor items={inv.items} onChange={(items) => set({ items })} showSection readOnly={readOnly} />
        <div className="mt-4">
          <Totals
            rows={[
              { label: "Subtotal", value: subtotal },
              { label: "Discount", value: -disc, hidden: !disc },
              { label: inv.interState ? "IGST" : "CGST", value: inv.interState ? tax : tax / 2 },
              { label: "SGST", value: tax / 2, hidden: !!inv.interState },
              { label: "Round off", value: roundOff, hidden: Math.abs(roundOff) < 0.005 },
              { label: "Total", value: total, strong: true },
              { label: "Received", value: inv.amountPaid, hidden: !inv.amountPaid },
              { label: "Balance due", value: total - (inv.amountPaid ?? 0), hidden: !inv.amountPaid, strong: true },
            ]}
          />
        </div>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Notes & terms">
          <textarea className="input mb-2" rows={3} value={inv.notes ?? ""} disabled={readOnly} onChange={(e) => set({ notes: e.target.value })} placeholder="Notes printed on bill" />
          <textarea className="input" rows={3} value={inv.terms ?? ""} disabled={readOnly} onChange={(e) => set({ terms: e.target.value })} placeholder="Terms (default from settings)" />
        </Card>
        {inv.id && (
          <Card title="Payments against this bill" padded={false} action={can("payments:write") && inv.status !== "draft" && inv.status !== "cancelled" && <Button size="xs" variant="secondary" href={`/projects/${inv.project?.id}?tab=finance`}>Record payment</Button>}>
            <DataTable rows={pays} columns={paymentColumns.filter((c) => ["receiptNo", "date", "amount"].includes(c.key))} empty={<Empty title="No payments yet" />} />
          </Card>
        )}
      </div>
    </div>
  );
}

export function NewInvoice() {
  const sp = useSearchParams();
  const project = sp.get("project");
  const quotation = sp.get("quotation");
  const { data: q, isLoading } = useOne<any>(quotation ? `/quotations/${quotation}` : null);
  if (quotation && isLoading) return <Loading />;
  const items: LineItem[] = q
    ? q.items.map((i: any) => ({ section: i.section, description: i.description, specification: i.specification, hsn: i.hsn, unit: i.unit, qty: i.qty, rate: i.rate, gstRate: q.taxRate ?? 18 }))
    : [emptyItem(18)];
  return <InvoiceEditor initial={{ project: q?.project ?? project, quotation, type: "tax_invoice", items, date: toInputDate(new Date()), discountAmount: q?.discountAmount ?? 0, status: "draft" }} />;
}

export function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error, mutate } = useOne<any>(`/invoices/${id}`);
  if (isLoading) return <Loading />;
  if (!data) return error ? <LoadError error={error} onRetry={() => mutate()} /> : <Empty title="Bill not found" />;
  return <InvoiceEditor key={data.updatedAt} initial={{ ...data, date: toInputDate(data.date), dueDate: toInputDate(data.dueDate) }} />;
}

/* ------------------------- Project finance (tab) ------------------------- */
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v) || 0;

/**
 * Editing rows: % milestones follow the contract value (amount = value × %), "fixed" milestones keep a set
 * rupee amount (stored with 0 %, the way the server already treats them). Typing an amount on a % milestone
 * works out its % instead.
 */
function scheduleRows(schedule: any[], cv: number) {
  return schedule.map((m) => ({
    ...m,
    fixed: !m.percent && num(m.amount) > 0,
    // the server keeps each milestone's amount in step with the contract value (rounding on the last one)
    amount: num(m.amount) || (m.percent && cv ? Math.round((cv * m.percent) / 100) : 0),
  }));
}

function ScheduleEditor({ project, schedule, contractValue, onSaved }: { project: string; schedule: any[]; contractValue: number; onSaved: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const cv = num(contractValue);
  const showPaid = can("payments:read") || can("accounts:read");
  const viewRows = useMemo(() => scheduleRows(schedule, cv), [schedule, cv]);
  // edit rows are filled when "Edit" is clicked – a background refresh (e.g. returning to the tab) never wipes them
  const [rows, setRows] = useState<any[]>([]);
  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  // right after saving, keep showing what was saved until the refreshed schedule arrives
  const [savedFrom, setSavedFrom] = useState<any[] | null>(null);
  const shown = edit || (savedFrom !== null && savedFrom === schedule) ? rows : viewRows;
  const startEdit = () => (setRows(scheduleRows(schedule, cv)), setSavedFrom(null), setEdit(true));
  const setRow = (i: number, fn: (m: any) => any) => setRows((l) => l.map((x, k) => (k === i ? { ...x, ...fn(x) } : x)));
  const field = (v: string) => (v === "" ? "" : Number(v)); // keep an emptied box empty while typing

  const pctOf = (m: any) => (m.fixed ? (cv ? (num(m.amount) / cv) * 100 : 0) : num(m.percent));
  const onPercent = (i: number, v: string) => setRow(i, () => ({ percent: field(v), amount: cv ? Math.round((cv * num(v)) / 100) : 0 }));
  const onAmount = (i: number, v: string) => setRow(i, (m) => (m.fixed || !cv ? { amount: field(v), percent: 0, fixed: true } : { amount: field(v), percent: (num(v) / cv) * 100 }));
  const onFixed = (i: number, fixed: boolean) => setRow(i, (m) => (fixed ? { fixed, percent: 0 } : { fixed, percent: cv ? (num(m.amount) / cv) * 100 : 0 }));

  const totalPct = rows.reduce((s, m) => s + pctOf(m), 0);
  const totalAmt = rows.reduce((s, m) => s + num(m.amount), 0);
  const hasFixed = rows.some((m) => m.fixed);
  // with no contract value yet, fixed amounts can't be turned into %, so only an all-% schedule can be checked
  const mismatch = rows.length > 0 && (cv ? Math.abs(totalPct - 100) > 0.05 : !hasFixed && Math.abs(totalPct - 100) > 0.05);
  const mismatchText = cv
    ? `The milestones add up to ${r2(totalPct)}% (${money(totalAmt)}) of the contract value ${money(cv)} – they should add up to 100%.`
    : `The milestones add up to ${r2(totalPct)}% – they should add up to 100%.`;

  const save = async () => {
    if (rows.some((m) => !String(m.name ?? "").trim())) return toast.error("Every milestone needs a name");
    if (rows.some((m) => !m.fixed && num(m.percent) > 100)) return toast.error("A milestone can't be more than 100% of the contract value");
    if (mismatch && !(await confirm({ title: "Schedule doesn't add up to 100%", message: `${mismatchText} Save it anyway?`, confirmText: "Save anyway" }))) return;
    setSaving(true);
    try {
      await api.patch(`/projects/${project}`, {
        paymentSchedule: rows.map(({ fixed, ...m }) => ({
          ...m,
          percent: fixed ? 0 : num(m.percent),
          amount: fixed ? num(m.amount) : cv ? Math.round((cv * num(m.percent)) / 100) : num(m.amount),
          dueDate: m.dueDate || null,
          notes: m.notes ?? "",
        })),
      });
      toast.success("Payment schedule saved");
      setSavedFrom(schedule);
      setEdit(false);
      onSaved();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card
      title="Client payment schedule"
      action={can("projects:write") && (edit ? <span className="flex gap-1"><Button size="xs" variant="secondary" onClick={() => setEdit(false)}>Cancel</Button><Button size="xs" loading={saving} onClick={save}>Save</Button></span> : <Button size="xs" variant="secondary" onClick={startEdit}>Edit</Button>)}
      padded={false}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-[11px] uppercase text-stone-500"><tr><th className="px-4 py-2">Milestone</th><th className="px-2 text-right">%</th><th className="px-2 text-right">Amount</th><th className="px-2">Due</th><th className="px-4 text-right">Status</th>{edit && <th />}</tr></thead>
          <tbody>
            {shown.map((m, i) => (
              <tr key={m.id ?? i} className="border-b border-line align-top last:border-0">
                <td className="px-4 py-2">
                  {edit ? (
                    <>
                      <input className="input px-2 py-1" value={m.name} placeholder="Milestone" onChange={(e) => setRow(i, () => ({ name: e.target.value }))} />
                      <input className="input mt-1 px-2 py-1 text-xs" value={m.notes ?? ""} placeholder="Note (optional)" onChange={(e) => setRow(i, () => ({ notes: e.target.value }))} />
                    </>
                  ) : (
                    <>
                      {m.name}
                      {m.notes && <span className="block text-xs text-muted">{m.notes}</span>}
                    </>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  {edit ? (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      className="input w-20 px-2 py-1 text-right"
                      value={m.fixed ? r2(pctOf(m)) : m.percent === "" ? "" : r2(num(m.percent))}
                      disabled={m.fixed}
                      title={m.fixed ? "Fixed amount – % shown for reference only" : undefined}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      onChange={(e) => onPercent(i, e.target.value)}
                    />
                  ) : m.fixed ? (
                    <span className="text-muted">{cv ? `≈${r2(pctOf(m))}%` : "—"}</span>
                  ) : (
                    `${r2(num(m.percent))}%`
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {edit ? (
                    <div className="flex flex-col items-end gap-1">
                      <input type="number" min={0} step="any" className="input w-28 px-2 py-1 text-right" value={m.amount ?? ""} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => onAmount(i, e.target.value)} />
                      <label className="flex items-center gap-1 text-[11px] text-muted" title="Keep this exact amount even if the contract value changes later">
                        <input type="checkbox" className="size-3 accent-brand-600" checked={!!m.fixed} onChange={(e) => onFixed(i, e.target.checked)} /> Fixed amount
                      </label>
                    </div>
                  ) : (
                    <>
                      {money(m.amount)}
                      {m.fixed && <span className="block text-[10px] text-muted">fixed</span>}
                      {showPaid && num(m.paidAmount) > 0 && (
                        <span className="block text-[11px] text-emerald-700">
                          {num(m.paidAmount) + 1 >= num(m.amount) ? "Fully received" : `${money(m.paidAmount)} of ${money(m.amount)} received`}
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className="px-2 py-2">{edit ? <input type="date" className="input px-2 py-1" value={toInputDate(m.dueDate)} onChange={(e) => setRow(i, () => ({ dueDate: e.target.value }))} /> : date(m.dueDate)}</td>
                <td className="px-4 py-2 text-right"><StatusBadge options={MILESTONE_STATUS} value={m.status} /></td>
                {edit && <td className="py-2 pr-2"><button className="text-stone-400 hover:text-red-600" title="Remove milestone" onClick={() => setRows((l) => l.filter((_, k) => k !== i))}><Trash2 className="size-4" /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <div className="space-y-1 border-t border-line px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="xs" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setRows((l) => [...l, { name: "", percent: 0, amount: 0, status: "upcoming", fixed: false }])}>Add milestone</Button>
            <span className={cx("text-xs tabular-nums", mismatch ? "font-medium text-red-600" : "text-muted")}>
              Total {r2(totalPct)}%{cv ? ` · ${money(totalAmt)} of ${money(cv)}` : ""}
            </span>
          </div>
          {mismatch && <p className="text-xs text-red-600">{mismatchText}</p>}
          {!cv && <p className="text-xs text-muted">The contract value isn&apos;t set yet – % milestones get their amounts once a quotation is approved or the contract value is entered.</p>}
        </div>
      )}
    </Card>
  );
}

export function FinancePanel({ project, summary, reload }: { project: any; summary: any; reload: () => void }) {
  const { can } = useAuth();
  const [tab, setTab] = useState<"payments" | "bills" | "expenses">(can("payments:read") ? "payments" : "expenses");
  // null when this role may not see money received / spent – then those cards are left out, not shown as ₹0
  const f = summary?.finance ?? null;
  return (
    <div className="space-y-5">
      {summary && (
        <div className={cx("grid grid-cols-2 gap-3", f ? "lg:grid-cols-5" : "lg:grid-cols-3")}>
          <StatCard label="Contract value" value={money(summary.contractValue)} />
          {f && (
            <>
              <StatCard label="Received (A)" value={money(f.received)} tone="good" />
              <StatCard label="Site cost (B)" value={money(f.cost)} tone="bad" hint={`Cash ${money(f.spent)} + factory material ${money(f.materialFromStock)}`} />
              <StatCard label="Balance (C)" value={money(f.balance)} tone={f.balance >= 0 ? "brand" : "bad"} />
              {summary.outstanding != null && <StatCard label="Client outstanding" value={money(summary.outstanding)} tone="warn" hint={`Billed ${money(f.invoiced)}`} />}
            </>
          )}
        </div>
      )}
      {summary && !f && <p className="-mt-2 text-xs text-muted">Received, spent and balance figures are shown to accounts and managers only.</p>}
      <div className="grid gap-5 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <ScheduleEditor key={project.id} project={project.id} schedule={project.paymentSchedule ?? []} contractValue={project.contractValue ?? 0} onSaved={reload} />
          <Card title="Committed costs" className="mt-5">
            <dl className="grid grid-cols-2 gap-3">
              {f && <KV label="Purchase orders">{money(f.poValue)}</KV>}
              {f && <KV label="Contractor work orders">{money(f.woValue)}</KV>}
              <KV label="Internal budget">{summary ? money(summary.budget) : ""}</KV>
              {f && <KV label="Budget used">{summary?.budget ? `${Math.round((f.cost / summary.budget) * 100)}%` : "—"}</KV>}
            </dl>
          </Card>
        </div>
        <div className="xl:col-span-3">
          <Tabs
            className="mb-3"
            value={tab}
            onChange={setTab}
            tabs={[...(can("payments:read") ? [{ value: "payments" as const, label: "Payments received" }] : []), ...(can("invoices:read") ? [{ value: "bills" as const, label: "Bills" }] : []), ...(can("expenses:read") ? [{ value: "expenses" as const, label: "Expenses" }] : [])]}
          />
          {tab === "payments" && <PaymentsView project={project.id} />}
          {tab === "bills" && <InvoicesView project={project.id} />}
          {tab === "expenses" && <ExpensesView project={project.id} />}
        </div>
      </div>
    </div>
  );
}
