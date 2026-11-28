"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { AlertTriangle, ClipboardCheck, Copy, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth";
import { Pagination, ResourcePage } from "@/components/data-table";
import { Attachments, FileGrid, ProjectLink, REF } from "@/components/domain";
import { EntitySelect, FormGrid, errorsFrom, toPayload, useFormState, type Field } from "@/components/form";
import { Badge, Button, Card, Drawer, Empty, Loading, Modal, PageHeader, Progress, Segmented, StatusBadge, cx, useConfirm, useToast } from "@/components/ui";
import { invalidate, useList } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { CHECKLIST_STATUS, TRADES, WORK_ORDER_STATUS, labelOf } from "@/lib/constants";
import { date, dateTime, relative, toInputDate } from "@/lib/format";
import { contractorColumns, contractorFields, workOrderColumns, workOrderFields } from "./config";

/* ------------------------------ Daily reports ---------------------------- */
const drFields: Field[] = [
  { name: "date", label: "Date", type: "date", required: true },
  { name: "progress", label: "Overall site progress %", type: "number", min: 0, max: 100 },
  { name: "workDone", label: "Work done today", type: "textarea", rows: 4, required: true },
  { name: "materialsUsed", label: "Material used / received", type: "textarea", rows: 2 },
  { name: "issues", label: "Issues / blockers / client remarks", type: "textarea", rows: 2 },
  { name: "nextDayPlan", label: "Plan for tomorrow", type: "textarea", rows: 2 },
];

function DailyReportDrawer({ open, onClose, record, project, onSaved }: { open: boolean; onClose: () => void; record?: any; project?: string; onSaved?: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const remove = async () => {
    if (!(await confirm({ title: "Delete this daily report?", danger: true, confirmText: "Delete" }))) return;
    try {
      await api.del(`/daily-reports/${record.id}`);
      toast.success("Report deleted");
      invalidate("/daily-reports", "/projects");
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  const f = useFormState({});
  const [proj, setProj] = useState<string | null>(null);
  const [manpower, setManpower] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    f.setValues(record ? { ...record } : { date: toInputDate(new Date()) });
    setProj(project ?? record?.project?.id ?? null);
    setManpower(record?.manpower?.map((m: any) => ({ ...m, contractor: m.contractor })) ?? [{ trade: "carpentry", count: 0, contractor: null }]);
    setPhotos(record?.photos ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record]);
  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...toPayload(drFields, f.values),
        manpower: manpower.filter((m) => m.count > 0).map((m) => ({ trade: m.trade, count: Number(m.count), contractor: m.contractor?.id ?? m.contractor ?? null })),
        photos: photos.map((p: any) => p.id ?? p),
      };
      if (record?.id) await api.patch(`/daily-reports/${record.id}`, payload);
      else await api.post("/daily-reports", { ...payload, project: proj });
      toast.success("Daily report saved");
      invalidate("/daily-reports", "/projects");
      onSaved?.();
      onClose();
    } catch (e) {
      f.setErrors(errorsFrom(e));
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} width="max-w-3xl" title={record ? "Edit daily report" : "Daily site report"} footer={<>{record?.id && can("daily_reports:delete") && <Button variant="ghost" className="mr-auto text-red-600" icon={<Trash2 className="size-4" />} onClick={remove}>Delete</Button>}<Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>{record?.id ? "Save changes" : "Submit report"}</Button></>}>
      <div className="space-y-5">
        {!project && !record && (
          <div>
            <label className="label">Site *</label>
            <EntitySelect value={proj} onChange={setProj} config={REF.activeProject} />
          </div>
        )}
        <FormGrid fields={drFields} values={f.values} setValue={f.setValue} errors={f.errors} />
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Users className="size-4" /> Manpower on site</h4>
          <div className="space-y-2">
            {manpower.map((m, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <select className="input col-span-4" value={m.trade} onChange={(e) => setManpower((l) => l.map((x, k) => (k === i ? { ...x, trade: e.target.value } : x)))}>
                  {TRADES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <EntitySelect className="col-span-5" value={m.contractor} onChange={(id) => setManpower((l) => l.map((x, k) => (k === i ? { ...x, contractor: id } : x)))} config={REF.contractor} placeholder="Contractor" />
                <input type="number" min={0} className="input col-span-2" value={m.count} onChange={(e) => setManpower((l) => l.map((x, k) => (k === i ? { ...x, count: Number(e.target.value) } : x)))} />
                <button className="col-span-1 text-stone-400 hover:text-red-600" onClick={() => setManpower((l) => l.filter((_, k) => k !== i))}><Trash2 className="size-4" /></button>
              </div>
            ))}
            <Button size="xs" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setManpower((l) => [...l, { trade: "carpentry", count: 1, contractor: null }])}>Add trade</Button>
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Site progress photos</h4>
          <Attachments files={photos} onChange={(ids) => setPhotos((prev) => ids.map((x) => prev.find((p: any) => (p.id ?? p) === x) ?? x))} meta={{ category: "progress", project: proj ?? undefined, entityType: "DailyReport" }} />
        </div>
      </div>
    </Drawer>
  );
}

