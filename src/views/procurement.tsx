"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowLeft, CheckCircle2, PackageMinus, PackagePlus, Plus, Printer, Save, ShoppingCart, SlidersHorizontal, Trash2, Truck, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useEffect, useState } from "react";
import { useAuth } from "@/components/auth";
import { DataTable, Pagination, ResourcePage } from "@/components/data-table";
import { Attachments, FileGrid, LineItemsEditor, ProjectLink, REF, Totals, emptyItem, type LineItem } from "@/components/domain";
import { EntitySelect } from "@/components/form";
import { Badge, Button, Card, Drawer, Empty, KV, Loading, Modal, PageHeader, Segmented, StatusBadge, Tabs, cx, useConfirm, useToast } from "@/components/ui";
import { invalidate, useList, useOne } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { DELIVERY_LOCATIONS, MATERIAL_CATEGORIES, MR_STATUS, PAYMENT_STATUS, PO_STATUS, STOCK_TXN_TYPES, TRADES, UNITS, labelOf } from "@/lib/constants";
import { date, dateTime, money, number, toInputDate } from "@/lib/format";
import { expenseColumns, materialFields, vendorColumns, vendorFields } from "./config";

/* ---------------------------- Material requests -------------------------- */
type MRItem = { _id?: string; material?: any; description: string; category?: string; qty: number; unit: string; notes?: string; issuedQty?: number; orderedQty?: number };

function MRDrawer({ open, onClose, project, onSaved }: { open: boolean; onClose: () => void; project?: string; onSaved: () => void }) {
  const toast = useToast();
  const [proj, setProj] = useState<string | null>(project ?? null);
  const [trade, setTrade] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [priority, setPriority] = useState("normal");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<MRItem[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setProj(project ?? null);
      setItems([{ description: "", qty: 1, unit: "nos" }]);
      setTrade("");
      setNotes("");
      setRequiredBy(toInputDate(new Date(Date.now() + 2 * 86400000)));
    }
  }, [open, project]);
  const set = (i: number, p: Partial<MRItem>) => setItems((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const save = async () => {
    setSaving(true);
    try {
      await api.post("/material-requests", { project: proj, trade: trade || undefined, requiredBy: requiredBy || null, priority, notes, items: items.filter((i) => i.description.trim()) });
      toast.success("Material request sent");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} width="max-w-3xl" title="Material request (from site)" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Send request</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {!project && <div className="sm:col-span-2"><label className="label">Site *</label><EntitySelect value={proj} onChange={setProj} config={REF.activeProject} /></div>}
          <div>
            <label className="label">For work</label>
            <select className="input" value={trade} onChange={(e) => setTrade(e.target.value)}>
              <option value="">—</option>
              {TRADES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div><label className="label">Required by</label><input type="date" className="input" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} /></div>
          <div>
            <label className="label">Priority</label>
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="normal">Normal</option><option value="urgent">Urgent</option></select>
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Items</h4>
          {items.map((it, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line p-2 sm:grid-cols-12">
              <EntitySelect className="sm:col-span-4" value={it.material ?? null} config={REF.material} placeholder="From catalog (optional)" onChange={(id, row) => set(i, id && row ? { material: id, description: it.description || row.name, unit: row.unit, category: row.category } : { material: null })} />
              <input className="input sm:col-span-4" placeholder="Description" value={it.description} onChange={(e) => set(i, { description: e.target.value })} />
              <input type="number" min={0} step="any" className="input sm:col-span-2" value={it.qty} onChange={(e) => set(i, { qty: Number(e.target.value) })} />
              <select className="input sm:col-span-1 px-1" value={it.unit} onChange={(e) => set(i, { unit: e.target.value })}>{UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select>
              <button className="text-stone-400 hover:text-red-600 sm:col-span-1" onClick={() => setItems((l) => l.filter((_, k) => k !== i))}><Trash2 className="mx-auto size-4" /></button>
            </div>
          ))}
          <Button size="xs" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setItems((l) => [...l, { description: "", qty: 1, unit: "nos" }])}>Add item</Button>
        </div>
        <div><label className="label">Notes</label><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
    </Drawer>
  );
}

function IssueModal({ open, onClose, project, mr, mode = "issue", onDone }: { open: boolean; onClose: () => void; project?: string; mr?: any; mode?: "issue" | "return"; onDone?: () => void }) {
  const toast = useToast();
  const [proj, setProj] = useState<string | null>(null);
  const [issuedTo, setIssuedTo] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<{ material: any; qty: number; mrItem?: string; name?: string }[]>([]);
  useEffect(() => {
    if (!open) return;
    setProj(project ?? mr?.project?.id ?? null);
    setRows(mr ? mr.items.filter((i: any) => i.material).map((i: any) => ({ material: i.material, qty: Math.max(0, i.qty - (i.issuedQty ?? 0)), mrItem: i.id })) : [{ material: null, qty: 1 }]);
  }, [open, project, mr]);
  const submit = async () => {
    try {
      const r: any = await api.post(`/inventory/${mode}`, {
        project: proj,
        materialRequest: mr?.id,
        issuedTo,
        notes,
        items: rows.filter((r) => r.material && r.qty > 0).map((r) => ({ material: r.material?.id ?? r.material, qty: r.qty, mrItem: r.mrItem })),
      });
      toast.success(`${mode === "issue" ? "Issued" : "Returned"} (${r.refNo})`);
      invalidate("/materials", "/inventory", "/material-requests", "/projects");
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={mode === "issue" ? "Issue factory stock to site" : "Return material from site to factory"} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>{mode === "issue" ? "Issue" : "Return"}</Button></>}>
      <div className="space-y-3">
        {!project && !mr && <div><label className="label">Site</label><EntitySelect value={proj} onChange={setProj} config={REF.activeProject} /></div>}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <EntitySelect className="col-span-8" value={r.material} config={REF.material} onChange={(id) => setRows((l) => l.map((x, k) => (k === i ? { ...x, material: id } : x)))} />
            <input type="number" min={0} step="any" className="input col-span-3" value={r.qty} onChange={(e) => setRows((l) => l.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) } : x)))} />
            <button className="col-span-1 text-stone-400 hover:text-red-600" onClick={() => setRows((l) => l.filter((_, k) => k !== i))}><Trash2 className="size-4" /></button>
          </div>
        ))}
        <Button size="xs" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setRows((l) => [...l, { material: null, qty: 1 }])}>Add</Button>
        {mode === "issue" && <div><label className="label">Handed to (supervisor / contractor)</label><input className="input" value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} /></div>}
        <div><label className="label">Notes</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

