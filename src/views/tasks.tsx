"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { CalendarDays, Check, MessageSquare, Plus, Repeat, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth";
import { DataTable, FilterBar, Pagination, SearchBox } from "@/components/data-table";
import { Attachments, Person, ProjectLink, REF } from "@/components/domain";
import { EntitySelect, FormGrid, errorsFrom, toFormValues, toPayload, useFormState, type Field } from "@/components/form";
import { Avatar, Button, Card, Drawer, Empty, Loading, PageHeader, Segmented, StatusBadge, cx, useConfirm, useToast } from "@/components/ui";
import { invalidate, useList, useOne } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { RECURRENCE, ROLES, TASK_CATEGORIES, TASK_PRIORITY, TASK_STATUS, labelOf } from "@/lib/constants";
import { date, isOverdue, isToday, relative, toInputDate } from "@/lib/format";

const taskFields: Field[] = [
  { name: "title", label: "Task", required: true, span: 2 },
  { name: "description", label: "Details / instructions", type: "textarea", rows: 3 },
  { name: "project", label: "Site", type: "ref", ref: REF.activeProject },
  { name: "category", label: "Category", type: "select", options: TASK_CATEGORIES },
  { name: "assignedTo", label: "Assign to (team member)", type: "ref", ref: REF.user },
  { name: "contractor", label: "Contractor doing the work", type: "ref", ref: REF.contractor, hidden: (v) => v.category && v.category !== "site" },
  { name: "startDate", label: "Start", type: "date" },
  { name: "dueDate", label: "Due", type: "date" },
  { name: "priority", label: "Priority", type: "select", options: TASK_PRIORITY },
  { name: "status", label: "Status", type: "select", options: TASK_STATUS },
  { name: "recurrence", label: "Repeat", type: "select", options: RECURRENCE, help: "Daily/weekly tasks re-create themselves when done, until the site is closed" },
];