export function DailyReportsView({ project }: { project?: string }) {
  const { can } = useAuth();
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { rows, meta, loading, mutate } = useList("/daily-reports", { project: project ?? filterProject ?? undefined, page, limit: 20, sort: "-date" });
  const [drawer, setDrawer] = useState<any>(false);
  return (
    <div>
      {!project && (
        <PageHeader
          title="Daily site reports"
          subtitle="Supervisor updates: work done, manpower, issues & photos"
          actions={
            <>
              <EntitySelect className="w-64" value={filterProject} onChange={(v) => (setFilterProject(v), setPage(1))} config={REF.project} placeholder="All sites" />
              {can("daily_reports:write") && <Button icon={<Plus className="size-4" />} onClick={() => setDrawer(null)}>New report</Button>}
            </>
          }
        />
      )}
      {project && can("daily_reports:write") && <Button className="mb-3" size="sm" icon={<Plus className="size-4" />} onClick={() => setDrawer(null)}>New daily report</Button>}
      {loading && !rows.length ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty title="No reports yet" hint="Supervisors submit a short report every day from site (mobile friendly)." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} padded>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{date(r.date)}</p>
                  <p className="text-xs text-muted">
                    {!project && <><ProjectLink project={r.project} /> · </>}
                    {r.reportedBy?.name} · {relative(r.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {r.progress != null && (
                    <div className="flex w-32 items-center gap-2">
                      <Progress value={r.progress} />
                      <span className="text-xs tabular-nums">{r.progress}%</span>
                    </div>
                  )}
                  {can("daily_reports:write") && <Button size="xs" variant="ghost" onClick={() => api.get(`/daily-reports/${r.id}`).then(setDrawer)}>Edit</Button>}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm">{r.workDone}</p>
              {r.manpower?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.manpower.map((m: any, i: number) => (
                    <Badge key={i}>{labelOf(TRADES, m.trade)}: {m.count}{m.contractor?.name ? ` (${m.contractor.name})` : ""}</Badge>
                  ))}
                </div>
              )}
              {r.issues && <p className="mt-2 flex items-start gap-1.5 rounded bg-red-50 px-2 py-1.5 text-sm text-red-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{r.issues}</p>}
              {r.nextDayPlan && <p className="mt-2 text-sm text-stone-600"><span className="font-medium">Tomorrow:</span> {r.nextDayPlan}</p>}
              {r.photos?.length > 0 && <div className="mt-3"><FileGrid files={r.photos} /></div>}
            </Card>
          ))}
          {meta && meta.pages > 1 && <div className="card"><Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} /></div>}
        </div>
      )}
      <DailyReportDrawer open={drawer !== false} onClose={() => setDrawer(false)} record={drawer || undefined} project={project} onSaved={mutate} />
    </div>
  );
}