function MRDetail({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { can } = useAuth();
  const { data: mr, mutate } = useOne<any>(id ? `/material-requests/${id}` : null);
  const [issue, setIssue] = useState(false);
  const decide = async (action: "approve" | "reject") => {
    const reason = action === "reject" ? window.prompt("Reason for rejection?") ?? "" : "";
    try {
      await api.post(`/material-requests/${id}/decide`, { action, reason });
      toast.success(action === "approve" ? "Approved" : "Rejected");
      mutate();
      onChanged();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Drawer open={!!id} onClose={onClose} width="max-w-3xl" title={mr ? `${mr.mrNo} – ${mr.project?.name}` : "Material request"} subtitle={mr && <span>By {mr.requestedBy?.name} · {dateTime(mr.createdAt)}</span>}>
      {!mr ? <Loading /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge options={MR_STATUS} value={mr.status} />
            {mr.priority === "urgent" && <Badge color="red">Urgent</Badge>}
            {mr.trade && <Badge>{labelOf(TRADES, mr.trade)}</Badge>}
            {mr.requiredBy && <span className="text-sm text-muted">Required by {date(mr.requiredBy)}</span>}
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-[11px] uppercase text-stone-500"><tr><th className="py-2">Item</th><th className="text-right">Qty</th><th className="text-right">Factory stock</th><th className="text-right">Issued</th><th className="text-right">Ordered</th></tr></thead>
            <tbody>
              {mr.items.map((i: any) => (
                <tr key={i.id} className="border-b border-line">
                  <td className="py-2">{i.description}{i.notes && <span className="block text-xs text-muted">{i.notes}</span>}</td>
                  <td className="text-right">{i.qty} {i.unit}</td>
                  <td className={cx("text-right", i.material && i.material.stockQty < i.qty && "text-red-600")}>{i.material ? `${i.material.stockQty}` : "—"}</td>
                  <td className="text-right">{i.issuedQty || 0}</td>
                  <td className="text-right">{i.orderedQty || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {mr.notes && <p className="text-sm text-stone-600">{mr.notes}</p>}
          {mr.rejectionReason && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">Rejected: {mr.rejectionReason}</p>}
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {mr.status === "pending" && can("material_requests:approve") && (
              <>
                <Button variant="success" icon={<CheckCircle2 className="size-4" />} onClick={() => decide("approve")}>Approve</Button>
                <Button variant="secondary" icon={<XCircle className="size-4" />} onClick={() => decide("reject")}>Reject</Button>
              </>
            )}
            {["approved", "issued", "ordered"].includes(mr.status) && can("inventory:write") && (
              <Button variant="secondary" icon={<PackageMinus className="size-4" />} onClick={() => setIssue(true)}>Issue from factory stock</Button>
            )}
            {["approved", "issued"].includes(mr.status) && can("purchase_orders:write") && (
              <Button icon={<ShoppingCart className="size-4" />} onClick={() => router.push(`/procurement/orders/new?mr=${mr.id}`)}>Create purchase order</Button>
            )}
          </div>
        </div>
      )}
      <IssueModal open={issue} onClose={() => setIssue(false)} mr={mr} onDone={() => (mutate(), onChanged())} />
    </Drawer>
  );
}

export function MaterialRequestsView({ project }: { project?: string }) {
  const { can } = useAuth();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { rows, meta, loading, mutate } = useList("/material-requests", { project, status, page });
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      {!project && <PageHeader title="Material requests" subtitle="Requests raised from site → approved → issued from factory stock or ordered from vendor" actions={can("material_requests:write") && <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New request</Button>} />}
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <select className="input w-auto" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="">All statuses</option>
            {MR_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {project && can("material_requests:write") && <Button size="sm" className="ml-auto" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New request</Button>}
        </div>
        <DataTable
          loading={loading}
          rows={rows}
          onRowClick={(r) => setOpen(r.id)}
          columns={[
            { key: "mrNo", label: "Request", render: (r) => <span><span className="font-medium">{r.mrNo}</span>{r.priority === "urgent" && <Badge color="red" className="ml-2">Urgent</Badge>}<span className="block text-xs text-muted">{dateTime(r.createdAt)}</span></span> },
            ...(project ? [] : [{ key: "project", label: "Site", render: (r: any) => <ProjectLink project={r.project} /> }]),
            { key: "items", label: "Items", render: (r) => <span className="line-clamp-2 max-w-sm text-sm">{r.items.map((i: any) => `${i.description} (${i.qty} ${i.unit})`).join(", ")}</span> },
            { key: "requestedBy", label: "By", render: (r) => r.requestedBy?.name },
            { key: "requiredBy", label: "Needed", render: (r) => date(r.requiredBy) },
            { key: "status", label: "Status", render: (r) => <StatusBadge options={MR_STATUS} value={r.status} /> },
          ]}
        />
        {meta && <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />}
      </div>
      <MRDrawer open={creating} onClose={() => setCreating(false)} project={project} onSaved={mutate} />
      <MRDetail id={open} onClose={() => setOpen(null)} onChanged={mutate} />
    </div>
  );
}

/* ------------------------------ Purchase orders -------------------------- */
const poColumns = [
  { key: "poNo", label: "PO", render: (r: any) => <span><span className="font-medium">{r.poNo}</span><span className="block text-xs text-muted">{date(r.date)}</span></span> },
  { key: "vendor", label: "Vendor", render: (r: any) => r.vendor?.name },
  { key: "for", label: "For", render: (r: any) => (r.project ? <ProjectLink project={r.project} /> : <Badge color="brand">Factory stock</Badge>) },
  { key: "total", label: "Total", render: (r: any) => money(r.total), align: "right" as const },
  { key: "paymentStatus", label: "Payment", render: (r: any) => <StatusBadge options={PAYMENT_STATUS} value={r.paymentStatus} />, hideOnMobile: true },
  { key: "status", label: "Status", render: (r: any) => <StatusBadge options={PO_STATUS} value={r.status} /> },
];

export function PurchaseOrdersView({ project }: { project?: string }) {
  const router = useRouter();
  return (
    <ResourcePage
      title={project ? undefined : "Purchase orders"}
      subtitle="Order material from shop vendors — for a site, or independent for factory stock"
      embedded={!!project}
      endpoint="/purchase-orders"
      resource="purchase_orders"
      entityName="purchase order"
      columns={project ? poColumns.filter((c) => c.key !== "for") : poColumns}
      baseParams={project ? { project } : undefined}
      filters={[
        { name: "status", label: "Status", options: PO_STATUS },
        { name: "paymentStatus", label: "Payment", options: PAYMENT_STATUS },
        ...(project ? [] : [{ name: "vendor", label: "Vendor", ref: REF.vendor }, { name: "deliverTo", label: "Deliver to", options: DELIVERY_LOCATIONS }]),
      ]}
      rowHref={(r) => `/procurement/orders/${r.id}`}
      onCreate={() => router.push(`/procurement/orders/new${project ? `?project=${project}` : ""}`)}
      createLabel="New PO"
      searchPlaceholder="PO number, item…"
    />
  );
}

function POEditor({ initial }: { initial: any }) {
  const router = useRouter();
  const toast = useToast();
  const [po, setPo] = useState<any>(initial);
  const [saving, setSaving] = useState(false);
  const set = (p: any) => setPo((x: any) => ({ ...x, ...p }));
  const subtotal = po.items.reduce((s: number, i: LineItem) => s + i.qty * i.rate, 0);
  const tax = po.items.reduce((s: number, i: LineItem) => s + (i.qty * i.rate * (i.gstRate ?? 0)) / 100, 0);
  const save = async (status: "draft" | "ordered") => {
    setSaving(true);
    try {
      const payload = {
        vendor: po.vendor?.id ?? po.vendor,
        project: po.project?.id ?? po.project ?? null,
        materialRequest: po.materialRequest?.id ?? po.materialRequest ?? null,
        deliverTo: po.deliverTo,
        category: po.category || undefined,
        date: po.date || null,
        expectedDate: po.expectedDate || null,
        items: po.items.map(({ receivedQty: _r, ...i }: any) => (void _r, { ...i, material: i.material?.id ?? i.material ?? null })),
        freight: po.freight || 0,
        terms: po.terms,
        notes: po.notes,
        ...(po.id ? {} : { status }),
      };
      const r: any = po.id ? await api.patch(`/purchase-orders/${po.id}`, payload) : await api.post("/purchase-orders", payload);
      toast.success("Purchase order saved");
      invalidate("/purchase-orders", "/material-requests");
      router.push(`/procurement/orders/${r.id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-5">
      <PageHeader
        back={<Link href="/procurement/orders" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft className="size-3.5" /> Purchase orders</Link>}
        title={po.id ? `Edit ${po.poNo}` : "New purchase order"}
        actions={
          <>
            {!po.id && <Button variant="secondary" loading={saving} onClick={() => save("draft")}>Save draft</Button>}
            <Button icon={<Save className="size-4" />} loading={saving} onClick={() => save("ordered")}>{po.id ? "Save" : "Place order"}</Button>
          </>
        }
      />
      <Card title="Order details">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div><label className="label">Vendor *</label><EntitySelect value={po.vendor ?? null} onChange={(id) => set({ vendor: id })} config={REF.vendor} /></div>
          <div><label className="label">Site (leave empty for factory stock)</label><EntitySelect value={po.project ?? null} onChange={(id) => set({ project: id, deliverTo: id ? "site" : "factory" })} config={REF.project} /></div>
          <div>
            <label className="label">Deliver to</label>
            <select className="input" value={po.deliverTo} onChange={(e) => set({ deliverTo: e.target.value })}>{DELIVERY_LOCATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
          </div>
          <div>
            <label className="label">Category (for GRN)</label>
            <select className="input" value={po.category ?? ""} onChange={(e) => set({ category: e.target.value })}><option value="">—</option>{MATERIAL_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
          </div>
          <div><label className="label">PO date</label><input type="date" className="input" value={toInputDate(po.date)} onChange={(e) => set({ date: e.target.value })} /></div>
          <div><label className="label">Expected delivery</label><input type="date" className="input" value={toInputDate(po.expectedDate)} onChange={(e) => set({ expectedDate: e.target.value })} /></div>
        </div>
      </Card>
      <Card title="Items">
        <LineItemsEditor items={po.items} onChange={(items) => set({ items })} showMaterial />
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="w-40"><label className="label">Freight / cartage</label><input type="number" className="input" value={po.freight ?? 0} onChange={(e) => set({ freight: Number(e.target.value) })} /></div>
          <Totals rows={[{ label: "Subtotal", value: subtotal }, { label: "GST", value: tax }, { label: "Freight", value: po.freight, hidden: !po.freight }, { label: "Total", value: subtotal + tax + (po.freight || 0), strong: true }]} />
        </div>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Terms"><textarea className="input" rows={4} value={po.terms ?? ""} onChange={(e) => set({ terms: e.target.value })} placeholder="Default PO terms are added automatically" /></Card>
        <Card title="Notes"><textarea className="input" rows={4} value={po.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></Card>
      </div>
    </div>
  );
}

export function NewPurchaseOrder() {
  const sp = useSearchParams();
  const mrId = sp.get("mr");
  const project = sp.get("project");
  const { data: mr, isLoading } = useOne<any>(mrId ? `/material-requests/${mrId}` : null);
  if (mrId && isLoading) return <Loading />;
  const items: LineItem[] = mr
    ? mr.items
        .filter((i: any) => i.qty - (i.issuedQty ?? 0) - (i.orderedQty ?? 0) > 0)
        .map((i: any) => ({ material: i.material, description: i.description, unit: i.unit, qty: i.qty - (i.issuedQty ?? 0) - (i.orderedQty ?? 0), rate: i.material?.defaultRate ?? 0, gstRate: 18 }))
    : [emptyItem()];
  return <POEditor initial={{ project: mr?.project ?? project ?? null, materialRequest: mrId, deliverTo: mr?.project || project ? "site" : "factory", items, date: toInputDate(new Date()), freight: 0 }} />;
}

function ReceiveModal({ po, open, onClose, onDone }: { po: any; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [vehicle, setVehicle] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<any[]>([]);
  useEffect(() => {
    if (open) setRows(po.items.map((i: any) => ({ poItem: i.id, material: i.material?.id ?? i.material, description: i.description, unit: i.unit, orderedQty: i.qty, pending: Math.max(0, i.qty - (i.receivedQty ?? 0)), receivedQty: Math.max(0, i.qty - (i.receivedQty ?? 0)), rejectedQty: 0, rate: i.rate, remarks: "" })));
  }, [open, po]);
  const submit = async () => {
    try {
      await api.post("/grn", {
        purchaseOrder: po.id,
        items: rows.filter((r) => r.receivedQty > 0).map(({ pending: _p, ...r }) => (void _p, r)),
        vendorInvoiceNo: invoiceNo,
        vendorInvoiceAmount: amount === "" ? undefined : amount,
        vehicleNo: vehicle,
        notes,
        photos: photos.map((p: any) => p.id ?? p),
      });
      toast.success("Goods received – GRN created");
      invalidate("/purchase-orders", "/grn", "/materials", "/inventory");
      onDone();
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="xl" title={`Receive goods – ${po.poNo}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={<Truck className="size-4" />} onClick={submit}>Create GRN</Button></>}>
      <p className="mb-3 text-sm text-muted">Delivered to <strong>{labelOf(DELIVERY_LOCATIONS, po.deliverTo)}</strong>{po.deliverTo === "factory" ? " — accepted qty is added to factory stock." : " — recorded against the site."}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line text-left text-[11px] uppercase text-stone-500"><tr><th className="py-2">Item</th><th className="text-right">Pending</th><th className="w-24">Received</th><th className="w-24">Rejected</th><th>Remarks</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.poItem} className="border-b border-line">
                <td className="py-2">{r.description}<span className="block text-xs text-muted">{r.unit}</span></td>
                <td className="text-right">{r.pending}</td>
                <td className="px-1"><input type="number" min={0} step="any" className="input px-2 py-1" value={r.receivedQty} onChange={(e) => setRows((l) => l.map((x, k) => (k === i ? { ...x, receivedQty: Number(e.target.value) } : x)))} /></td>
                <td className="px-1"><input type="number" min={0} step="any" className="input px-2 py-1" value={r.rejectedQty} onChange={(e) => setRows((l) => l.map((x, k) => (k === i ? { ...x, rejectedQty: Number(e.target.value) } : x)))} /></td>
                <td className="px-1"><input className="input px-2 py-1" value={r.remarks} onChange={(e) => setRows((l) => l.map((x, k) => (k === i ? { ...x, remarks: e.target.value } : x)))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div><label className="label">Vendor bill no.</label><input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /></div>
        <div><label className="label">Bill amount</label><input type="number" className="input" value={amount} onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))} /></div>
        <div><label className="label">Vehicle no.</label><input className="input" value={vehicle} onChange={(e) => setVehicle(e.target.value)} /></div>
        <div className="sm:col-span-3"><label className="label">Notes</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <div className="sm:col-span-3"><label className="label">Delivery challan / bill / material photos</label><Attachments files={photos} onChange={(ids) => setPhotos((prev) => ids.map((x) => prev.find((p: any) => (p.id ?? p) === x) ?? x))} meta={{ category: "invoice", project: po.project?.id, entityType: "GRN" }} /></div>
      </div>
    </Modal>
  );
}

export function PurchaseOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const { data: po, mutate, isLoading } = useOne<any>(`/purchase-orders/${id}`);
  const { rows: grns, mutate: reloadGrn } = useList("/grn", { purchaseOrder: id, limit: 50 });
  const { rows: pays } = useList(can("expenses:read") ? "/expenses" : null, { purchaseOrder: id, limit: 50 });
  const [receive, setReceive] = useState(false);
  const [edit, setEdit] = useState(false);
  if (isLoading) return <Loading />;
  if (!po) return <Empty title="PO not found" />;
  if (edit) return <POEditor initial={{ ...po, date: toInputDate(po.date), expectedDate: toInputDate(po.expectedDate) }} />;
  const status = async (s: string) => {
    if (s === "cancelled" && !(await confirm({ title: "Cancel this PO?", danger: true, confirmText: "Cancel PO" }))) return;
    try {
      await api.post(`/purchase-orders/${id}/status`, { status: s });
      mutate();
      toast.success("Updated");
    } catch (e) {
      toast.error(e);
    }
  };
  const canReceive = can("grn:write") && ["ordered", "partially_received", "draft"].includes(po.status);
  return (
    <div className="space-y-5">
      <PageHeader
        back={<Link href="/procurement/orders" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft className="size-3.5" /> Purchase orders</Link>}
        title={po.poNo}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge options={PO_STATUS} value={po.status} /><StatusBadge options={PAYMENT_STATUS} value={po.paymentStatus} /> {po.vendor?.name}</span>}
        actions={
          <>
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.open(`/print/po/${id}`, "_blank")}>Print</Button>
            {po.status === "draft" && can("purchase_orders:write") && <Button variant="secondary" onClick={() => status("ordered")}>Mark ordered</Button>}
            {["draft", "ordered"].includes(po.status) && can("purchase_orders:write") && <Button variant="secondary" onClick={() => setEdit(true)}>Edit</Button>}
            {["draft", "ordered"].includes(po.status) && can("purchase_orders:write") && <Button variant="ghost" className="text-red-600" onClick={() => status("cancelled")}>Cancel PO</Button>}
            {canReceive && <Button icon={<Truck className="size-4" />} onClick={() => setReceive(true)}>Receive goods (GRN)</Button>}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Details">
          <dl className="grid grid-cols-2 gap-4">
            <KV label="Vendor" className="col-span-2">{po.vendor?.name}<span className="block text-xs text-muted">{po.vendor?.phone}</span></KV>
            <KV label="For" className="col-span-2">{po.project ? <ProjectLink project={po.project} /> : "Factory stock (independent)"}</KV>
            <KV label="Deliver to">{labelOf(DELIVERY_LOCATIONS, po.deliverTo)}</KV>
            <KV label="Category">{labelOf(MATERIAL_CATEGORIES, po.category)}</KV>
            <KV label="Date">{date(po.date)}</KV>
            <KV label="Expected">{date(po.expectedDate)}</KV>
            <KV label="From request">{po.materialRequest?.mrNo}</KV>
            <KV label="Created by">{po.createdBy?.name}</KV>
            <KV label="Total">{money(po.total)}</KV>
            <KV label="Paid">{money(po.paidAmount)}</KV>
          </dl>
        </Card>
        <Card title="Items" className="lg:col-span-2" padded={false}>
          <DataTable
            rows={po.items}
            columns={[
              { key: "description", label: "Item", render: (i) => <span>{i.description}{i.specification && <span className="block text-xs text-muted">{i.specification}</span>}</span> },
              { key: "qty", label: "Qty", render: (i) => `${number(i.qty)} ${i.unit}`, align: "right" },
              { key: "receivedQty", label: "Received", render: (i) => <span className={cx(i.receivedQty >= i.qty ? "text-emerald-700" : i.receivedQty > 0 ? "text-amber-700" : "")}>{number(i.receivedQty ?? 0)}</span>, align: "right" },
              { key: "rate", label: "Rate", render: (i) => money(i.rate, true), align: "right" },
              { key: "amount", label: "Amount", render: (i) => money(i.amount), align: "right" },
            ]}
          />
          <div className="border-t border-line p-4"><Totals rows={[{ label: "Subtotal", value: po.subtotal }, { label: "GST", value: po.taxAmount }, { label: "Freight", value: po.freight, hidden: !po.freight }, { label: "Total", value: po.total, strong: true }]} /></div>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`Goods received (${grns.length})`} padded={false}>
          {grns.length === 0 ? <Empty title="Nothing received yet" /> : (
            <ul className="divide-y divide-line">
              {grns.map((g) => (
                <li key={g.id} className="px-4 py-3">
                  <div className="flex justify-between"><span className="font-medium">{g.grnNo}</span><span className="text-xs text-muted">{dateTime(g.receivedAt)} · {g.receivedBy?.name}</span></div>
                  <p className="text-xs text-muted">{g.items.map((i: any) => `${i.description}: ${i.receivedQty - (i.rejectedQty || 0)}`).join(", ")}{g.vendorInvoiceNo && ` · Bill ${g.vendorInvoiceNo}`}</p>
                  {g.photos?.length > 0 && <div className="mt-2"><FileGrid files={g.photos} /></div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {can("expenses:read") && (
          <Card title="Payments to vendor" padded={false} action={can("expenses:write") && <Button size="xs" variant="secondary" href={`/accounts/expenses?po=${id}`}>Record payment</Button>}>
            <DataTable rows={pays} columns={expenseColumns.filter((c) => ["date", "mode", "amount"].includes(c.key))} empty={<Empty title="No payments yet" />} />
          </Card>
        )}
      </div>
      <ReceiveModal po={po} open={receive} onClose={() => setReceive(false)} onDone={() => (mutate(), reloadGrn())} />
    </div>
  );
}

/* ---------------------------------- GRN ---------------------------------- */
export function GRNView({ project }: { project?: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  return (
    <ResourcePage
      title={project ? undefined : "Goods receipt notes (GRN)"}
      subtitle="Every delivery received at factory or site, category-wise"
      embedded={!!project}
      endpoint="/grn"
      resource="grn"
      entityName="GRN"
      canDelete={false}
      baseParams={project ? { project } : undefined}
      filters={[{ name: "category", label: "Category", options: MATERIAL_CATEGORIES }, { name: "location", label: "Location", options: DELIVERY_LOCATIONS }, ...(project ? [] : [{ name: "vendor", label: "Vendor", ref: REF.vendor }])]}
      columns={[
        { key: "grnNo", label: "GRN", render: (r) => <span><span className="font-medium">{r.grnNo}</span><span className="block text-xs text-muted">{dateTime(r.receivedAt)}</span></span> },
        { key: "po", label: "PO", render: (r) => (r.purchaseOrder ? <Link className="hover:underline" href={`/procurement/orders/${r.purchaseOrder.id}`} onClick={(e) => e.stopPropagation()}>{r.purchaseOrder.poNo}</Link> : "—") },
        { key: "vendor", label: "Vendor", render: (r) => r.vendor?.name },
        { key: "location", label: "At", render: (r) => (r.location === "factory" ? <Badge color="brand">Factory</Badge> : <ProjectLink project={r.project} />) },
        { key: "category", label: "Category", render: (r) => labelOf(MATERIAL_CATEGORIES, r.category), hideOnMobile: true },
        { key: "items", label: "Items", render: (r) => <span className="line-clamp-1 max-w-xs text-xs">{r.items.map((i: any) => `${i.description} ×${i.receivedQty - (i.rejectedQty || 0)}`).join(", ")}</span> },
        { key: "bill", label: "Vendor bill", render: (r) => r.vendorInvoiceNo ?? "—", hideOnMobile: true },
      ]}
      rowMenu={
        can("grn:delete")
          ? (row, reload) => (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-stone-50"
                onClick={async () => {
                  if (!(await confirm({ title: `Delete ${row.grnNo}?`, message: "Stock and PO received quantities will be reversed.", danger: true, confirmText: "Delete & reverse" }))) return;
                  try {
                    await api.del(`/grn/${row.id}`);
                    toast.success("GRN deleted and stock reversed");
                    reload();
                  } catch (e) {
                    toast.error(e);
                  }
                }}
              >
                <Trash2 className="size-4" /> Delete & reverse
              </button>
            )
          : undefined
      }
    />
  );
}

/* -------------------------------- Inventory ------------------------------ */
function StockTable() {
  const [low, setLow] = useState(false);
  return (
    <ResourcePage
      key={low ? "low" : "all"}
      embedded
      endpoint="/materials"
      resource="materials"
      entityName="material"
      fields={materialFields}
      defaults={{ unit: "nos", gstRate: 18, isActive: true }}
      filters={[{ name: "category", label: "Category", options: MATERIAL_CATEGORIES }]}
      baseParams={low ? { lowStock: true } : undefined}
      limit={50}
      sort="name"
      headerActions={
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> Low stock only
        </label>
      }
      columns={[
        { key: "name", label: "Material", render: (r) => <span><span className="font-medium">{r.name}</span><span className="block text-xs text-muted">{r.code} {r.brand && `· ${r.brand}`}</span></span> },
        { key: "category", label: "Category", render: (r) => labelOf(MATERIAL_CATEGORIES, r.category) },
        { key: "stockQty", label: "Factory stock", render: (r) => <span className={cx("font-semibold tabular-nums", r.minStock > 0 && r.stockQty <= r.minStock && "text-red-600")}>{number(r.stockQty)} {labelOf(UNITS, r.unit)}</span>, align: "right" },
        { key: "minStock", label: "Re-order at", render: (r) => (r.minStock ? number(r.minStock) : "—"), align: "right", hideOnMobile: true },
        { key: "avgCost", label: "Avg cost", render: (r) => money(r.avgCost || r.defaultRate, true), align: "right" },
        { key: "value", label: "Stock value", render: (r) => money((r.stockQty || 0) * (r.avgCost || 0)), align: "right", hideOnMobile: true },
      ]}
      createLabel="Add material"
      searchPlaceholder="Material, code, brand…"
      invalidates={["/inventory"]}
    />
  );
}

function Ledger() {
  const [material, setMaterial] = useState<string | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const { rows, meta, loading } = useList("/inventory/ledger", { material, project, type, page });
  return (
    <div className="card">
      <div className="flex flex-wrap gap-2 border-b border-line p-3">
        <EntitySelect className="w-64" value={material} onChange={setMaterial} config={REF.material} placeholder="All materials" />
        <EntitySelect className="w-64" value={project} onChange={setProject} config={REF.project} placeholder="All sites" />
        <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)}><option value="">All movements</option>{STOCK_TXN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
      </div>
      <DataTable
        loading={loading}
        rows={rows}
        columns={[
          { key: "date", label: "Date", render: (r) => dateTime(r.date) },
          { key: "material", label: "Material", render: (r) => r.material?.name },
          { key: "type", label: "Movement", render: (r) => <StatusBadge options={STOCK_TXN_TYPES} value={r.type} /> },
          { key: "qty", label: "Qty", render: (r) => <span className={r.qty < 0 ? "text-red-600" : "text-emerald-700"}>{r.qty > 0 ? "+" : ""}{number(r.qty)} {r.material?.unit}</span>, align: "right" },
          { key: "balanceAfter", label: "Balance", render: (r) => (r.balanceAfter != null ? number(r.balanceAfter) : "—"), align: "right" },
          { key: "project", label: "Site", render: (r) => <ProjectLink project={r.project} /> },
          { key: "ref", label: "Ref", render: (r) => <span className="text-xs">{r.refNo}{r.issuedTo && ` → ${r.issuedTo}`}{r.notes && <span className="block text-muted">{r.notes}</span>}</span> },
        ]}
      />
      {meta && <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />}
    </div>
  );
}

export function SiteConsumption({ project: fixed }: { project?: string }) {
  const [project, setProject] = useState<string | null>(fixed ?? null);
  const { data, isLoading } = useOne<any[]>(project ? `/inventory/consumption?project=${project}` : null);
  return (
    <div className="space-y-3">
      {!fixed && <EntitySelect className="w-80" value={project} onChange={setProject} config={REF.project} placeholder="Choose a site" />}
      {!project ? <Empty title="Select a site to see material consumed" /> : isLoading ? <Loading /> : (
        <div className="card">
          <DataTable
            rows={(data ?? []).map((r: any) => ({ ...r, id: r.material.id }))}
            empty={<Empty title="No material movements for this site yet" />}
            columns={[
              { key: "m", label: "Material", render: (r) => r.material.name },
              { key: "issued", label: "From factory", render: (r) => number(r.issued), align: "right" },
              { key: "direct", label: "Direct from vendor", render: (r) => number(r.direct), align: "right" },
              { key: "returned", label: "Returned", render: (r) => number(r.returned), align: "right" },
              { key: "net", label: "Net used", render: (r) => <strong>{number(r.net)} {labelOf(UNITS, r.material.unit)}</strong>, align: "right" },
              { key: "value", label: "Cost", render: (r) => money(r.value), align: "right" },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function AdjustModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [material, setMaterial] = useState<string | null>(null);
  const [qty, setQty] = useState(0);
  const [rate, setRate] = useState(0);
  const [notes, setNotes] = useState("");
  const submit = async () => {
    try {
      await api.post("/inventory/adjust", { material, qty, rate, notes });
      toast.success("Stock adjusted");
      invalidate("/materials", "/inventory");
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Stock adjustment" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Adjust</Button></>}>
      <div className="space-y-3">
        <div><label className="label">Material</label><EntitySelect value={material} onChange={setMaterial} config={REF.material} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Qty (+ add / − remove)</label><input type="number" step="any" className="input" value={qty} onChange={(e) => setQty(Number(e.target.value))} /></div>
          <div><label className="label">Rate (for additions)</label><input type="number" className="input" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></div>
        </div>
        <div><label className="label">Reason *</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Physical count / damage / opening stock…" /></div>
      </div>
    </Modal>
  );
}

export function InventoryPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<"stock" | "ledger" | "consumption">("stock");
  const [modal, setModal] = useState<null | "issue" | "return" | "adjust">(null);
  return (
    <div>
      <PageHeader
        title="Factory stock"
        subtitle="Material bought for the factory (e.g. 10 ply for 3 sites), issued to sites and returned"
        actions={
          can("inventory:write") && (
            <>
              <Button variant="secondary" icon={<PackageMinus className="size-4" />} onClick={() => setModal("issue")}>Issue to site</Button>
              <Button variant="secondary" icon={<PackagePlus className="size-4" />} onClick={() => setModal("return")}>Return from site</Button>
              {can("inventory:approve") && <Button variant="secondary" icon={<SlidersHorizontal className="size-4" />} onClick={() => setModal("adjust")}>Adjust</Button>}
            </>
          )
        }
      />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: "stock", label: "Stock & catalog" }, { value: "ledger", label: "Stock ledger" }, { value: "consumption", label: "Site-wise consumption" }]} />
      {tab === "stock" && <StockTable />}
      {tab === "ledger" && <Ledger />}
      {tab === "consumption" && <SiteConsumption />}
      <IssueModal open={modal === "issue" || modal === "return"} mode={modal === "return" ? "return" : "issue"} onClose={() => setModal(null)} />
      <AdjustModal open={modal === "adjust"} onClose={() => setModal(null)} />
    </div>
  );
}

/* --------------------------------- Vendors ------------------------------- */
export function VendorsPage() {
  const { can } = useAuth();
  const [view, setView] = useState<"list" | "payables">("list");
  const { data: pay } = useOne<any>(view === "payables" && can("accounts:read") ? "/accounts/payables" : null);
  return (
    <div>
      {view === "list" ? (
        <ResourcePage
          title="Vendors"
          subtitle="Shops & suppliers — plywood, hardware, electrical, tiles…"
          endpoint="/vendors"
          resource="vendors"
          entityName="vendor"
          columns={vendorColumns}
          fields={vendorFields}
          defaults={{ isActive: true }}
          filters={[{ name: "categories", label: "Supplies", options: MATERIAL_CATEGORIES }]}
          createLabel="Add vendor"
          headerActions={can("accounts:read") && <Segmented options={[{ value: "list", label: "Vendors" }, { value: "payables", label: "Payables" }]} value={view} onChange={setView} />}
          searchPlaceholder="Name, phone, GSTIN…"
        />
      ) : (
        <>
          <PageHeader title="Vendor & contractor payables" actions={<Segmented options={[{ value: "list", label: "Vendors" }, { value: "payables", label: "Payables" }]} value={view} onChange={setView} />} />
          {!pay ? <Loading /> : (
            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Vendors (PO value − paid)" padded={false}>
                <DataTable rows={pay.vendors} empty={<Empty title="Nothing due" />} columns={[{ key: "name", label: "Vendor" }, { key: "orders", label: "POs", align: "right" }, { key: "total", label: "Ordered", render: (r) => money(r.total), align: "right" }, { key: "due", label: "Due", render: (r) => <strong className="text-red-700">{money(r.due)}</strong>, align: "right" }]} />
              </Card>
              <Card title="Contractors (work order − paid)" padded={false}>
                <DataTable rows={pay.contractors} empty={<Empty title="Nothing due" />} columns={[{ key: "name", label: "Contractor", render: (r) => <span>{r.name}<span className="block text-xs text-muted">{labelOf(TRADES, r.trade)}</span></span> }, { key: "total", label: "Agreed", render: (r) => money(r.total), align: "right" }, { key: "paid", label: "Paid", render: (r) => money(r.paid), align: "right" }, { key: "due", label: "Due", render: (r) => <strong className="text-red-700">{money(r.due)}</strong>, align: "right" }]} />
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

