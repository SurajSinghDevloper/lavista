"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowLeft, CheckCircle2, Copy, FilePlus2, MessageCircle, MessageSquareWarning, Plus, Printer, Save, Send, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useMemo, useState } from "react";
import { useAuth } from "@/components/auth";
import { ResourcePage } from "@/components/data-table";
import { LineItemsEditor, ProjectLink, REF, Totals, emptyItem, type LineItem } from "@/components/domain";
import { EntitySelect } from "@/components/form";
import { Badge, Button, Card, Empty, LoadError, Loading, Modal, PageHeader, StatusBadge, cx, useConfirm, useToast } from "@/components/ui";
import { invalidate, useList, useOne } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { QUOTE_STATUS, QUOTE_TYPES, labelOf } from "@/lib/constants";
import { date, money, toInputDate, waLink } from "@/lib/format";

export const quoteColumns = [
  { key: "quoteNo", label: "Quotation", render: (r: any) => <span><span className="font-medium">{r.title}</span><span className="block text-xs text-muted">{r.quoteNo} · v{r.version} · {labelOf(QUOTE_TYPES, r.type)}</span></span> },
  { key: "for", label: "Site / customer", csv: (r: any) => r.project?.name ?? r.customerName, render: (r: any) => (r.project ? <ProjectLink project={r.project} /> : <span>{r.customerName}<span className="block text-xs text-muted">Lead</span></span>) },
  { key: "date", label: "Date", render: (r: any) => date(r.date), hideOnMobile: true },
  { key: "status", label: "Status", render: (r: any) => <span className="flex items-center gap-1"><StatusBadge options={QUOTE_STATUS} value={r.status} />{r.isFinal && <Badge color="green">Final</Badge>}</span> },
  { key: "total", label: "Total", render: (r: any) => <span className="font-semibold">{money(r.total)}</span>, align: "right" as const },
];

export function QuotationsPage() {
  const router = useRouter();
  return (
    <ResourcePage
      title="Quotations"
      subtitle="Preliminary estimates, working quotations (v1 → v2 → v3 → final) and additional work"
      endpoint="/quotations"
      resource="quotations"
      entityName="quotation"
      columns={quoteColumns}
      filters={[
        { name: "status", label: "Status", options: QUOTE_STATUS },
        { name: "type", label: "Type", options: QUOTE_TYPES },
        { name: "project", label: "Site", ref: REF.project },
      ]}
      rowHref={(r) => `/quotations/${r.id}`}
      onCreate={() => router.push("/quotations/new")}
      createLabel="New quotation"
      searchPlaceholder="Quote no., title, customer…"
    />
  );
}

export function QuotationsPanel({ project }: { project: string }) {
  const router = useRouter();
  return (
    <ResourcePage
      embedded
      endpoint="/quotations"
      resource="quotations"
      entityName="quotation"
      columns={quoteColumns.filter((c) => c.key !== "for")}
      baseParams={{ project }}
      filters={[{ name: "status", label: "Status", options: QUOTE_STATUS }]}
      rowHref={(r) => `/quotations/${r.id}`}
      onCreate={() => router.push(`/quotations/new?project=${project}`)}
      createLabel="New quotation"
    />
  );
}

/* --------------------------------- Editor -------------------------------- */
type Q = {
  id?: string;
  title: string;
  type: string;
  project?: any;
  lead?: any;
  client?: any;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  date?: string;
  validUntil?: string;
  items: LineItem[];
  discountType: "percent" | "amount";
  discountValue: number;
  taxRate: number;
  terms?: string;
  notes?: string;
  changeSummary?: string;
  status?: string;
  version?: number;
  quoteNo?: string;
  root?: string;
  isFinal?: boolean;
  clientFeedback?: string;
  total?: number;
  approvedBy?: any;
};

function totals(q: Q) {
  const subtotal = q.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);
  const disc = q.discountType === "percent" ? (subtotal * Math.min(Number(q.discountValue) || 0, 100)) / 100 : Math.min(Number(q.discountValue) || 0, subtotal);
  const taxable = subtotal - disc;
  const tax = (taxable * (Number(q.taxRate) || 0)) / 100;
  return { subtotal, disc, taxable, tax, total: taxable + tax };
}