/* --------------------------------- Drawer -------------------------------- */
export function TaskDrawer({ id, open, onClose, defaults, onSaved }: { id?: string | null; open: boolean; onClose: () => void; defaults?: Record<string, any>; onSaved?: () => void }) {
  const { user, can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: task, mutate } = useOne<any>(open && id ? `/tasks/${id}` : null);
  const f = useFormState({});
  const [checklist, setChecklist] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [newItem, setNewItem] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const isNew = !id;
  const manager = isNew || can("tasks:all") || task?.assignedBy?.id === user?.id;

  useEffect(() => {
    if (!open) return;
    if (isNew) {
      f.setValues({ priority: "medium", status: "todo", category: "site", recurrence: "none", dueDate: toInputDate(new Date()), ...defaults });
      setChecklist([]);
      setFiles([]);
    } else if (task) {
      f.setValues(toFormValues(taskFields, task));
      setChecklist(task.checklist ?? []);
      setFiles(task.files ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task, isNew]);

  const save = async (extra: Record<string, any> = {}) => {
    setSaving(true);
    try {
      const base = manager ? toPayload(taskFields, f.values) : { status: f.values.status };
      const payload = { ...base, checklist: checklist.map((c) => ({ _id: c.id ?? c._id, text: c.text, done: !!c.done })), files: files.map((x: any) => x.id ?? x), ...extra };
      if (isNew) await api.post("/tasks", payload);
      else await api.patch(`/tasks/${id}`, payload);
      toast.success(isNew ? "Task created" : "Task updated");
      invalidate("/tasks", "/dashboard");
      onSaved?.();
      if (isNew) onClose();
      else mutate();
    } catch (e) {
      f.setErrors(errorsFrom(e));
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const quickStatus = async (status: string) => {
    f.setValue("status", status);
    await save({ status });
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    try {
      await api.post(`/tasks/${id}/comments`, { text: comment });
      setComment("");
      mutate();
    } catch (e) {
      toast.error(e);
    }
  };

  const del = async () => {
    if (!(await confirm({ title: "Delete task?", danger: true, confirmText: "Delete" }))) return;
    try {
      await api.del(`/tasks/${id}`);
      invalidate("/tasks");
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      title={isNew ? "New task" : task?.title ?? "Task"}
      subtitle={!isNew && task && <span>{task.taskNo} · assigned by {task.assignedBy?.name} · {relative(task.createdAt)}</span>}
      footer={
        <>
          {!isNew && manager && <Button variant="ghost" className="mr-auto text-red-600" icon={<Trash2 className="size-4" />} onClick={del}>Delete</Button>}
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button loading={saving} onClick={() => save()}>{isNew ? "Create task" : "Save"}</Button>
        </>
      }
    >
      {!isNew && !task ? (
        <Loading />
      ) : (
        <div className="space-y-5">
          {!isNew && (
            <div className="flex flex-wrap gap-1.5">
              {TASK_STATUS.map((s) => (
                <button key={s.value} onClick={() => quickStatus(s.value)} className={cx("rounded-full border px-3 py-1 text-xs font-medium transition", f.values.status === s.value ? "border-ink bg-ink text-white" : "border-line hover:border-stone-300")}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {manager ? (
            <FormGrid fields={isNew ? taskFields : taskFields.filter((x) => x.name !== "status")} values={f.values} setValue={f.setValue} errors={f.errors} />
          ) : (
            <div className="space-y-2 text-sm">
              {task?.description && <p className="whitespace-pre-line">{task.description}</p>}
              <p className="text-muted">
                {task?.project && <>Site: <ProjectLink project={task.project} /> · </>}Due {date(task?.dueDate)} · <StatusBadge options={TASK_PRIORITY} value={task?.priority} />
              </p>
            </div>
          )}

          <div>
            <h4 className="mb-2 text-sm font-semibold">Checklist</h4>
            <ul className="space-y-1">
              {checklist.map((c, i) => (
                <li key={c._id ?? c.id ?? i} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-50">
                  <input type="checkbox" className="size-4 accent-brand-600" checked={!!c.done} onChange={(e) => setChecklist((l) => l.map((x, k) => (k === i ? { ...x, done: e.target.checked } : x)))} />
                  <span className={cx("flex-1 text-sm", c.done && "text-stone-400 line-through")}>{c.text}</span>
                  {c.doneBy?.name && <span className="text-[10px] text-muted">{c.doneBy.name}</span>}
                  {manager && <button className="text-stone-300 hover:text-red-600" onClick={() => setChecklist((l) => l.filter((_, k) => k !== i))}><Trash2 className="size-3.5" /></button>}
                </li>
              ))}
            </ul>
            {manager && (
              <div className="mt-2 flex gap-2">
                <input className="input" placeholder="Add checklist item…" value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && newItem.trim() && (setChecklist((l) => [...l, { text: newItem.trim(), done: false }]), setNewItem(""))} />
                <Button variant="secondary" onClick={() => newItem.trim() && (setChecklist((l) => [...l, { text: newItem.trim(), done: false }]), setNewItem(""))}>Add</Button>
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold">Photos / proof of work</h4>
            <Attachments files={files} onChange={(ids) => setFiles((prev) => ids.map((x) => prev.find((p: any) => (p.id ?? p) === x) ?? x))} meta={{ category: "progress", project: f.values.project?.id ?? f.values.project, entityType: "Task", entityId: id ?? undefined }} />
          </div>

          {!isNew && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><MessageSquare className="size-4" /> Comments</h4>
              <ul className="space-y-3">
                {(task?.comments ?? []).map((c: any) => (
                  <li key={c._id ?? c.id} className="flex gap-2">
                    <Avatar name={c.by?.name} size="sm" />
                    <div className="flex-1 rounded-lg bg-stone-50 px-3 py-2">
                      <p className="text-xs"><span className="font-semibold">{c.by?.name}</span> <span className="text-muted">{relative(c.at)}</span></p>
                      <p className="whitespace-pre-line text-sm">{c.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <input className="input" placeholder="Write an update…" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()} />
                <Button icon={<Send className="size-4" />} onClick={addComment}>Send</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

/* --------------------------------- Columns ------------------------------- */
const columns = [
  {
    key: "title",
    label: "Task",
    render: (r: any) => (
      <span className="flex items-start gap-2">
        <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", r.status === "done" ? "bg-emerald-500" : r.status === "blocked" ? "bg-red-500" : r.status === "in_progress" ? "bg-blue-500" : "bg-stone-300")} />
        <span>
          <span className={cx("font-medium", r.status === "done" && "text-stone-400 line-through")}>{r.title}</span>
          <span className="flex items-center gap-1 text-xs text-muted">
            {r.taskNo} · {labelOf(TASK_CATEGORIES, r.category)}
            {r.recurrence !== "none" && r.recurrence && <Repeat className="size-3" />}
            {r.checklist?.length ? ` · ✓ ${r.checklist.filter((c: any) => c.done).length}/${r.checklist.length}` : ""}
          </span>
        </span>
      </span>
    ),
  },
  { key: "project", label: "Site", render: (r: any) => <ProjectLink project={r.project} /> },
  { key: "assignedTo", label: "Assignee", render: (r: any) => <Person user={r.assignedTo} sub={r.contractor?.name} /> },
  { key: "dueDate", label: "Due", render: (r: any) => <span className={cx(r.status !== "done" && isOverdue(r.dueDate) && "font-medium text-red-600", isToday(r.dueDate) && "font-medium text-amber-700")}>{r.dueDate ? date(r.dueDate) : "—"}</span> },
  { key: "priority", label: "Priority", render: (r: any) => <StatusBadge options={TASK_PRIORITY} value={r.priority} />, hideOnMobile: true },
  { key: "status", label: "Status", render: (r: any) => <StatusBadge options={TASK_STATUS} value={r.status} /> },
];

function Board({ params, onOpen }: { params: any; onOpen: (id: string) => void }) {
  const toast = useToast();
  const { rows, mutate } = useList("/tasks", { ...params, limit: 200, status: undefined });
  const [drag, setDrag] = useState<string | null>(null);
  const cols = TASK_STATUS.filter((s) => s.value !== "cancelled");
  const move = async (id: string, status: string) => {
    try {
      await api.patch(`/tasks/${id}`, { status });
      mutate();
      invalidate("/dashboard");
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {cols.map((c) => {
        const items = rows.filter((r) => r.status === c.value);
        return (
          <div key={c.value} className="flex w-72 shrink-0 flex-col rounded-xl bg-stone-100/80 p-2" onDragOver={(e) => e.preventDefault()} onDrop={() => drag && move(drag, c.value)}>
            <div className="mb-2 flex items-center justify-between px-1">
              <StatusBadge options={TASK_STATUS} value={c.value} />
              <span className="text-xs text-muted">{items.length}</span>
            </div>
            <div className="flex min-h-24 flex-col gap-2">
              {items.map((t) => (
                <button key={t.id} draggable onDragStart={() => setDrag(t.id)} onDragEnd={() => setDrag(null)} onClick={() => onOpen(t.id)} className="rounded-lg border border-line bg-white p-3 text-left shadow-xs hover:border-brand-300">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{t.title}</p>
                    <StatusBadge options={TASK_PRIORITY} value={t.priority} />
                  </div>
                  {t.project && <p className="mt-0.5 truncate text-xs text-muted">{t.project.name}</p>}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs">
                      <Avatar name={t.assignedTo?.name} size="sm" />
                      {t.assignedTo?.name?.split(" ")[0]}
                    </span>
                    {t.dueDate && <span className={cx("text-xs", t.status !== "done" && isOverdue(t.dueDate) ? "text-red-600" : "text-muted")}>{date(t.dueDate)}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Workload({ onPick }: { onPick: (userId: string) => void }) {
  const { data, isLoading } = useOne<any[]>("/tasks/workload");
  if (isLoading) return <Loading />;
  if (!data?.length) return <Empty title="No assigned tasks" />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {data.map((w) => (
        <button key={w.user.id} onClick={() => onPick(w.user.id)} className="card p-4 text-left hover:border-brand-300">
          <div className="flex items-center gap-3">
            <Avatar name={w.user.name} />
            <div>
              <p className="font-medium">{w.user.name}</p>
              <p className="text-xs text-muted">{labelOf(ROLES, w.user.role)}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            <div><p className="text-lg font-semibold">{w.open}</p><p className="text-[10px] text-muted">Open</p></div>
            <div><p className="text-lg font-semibold text-amber-700">{w.dueToday}</p><p className="text-[10px] text-muted">Due today</p></div>
            <div><p className={cx("text-lg font-semibold", w.overdue && "text-red-600")}>{w.overdue}</p><p className="text-[10px] text-muted">Overdue</p></div>
            <div><p className="text-lg font-semibold text-emerald-700">{w.doneToday}</p><p className="text-[10px] text-muted">Done today</p></div>
          </div>
        </button>
      ))}
    </div>
  );
}

/** "Daily allotment" – distribute many tasks to the team in one go. */
function Allotment({ onDone, project }: { onDone: () => void; project?: string }) {
  const toast = useToast();
  const blank = () => ({ title: "", assignedTo: null, project: project ?? null, dueDate: toInputDate(new Date()), priority: "medium", category: "site" });
  const [rows, setRows] = useState<any[]>([blank(), blank(), blank()]);
  const [saving, setSaving] = useState(false);
  const set = (i: number, p: any) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const submit = async () => {
    const tasks = rows.filter((r) => r.title.trim()).map((r) => ({ ...r, dueDate: r.dueDate || null }));
    if (!tasks.length) return toast.error("Enter at least one task");
    setSaving(true);
    try {
      const r: any = await api.post("/tasks/bulk", { tasks });
      toast.success(`${r.created} task(s) allotted`);
      setRows([blank(), blank(), blank()]);
      invalidate("/tasks");
      onDone();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card title="Daily task allotment" action={<span className="text-xs text-muted">Assign many tasks to the team at once</span>}>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-line p-2 md:grid-cols-12">
            <input className="input md:col-span-4" placeholder={`Task ${i + 1}`} value={r.title} onChange={(e) => set(i, { title: e.target.value })} />
            <EntitySelect className="md:col-span-2" value={r.assignedTo} onChange={(id) => set(i, { assignedTo: id })} config={REF.user} placeholder="Assignee" />
            {!project && <EntitySelect className="md:col-span-3" value={r.project} onChange={(id) => set(i, { project: id })} config={REF.activeProject} placeholder="Site (optional)" />}
            <input type="date" className={cx("input", project ? "md:col-span-3" : "md:col-span-2")} value={r.dueDate} onChange={(e) => set(i, { dueDate: e.target.value })} />
            <select className={cx("input", project ? "md:col-span-3" : "md:col-span-1")} value={r.priority} onChange={(e) => set(i, { priority: e.target.value })}>
              {TASK_PRIORITY.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        ))}
        <div className="flex justify-between pt-1">
          <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setRows((r) => [...r, blank()])}>Add row</Button>
          <Button loading={saving} icon={<Check className="size-4" />} onClick={submit}>Allot tasks</Button>
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------- Page --------------------------------- */
type View = "mine" | "assigned" | "team" | "board" | "workload" | "allot";

export function TasksView({ project, embedded }: { project?: string; embedded?: boolean }) {
  const { user, can } = useAuth();
  const [view, setView] = useState<View>(project ? "team" : "mine");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, any>>({ status: "todo,in_progress,review,blocked" });
  const [due, setDue] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("open")) setOpenId(sp.get("open"));
    if (sp.get("view") === "team" && can("tasks:all")) setView("team");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = new Date();
  const dueParams =
    due === "today"
      ? { from: toInputDate(today), to: toInputDate(today) }
      : due === "overdue"
        ? { to: toInputDate(new Date(today.getTime() - 86400000)) }
        : due === "week"
          ? { from: toInputDate(today), to: toInputDate(new Date(today.getTime() + 6 * 86400000)) }
          : {};
  const scope = view === "mine" ? { assignedTo: user?.id } : view === "assigned" ? { assignedBy: user?.id } : {};
  const params = { q, page, project, ...scope, ...filters, ...dueParams };
  const listing = ["mine", "assigned", "team"].includes(view);
  // wait for the user id so "My tasks" never briefly lists everyone's tasks
  const { rows, meta, loading, mutate } = useList(listing && user ? "/tasks" : null, params);

  const views = [
    ...(project ? [] : [{ value: "mine" as View, label: "My tasks" }, { value: "assigned" as View, label: "Assigned by me" }]),
    ...(can("tasks:all") || project ? [{ value: "team" as View, label: project ? "List" : "All team" }] : []),
    { value: "board" as View, label: "Board" },
    ...(can("tasks:all") && !project ? [{ value: "workload" as View, label: "Workload" }] : []),
    ...(can("tasks:write") ? [{ value: "allot" as View, label: "Daily allotment" }] : []),
  ];

  return (
    <div>
      {!embedded && (
        <PageHeader
          title="Tasks"
          subtitle="Daily task creation & allotment for office and site — repeats daily until the site closes"
          actions={can("tasks:write") && <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New task</Button>}
        />
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented options={views} value={view} onChange={setView} />
        {embedded && can("tasks:write") && <Button size="sm" className="ml-auto" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New task</Button>}
      </div>
      {listing && (
        <div className="card">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Search tasks…" />
            <select className="input w-auto" value={filters.status ?? ""} onChange={(e) => (setFilters((f) => ({ ...f, status: e.target.value })), setPage(1))}>
              <option value="todo,in_progress,review,blocked">Open</option>
              <option value="">All statuses</option>
              {TASK_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select className="input w-auto" value={due} onChange={(e) => (setDue(e.target.value), setPage(1))}>
              <option value="">Any due date</option>
              <option value="today">Due today</option>
              <option value="overdue">Overdue</option>
              <option value="week">Next 7 days</option>
            </select>
            <FilterBar
              filters={[
                { name: "priority", label: "Priority", options: TASK_PRIORITY },
                { name: "category", label: "Category", options: TASK_CATEGORIES },
                ...(view === "team" ? [{ name: "assignedTo", label: "Assignee", ref: REF.user }] : []),
                ...(!project ? [{ name: "project", label: "Site", ref: REF.project }] : []),
              ]}
              values={filters}
              onChange={(k, v) => (setFilters((f) => ({ ...f, [k]: v })), setPage(1))}
            />
          </div>
          <DataTable columns={project ? columns.filter((c) => c.key !== "project") : columns} rows={rows} loading={loading} onRowClick={(r) => setOpenId(r.id)} empty={<Empty icon={<CalendarDays className="size-5" />} title="No tasks here" />} />
          {meta && <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />}
        </div>
      )}
      {view === "board" && <Board params={{ q, project, ...(can("tasks:all") || project ? {} : { assignedTo: user?.id }), ...dueParams }} onOpen={setOpenId} />}
      {view === "workload" && <Workload onPick={(id) => (setView("team"), setFilters((f) => ({ ...f, assignedTo: id })))} />}
      {view === "allot" && <Allotment project={project} onDone={() => setView(project ? "team" : "assigned")} />}

      <TaskDrawer open={!!openId} id={openId} onClose={() => (setOpenId(null), new URLSearchParams(window.location.search).has("open") && window.history.replaceState(null, "", window.location.pathname))} onSaved={() => mutate()} />
      <TaskDrawer open={creating} id={null} onClose={() => setCreating(false)} defaults={project ? { project } : undefined} onSaved={() => mutate()} />
    </div>
  );
}

export function TasksPage() {
  return <TasksView />;
}