/* -------------------------------- Checklists ----------------------------- */
function ChecklistHeaderModal({ c, onClose, onSaved }: { c: any; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  // mounted only while open, so the fields start from the checklist as it is now
  const [name, setName] = useState<string>(c.name ?? "");
  const [trade, setTrade] = useState<string>(c.trade ?? "");
  const [assignedTo, setAssignedTo] = useState<any>(c.assignedTo ?? null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim()) return toast.error("Checklist name is required");
    setSaving(true);
    try {
      await api.patch(`/checklists/${c.id}`, { name: name.trim(), trade, assignedTo: assignedTo?.id ?? assignedTo ?? null });
      toast.success("Checklist updated");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Edit checklist" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Save changes</Button></>}>
      <div className="space-y-3">
        <div><label className="label">Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div>
          <label className="label">Trade</label>
          <select className="input" value={trade} onChange={(e) => setTrade(e.target.value)}>
            <option value="">General</option>
            {TRADES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div><label className="label">Responsible person</label><EntitySelect value={assignedTo} onChange={setAssignedTo} config={REF.user} /></div>
      </div>
    </Modal>
  );
}

function ChecklistCard({ c, reload }: { c: any; reload: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const [items, setItems] = useState<any[]>(c.items);
  const [newItem, setNewItem] = useState("");
  const [editHeader, setEditHeader] = useState(false);
  const [editItem, setEditItem] = useState<{ id: string; text: string; remark: string } | null>(null);
  useEffect(() => setItems(c.items), [c.items]);
  const saveItem = async () => {
    if (!editItem) return;
    if (!editItem.text.trim()) return toast.error("The check can't be empty");
    try {
      await api.patch(`/checklists/${c.id}/items/${editItem.id}`, { text: editItem.text.trim(), remark: editItem.remark });
      setEditItem(null);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };
  const [adding, setAdding] = useState(false);
  const addItem = async () => {
    if (!newItem.trim() || adding) return; // Enter + click must not add the same check twice
    setAdding(true);
    try {
      await api.post(`/checklists/${c.id}/items`, { text: newItem.trim() });
      setNewItem("");
      reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setAdding(false);
    }
  };
  const removeItem = async (it: any) => {
    if (!(await confirm({ title: "Remove this check?", message: it.text, danger: true, confirmText: "Remove" }))) return;
    try {
      await api.del(`/checklists/${c.id}/items/${it.id}`);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };
  const done = items.filter((i) => i.checked).length;
  const toggle = async (it: any) => {
    setItems((l) => l.map((x) => (x.id === it.id ? { ...x, checked: !x.checked } : x)));
    try {
      await api.patch(`/checklists/${c.id}/items/${it.id}`, { checked: !it.checked });
      reload();
    } catch (e) {
      toast.error(e);
      setItems(c.items);
    }
  };
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {c.name}
          <StatusBadge options={CHECKLIST_STATUS} value={c.status} />
          {c.trade && <Badge>{labelOf(TRADES, c.trade)}</Badge>}
        </span>
      }
      action={
        (can("checklists:write") || can("checklists:delete")) && (
          <span className="flex items-center gap-2">
            {can("checklists:write") && (
              <button className="text-stone-400 hover:text-ink" title="Edit name, trade or responsible person" onClick={() => setEditHeader(true)}>
                <Pencil className="size-4" />
              </button>
            )}
            {can("checklists:delete") && (
              <button className="text-stone-400 hover:text-red-600" title="Delete checklist" onClick={async () => (await confirm({ title: "Delete checklist?", danger: true, confirmText: "Delete" })) && api.del(`/checklists/${c.id}`).then(reload).catch(toast.error)}>
                <Trash2 className="size-4" />
              </button>
            )}
          </span>
        )
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <Progress value={items.length ? (done / items.length) * 100 : 0} />
        <span className="text-xs tabular-nums text-muted">{done}/{items.length}</span>
      </div>
      <ul className="space-y-0.5">
        {items.map((it) =>
          editItem && editItem.id === it.id ? (
            <li key={it.id} className="space-y-1.5 rounded-lg border border-brand-200 bg-brand-50/40 p-2">
              <input className="input py-1.5" autoFocus value={editItem.text} onChange={(e) => setEditItem((x) => x && { ...x, text: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveItem()} />
              <input className="input py-1.5 text-xs" placeholder="Remark (optional) – e.g. what was found, what was fixed" value={editItem.remark} onChange={(e) => setEditItem((x) => x && { ...x, remark: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveItem()} />
              <div className="flex justify-end gap-1">
                <Button size="xs" variant="secondary" onClick={() => setEditItem(null)}>Cancel</Button>
                <Button size="xs" onClick={saveItem}>Save</Button>
              </div>
            </li>
          ) : (
            <li key={it.id}>
              <label className="group flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-stone-50">
                <input type="checkbox" className="mt-0.5 size-4 accent-emerald-600" checked={!!it.checked} disabled={!can("checklists:write")} onChange={() => toggle(it)} />
                <span className="flex-1">
                  <span className={cx("text-sm", it.checked && "text-stone-400 line-through")}>{it.text}</span>
                  {it.remark && <span className="block text-xs text-stone-500">{it.remark}</span>}
                  {it.checked && it.checkedBy && <span className="block text-[10px] text-muted">✓ {it.checkedBy.name ?? ""} · {dateTime(it.checkedAt)}</span>}
                </span>
                {can("checklists:write") && (
                  <button type="button" className="text-stone-300 transition hover:text-ink sm:opacity-0 sm:group-hover:opacity-100" title="Edit text / remark" onClick={(e) => (e.preventDefault(), setEditItem({ id: it.id, text: it.text ?? "", remark: it.remark ?? "" }))}>
                    <Pencil className="size-3.5" />
                  </button>
                )}
                {can("checklists:write") && !it.checked && (
                  <button type="button" className="text-stone-300 opacity-0 transition group-hover:opacity-100 hover:text-red-600" title="Remove check" onClick={(e) => (e.preventDefault(), removeItem(it))}>
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </label>
            </li>
          )
        )}
      </ul>
      {can("checklists:write") && (
        <div className="mt-2 flex gap-2">
          <input className="input py-1.5" placeholder="Add a site-specific check…" value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} />
          <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} loading={adding} onClick={addItem}>Add</Button>
        </div>
      )}
      {c.assignedTo && <p className="mt-2 text-xs text-muted">Responsible: {c.assignedTo.name}</p>}
      {editHeader && <ChecklistHeaderModal c={c} onClose={() => setEditHeader(false)} onSaved={reload} />}
    </Card>
  );
}

function TemplateEditor({ open, onClose, record, onSaved }: { open: boolean; onClose: () => void; record?: any; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("");
  const [text, setText] = useState("");
  useEffect(() => {
    if (!open) return;
    setName(record?.name ?? "");
    setTrade(record?.trade ?? "");
    setText((record?.items ?? []).map((i: any) => i.text).join("\n"));
  }, [open, record]);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return; // a double tap would create the template twice
    const items = text.split("\n").map((t) => t.trim()).filter(Boolean).map((t) => ({ text: t }));
    setSaving(true);
    try {
      if (record?.id) await api.patch(`/checklists/${record.id}`, { name, trade, items });
      else await api.post("/checklists", { name, trade, items, isTemplate: true });
      toast.success("Template saved");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={record ? "Edit template" : "New checklist template"} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
      <div className="space-y-3">
        <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div>
          <label className="label">Trade</label>
          <select className="input" value={trade} onChange={(e) => setTrade(e.target.value)}>
            <option value="">General</option>
            {TRADES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div><label className="label">Items (one per line)</label><textarea className="input font-mono text-xs" rows={10} value={text} onChange={(e) => setText(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

export function ChecklistsView({ project }: { project?: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState<"site" | "templates">(project ? "site" : "site");
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const site = useList(view === "site" ? "/checklists" : null, { isTemplate: false, project: project ?? filterProject ?? undefined, limit: 100 });
  const templates = useList("/checklists", { isTemplate: true, limit: 100, sort: "name" });
  const [apply, setApply] = useState(false);
  const [tpl, setTpl] = useState<string>("");
  const [applyProject, setApplyProject] = useState<string | null>(project ?? null);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [editTpl, setEditTpl] = useState<any>(false);
  const [applying, setApplying] = useState(false);
  const doApply = async () => {
    if (!tpl || !applyProject) return toast.error("Select template and site");
    if (applying) return; // a double tap would add the checklist twice
    setApplying(true);
    try {
      await api.post(`/checklists/${tpl}/apply`, { project: applyProject, assignedTo: assignee });
      toast.success("Checklist added to site");
      setApply(false);
      site.mutate();
    } catch (e) {
      toast.error(e);
    } finally {
      setApplying(false);
    }
  };
  return (
    <div>
      {!project && (
        <PageHeader
          title="QC checklists"
          subtitle="Avoid site blunders — standard quality checks per trade, ticked by the supervisor with date & name"
          actions={
            <>
              <Segmented options={[{ value: "site", label: "Site checklists" }, { value: "templates", label: "Templates" }]} value={view} onChange={setView} />
              {view === "site" && <EntitySelect className="w-60" value={filterProject} onChange={setFilterProject} config={REF.project} placeholder="All sites" />}
            </>
          }
        />
      )}
      <div className="mb-3 flex gap-2">
        {view === "site" && can("checklists:write") && <Button size="sm" icon={<ClipboardCheck className="size-4" />} onClick={() => setApply(true)}>Add checklist from template</Button>}
        {view === "templates" && can("checklists:write") && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditTpl(null)}>New template</Button>}
      </div>
      {view === "site" ? (
        site.loading && !site.rows.length ? <Loading /> : site.rows.length === 0 ? <Empty title="No checklists yet" hint="Add a checklist from a template (Carpentry QC, Electrical QC, Handover…)." /> : (
          <div className="grid gap-4 lg:grid-cols-2">
            {site.rows.map((c) => (
              <div key={c.id}>
                {!project && <p className="mb-1 text-xs"><ProjectLink project={c.project} /></p>}
                <ChecklistCard c={c} reload={site.mutate} />
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.rows.map((t) => (
            <Card key={t.id} title={t.name} action={can("checklists:write") && <span className="flex gap-1">{can("checklists:delete") && <Button size="xs" variant="ghost" className="text-red-600" onClick={async () => (await confirm({ title: `Delete template "${t.name}"?`, message: "Site checklists already created from it are not affected.", danger: true, confirmText: "Delete" })) && api.del(`/checklists/${t.id}`).then(() => templates.mutate()).catch(toast.error)}>Delete</Button>}<Button size="xs" variant="ghost" onClick={() => setEditTpl(t)}>Edit</Button><Button size="xs" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => (setTpl(t.id), setView("site"), setApply(true))}>Use</Button></span>}>
              {t.trade && <Badge className="mb-2">{labelOf(TRADES, t.trade)}</Badge>}
              <ul className="list-disc space-y-0.5 pl-4 text-sm text-stone-600">
                {t.items.map((i: any) => <li key={i.id}>{i.text}</li>)}
              </ul>
            </Card>
          ))}
        </div>
      )}
      <Modal open={apply} onClose={() => setApply(false)} title="Add checklist to site" footer={<><Button variant="secondary" onClick={() => setApply(false)}>Cancel</Button><Button loading={applying} onClick={doApply}>Add</Button></>}>
        <div className="space-y-3">
          <div>
            <label className="label">Template</label>
            <select className="input" value={tpl} onChange={(e) => setTpl(e.target.value)}>
              <option value="">Select…</option>
              {templates.rows.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.items.length} items)</option>)}
            </select>
          </div>
          {!project && <div><label className="label">Site</label><EntitySelect value={applyProject} onChange={setApplyProject} config={REF.activeProject} /></div>}
          <div><label className="label">Responsible person</label><EntitySelect value={assignee} onChange={setAssignee} config={REF.user} /></div>
        </div>
      </Modal>
      <TemplateEditor open={editTpl !== false} onClose={() => setEditTpl(false)} record={editTpl || undefined} onSaved={templates.mutate} />
    </div>
  );
}

/* ------------------------- Contractors & work orders --------------------- */
export function ContractorsPage() {
  return (
    <ResourcePage
      title="Contractors"
      subtitle="Carpenters, electricians, plumbers, POP, painters… with rates and site work orders"
      endpoint="/contractors"
      resource="contractors"
      entityName="contractor"
      columns={contractorColumns}
      fields={contractorFields}
      defaults={{ isActive: true }}
      filters={[{ name: "trade", label: "Trade", options: TRADES }]}
      createLabel="Add contractor"
      searchPlaceholder="Name, phone…"
    />
  );
}

export function WorkOrdersView({ project }: { project?: string }) {
  return (
    <ResourcePage
      title={project ? undefined : "Work orders"}
      subtitle="Contractor selection for site work — agreed amount, payments and balance"
      embedded={!!project}
      endpoint="/work-orders"
      resource="workorders"
      entityName="work order"
      columns={project ? workOrderColumns.filter((c) => c.key !== "project") : workOrderColumns}
      fields={project ? workOrderFields.filter((f) => f.name !== "project") : workOrderFields}
      baseParams={project ? { project } : undefined}
      createExtra={project ? { project } : undefined}
      defaults={{ status: "selected" }}
      filters={[{ name: "status", label: "Status", options: WORK_ORDER_STATUS }, { name: "trade", label: "Trade", options: TRADES }, ...(project ? [] : [{ name: "contractor", label: "Contractor", ref: REF.contractor }])]}
      createLabel="Assign contractor"
      invalidates={["/projects"]}
    />
  );
}