function VersionHistory({ root, current }: { root: string; current: string }) {
  const { rows } = useList("/quotations", { root, limit: 50, sort: "-version" });
  if (rows.length <= 1) return null;
  return (
    <Card title="Versions" padded={false}>
      <ul className="divide-y divide-line">
        {rows.map((v) => (
          <li key={v.id}>
            <Link href={`/quotations/${v.id}`} className={cx("flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-stone-50", v.id === current && "bg-brand-50")}>
              <span>
                <span className="font-semibold">v{v.version}</span> <span className="text-xs text-muted">{date(v.date)}</span>
                {v.changeSummary && <span className="block text-xs text-muted">{v.changeSummary}</span>}
              </span>
              <span className="text-right">
                <StatusBadge options={QUOTE_STATUS} value={v.status} />
                <span className="block text-xs tabular-nums">{money(v.total)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Editor({ initial }: { initial: Q }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const [q, setQ] = useState<Q>(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<null | "changes_requested" | "rejected">(null);
  const [fbText, setFbText] = useState("");
  const [revise, setRevise] = useState(false);
  const [reviseText, setReviseText] = useState("");
  const locked = ["approved", "superseded", "rejected"].includes(q.status ?? "");
  const t = useMemo(() => totals(q), [q]);
  const set = (patch: Partial<Q>) => (setQ((x) => ({ ...x, ...patch })), setDirty(true));

  const payload = () => ({
    title: q.title,
    type: q.type,
    project: q.project?.id ?? q.project ?? null,
    lead: q.lead?.id ?? q.lead ?? null,
    customerName: q.customerName,
    customerPhone: q.customerPhone,
    customerAddress: q.customerAddress,
    date: q.date || null,
    validUntil: q.validUntil || null,
    items: q.items.map(({ receivedQty: _r, ...i }) => (void _r, { ...i, material: i.material?.id ?? i.material ?? null })),
    discountType: q.discountType,
    discountValue: q.discountValue,
    taxRate: q.taxRate,
    terms: q.terms,
    notes: q.notes,
    changeSummary: q.changeSummary,
  });

  const save = async () => {
    if (!q.items.length) return toast.error("Add at least one item");
    setSaving(true);
    try {
      const r: any = q.id ? await api.patch(`/quotations/${q.id}`, payload()) : await api.post("/quotations", payload());
      toast.success("Quotation saved");
      setDirty(false);
      invalidate("/quotations");
      if (!q.id) router.replace(`/quotations/${r.id}`);
      else setQ((x) => ({ ...x, ...r }));
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (status: string, clientFeedback?: string) => {
    if (dirty) await save();
    try {
      const r: any = await api.post(`/quotations/${q.id}/status`, { status, clientFeedback });
      setQ((x) => ({ ...x, ...r }));
      invalidate("/quotations", "/projects", "/leads");
      toast.success(`Marked ${labelOf(QUOTE_STATUS, status).toLowerCase()}`);
    } catch (e) {
      toast.error(e);
    }
  };

  const doRevise = async () => {
    try {
      const r: any = await api.post(`/quotations/${q.id}/revise`, { changeSummary: reviseText });
      invalidate("/quotations");
      toast.success(`Version ${r.version} created`);
      router.push(`/quotations/${r.id}`);
    } catch (e) {
      toast.error(e);
    }
  };

  // group display by section
  const sections = [...new Set(q.items.map((i) => i.section || "General"))];

  return (
    <div className="space-y-5">
      <PageHeader
        back={<Link href="/quotations" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft className="size-3.5" /> Quotations</Link>}
        title={q.id ? q.title : "New quotation"}
        subtitle={
          q.id && (
            <span className="flex flex-wrap items-center gap-2">
              {q.quoteNo} · <span className="font-semibold text-ink">v{q.version}</span>
              <StatusBadge options={QUOTE_STATUS} value={q.status} />
              {q.isFinal && <Badge color="green">Final</Badge>}
            </span>
          )
        }
        actions={
          <>
            {q.id && <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.open(`/print/quotation/${q.id}`, "_blank")}>Print / PDF</Button>}
            {q.id && (q.customerPhone || q.client?.phone || q.lead?.phone) && (
              <Button
                variant="secondary"
                icon={<MessageCircle className="size-4" />}
                onClick={() =>
                  window.open(
                    waLink(
                      q.customerPhone || q.client?.phone || q.lead?.phone,
                      `Dear ${q.customerName ?? "Sir/Madam"}, sharing our quotation ${q.quoteNo} (version ${q.version}) for "${q.title}": total ${money(t.total)} incl. GST${q.validUntil ? `, valid till ${date(q.validUntil)}` : ""}. The detailed PDF follows. – LA-VISTA Interiors`
                    ),
                    "_blank",
                    "noopener"
                  )
                }
              >
                WhatsApp
              </Button>
            )}
            {q.id && can("quotations:write") && q.status !== "superseded" && (
              <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => setRevise(true)}>
                Revise → v{(q.version ?? 1) + 1}
              </Button>
            )}
            {!locked && can("quotations:write") && (
              <Button icon={<Save className="size-4" />} loading={saving} onClick={save} disabled={q.id ? !dirty : false}>
                {q.id ? "Save" : "Create"}
              </Button>
            )}
          </>
        }
      />

      {q.id && !locked && can("quotations:write") && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white p-3">
          <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Client response</span>
          {q.status === "draft" && <Button size="sm" variant="secondary" icon={<Send className="size-4" />} onClick={() => setStatus("sent")}>Mark sent to client</Button>}
          <Button size="sm" variant="secondary" icon={<MessageSquareWarning className="size-4" />} onClick={() => (setFbText(q.clientFeedback ?? ""), setFeedback("changes_requested"))}>Changes requested</Button>
          {can("quotations:approve") && <Button size="sm" variant="success" icon={<CheckCircle2 className="size-4" />} onClick={async () => (await confirm({ title: `Approve v${q.version} as final?`, message: "Other versions will be superseded and the site contract value will update." })) && setStatus("approved")}>Approve as final</Button>}
          <Button size="sm" variant="ghost" className="text-red-600" icon={<XCircle className="size-4" />} onClick={() => (setFbText(""), setFeedback("rejected"))}>Rejected</Button>
        </div>
      )}
      {q.clientFeedback && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">Client feedback: {q.clientFeedback}</div>}
      {locked && (
        <div className="rounded-lg border border-line bg-stone-50 px-4 py-2.5 text-sm text-stone-600">
          This version is {labelOf(QUOTE_STATUS, q.status).toLowerCase()} and locked. Use <strong>Revise</strong> to create a new version.
          {q.status === "approved" && q.project && can("invoices:write") && (
            <Button size="xs" variant="brand" className="ml-3" icon={<FilePlus2 className="size-3.5" />} href={`/accounts/invoices/new?project=${q.project.id ?? q.project}&quotation=${q.id}`}>
              Create bill from this
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-4">
        <div className="space-y-5 xl:col-span-3">
          <Card title="Details">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="label">Title *</label>
                <input className="input" value={q.title} disabled={locked} onChange={(e) => set({ title: e.target.value })} />
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input" value={q.type} disabled={locked} onChange={(e) => set({ type: e.target.value })}>
                  {QUOTE_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {!q.id ? (
                <>
                  <div>
                    <label className="label">Site</label>
                    <EntitySelect value={q.project ?? null} config={REF.project} onChange={(id) => set({ project: id })} placeholder="Select site (if converted)" />
                  </div>
                  <div>
                    <label className="label">or Lead</label>
                    <EntitySelect value={q.lead ?? null} config={REF.lead} onChange={(id) => set({ lead: id })} placeholder="Select lead" />
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <label className="label">For</label>
                  <p className="py-2 text-sm">{q.project ? <ProjectLink project={q.project} /> : q.lead ? <Link className="hover:underline" href={`/leads/${q.lead.id}`}>{q.lead.name} (lead)</Link> : q.customerName}</p>
                </div>
              )}
              <div>
                <label className="label">Customer name (on print)</label>
                <input className="input" value={q.customerName ?? ""} disabled={locked} onChange={(e) => set({ customerName: e.target.value })} placeholder="Auto from site / lead" />
              </div>
              <div>
                <label className="label">Date</label>
                <input type="date" className="input" value={toInputDate(q.date)} disabled={locked} onChange={(e) => set({ date: e.target.value })} />
              </div>
              <div>
                <label className="label">Valid until</label>
                <input type="date" className="input" value={toInputDate(q.validUntil)} disabled={locked} onChange={(e) => set({ validUntil: e.target.value })} />
              </div>
              {(q.version ?? 1) > 1 && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="label">What changed in this version</label>
                  <input className="input" value={q.changeSummary ?? ""} disabled={locked} onChange={(e) => set({ changeSummary: e.target.value })} />
                </div>
              )}
            </div>
          </Card>

          <Card title={`Items (${q.items.length}) · ${sections.length} area${sections.length === 1 ? "" : "s"}`}>
            <LineItemsEditor items={q.items} onChange={(items) => set({ items })} showSection showCategory showGst={false} readOnly={locked} />
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Terms & conditions">
              <textarea className="input" rows={7} value={q.terms ?? ""} disabled={locked} onChange={(e) => set({ terms: e.target.value })} placeholder="Default terms from settings are added automatically" />
            </Card>
            <Card title="Internal notes">
              <textarea className="input" rows={7} value={q.notes ?? ""} disabled={locked} onChange={(e) => set({ notes: e.target.value })} />
            </Card>
          </div>
        </div>

        <div className="space-y-5">
          <Card title="Summary">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Discount</label>
                  <select className="input" value={q.discountType} disabled={locked} onChange={(e) => set({ discountType: e.target.value as any })}>
                    <option value="amount">₹ Amount</option>
                    <option value="percent">% Percent</option>
                  </select>
                </div>
                <div>
                  <label className="label">&nbsp;</label>
                  <input type="number" className="input" value={q.discountValue} disabled={locked} onChange={(e) => set({ discountValue: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className="label">GST %</label>
                <select className="input" value={q.taxRate} disabled={locked} onChange={(e) => set({ taxRate: Number(e.target.value) })}>
                  {[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}
                </select>
              </div>
              <Totals
                rows={[
                  { label: "Subtotal", value: t.subtotal },
                  { label: "Discount", value: -t.disc, hidden: !t.disc },
                  { label: "Taxable", value: t.taxable, hidden: !t.disc },
                  { label: `GST ${q.taxRate}%`, value: t.tax },
                  { label: "Total", value: t.total, strong: true },
                ]}
              />
              <div className="border-t border-line pt-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Area-wise</p>
                {sections.map((s) => (
                  <div key={s} className="flex justify-between text-xs">
                    <span className="text-stone-600">{s}</span>
                    <span className="tabular-nums">{money(q.items.filter((i) => (i.section || "General") === s).reduce((a, i) => a + i.qty * i.rate, 0))}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          {q.root && q.id && <VersionHistory root={q.root} current={q.id} />}
        </div>
      </div>

      <Modal open={!!feedback} onClose={() => setFeedback(null)} title={feedback === "rejected" ? "Quotation rejected" : "Client requested changes"} footer={<><Button variant="secondary" onClick={() => setFeedback(null)}>Cancel</Button><Button onClick={() => (setStatus(feedback!, fbText), setFeedback(null))}>Save</Button></>}>
        <label className="label">Client feedback</label>
        <textarea className="input" rows={4} value={fbText} onChange={(e) => setFbText(e.target.value)} />
        {feedback === "changes_requested" && <p className="mt-2 text-xs text-muted">Next: click “Revise” to create v{(q.version ?? 1) + 1} with the changes.</p>}
      </Modal>
      <Modal open={revise} onClose={() => setRevise(false)} title={`Create version ${(q.version ?? 1) + 1}`} footer={<><Button variant="secondary" onClick={() => setRevise(false)}>Cancel</Button><Button icon={<Plus className="size-4" />} onClick={doRevise}>Create version</Button></>}>
        <p className="mb-3 text-sm text-muted">A copy of this quotation is created as a new draft version. Open drafts of older versions are marked superseded.</p>
        <label className="label">What will change?</label>
        <input className="input" value={reviseText} onChange={(e) => setReviseText(e.target.value)} placeholder="e.g. Kitchen changed to acrylic finish" />
      </Modal>
    </div>
  );
}

export function NewQuotation() {
  const sp = useSearchParams();
  const project = sp.get("project");
  const lead = sp.get("lead");
  return (
    <Editor
      initial={{
        title: "Interior Works Quotation",
        type: project ? "working" : "preliminary",
        project: project ?? undefined,
        lead: lead ?? undefined,
        items: [{ ...emptyItem(0), section: "Kitchen", category: "carpentry" }],
        discountType: "amount",
        discountValue: 0,
        taxRate: 18,
        date: toInputDate(new Date()),
      }}
    />
  );
}

export function QuotationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error, mutate } = useOne<any>(`/quotations/${id}`);
  if (isLoading) return <Loading />;
  if (!data) return error ? <LoadError error={error} onRetry={() => mutate()} /> : <Empty title="Quotation not found" />;
  return <Editor key={data.id + data.updatedAt} initial={{ ...data, date: toInputDate(data.date), validUntil: toInputDate(data.validUntil) }} />;
}
