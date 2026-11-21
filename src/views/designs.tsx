"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { CheckCircle2, ExternalLink, MessageSquareWarning, Plus, Send, Star, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth";
import { Attachments, FileGrid, ProjectLink, REF } from "@/components/domain";
import { EntitySelect, FormGrid, errorsFrom, toPayload, useFormState, type Field } from "@/components/form";
import { Badge, Button, Card, Drawer, Empty, Loading, Modal, PageHeader, StatusBadge, Tabs, cx, useConfirm, useToast } from "@/components/ui";
import { invalidate, useList } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { DESIGN_STATUS, DESIGN_TOOLS, DESIGN_TYPES, ROOMS, labelOf } from "@/lib/constants";
import { relative } from "@/lib/format";

const designFields: Field[] = [
  { name: "type", label: "Design type", type: "select", options: DESIGN_TYPES, required: true },
  { name: "room", label: "Room / area", type: "select", options: ROOMS },
  { name: "title", label: "Title", required: true, placeholder: "e.g. Living room renders" },
  { name: "tool", label: "Made in", type: "select", options: DESIGN_TOOLS },
  { name: "status", label: "Status", type: "select", options: DESIGN_STATUS.filter((s) => !["approved", "superseded"].includes(s.value)) },
  { name: "externalLink", label: "Link (Enscape panorama / Drive / Dropbox)", type: "url" },
  { name: "description", label: "What's in this version", type: "textarea", rows: 2 },
  { name: "clientFeedback", label: "Client feedback", type: "textarea", rows: 2 },
  { name: "internalNotes", label: "Internal notes", type: "textarea", rows: 2 },
];

function DesignDrawer({ open, onClose, record, project, preset, onSaved }: { open: boolean; onClose: () => void; record?: any; project?: string; preset?: any; onSaved?: () => void }) {
  const toast = useToast();
  const f = useFormState({});
  const [files, setFiles] = useState<any[]>([]);
  const [proj, setProj] = useState<string | null>(project ?? null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    f.setValues(record ? { ...record } : { status: "draft", room: "full_home", ...preset });
    setFiles(record?.files ?? []);
    setProj(project ?? record?.project?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record]);
  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...toPayload(designFields, f.values), files: files.map((x: any) => x.id ?? x) };
      if (record?.id) await api.patch(`/designs/${record.id}`, payload);
      else await api.post("/designs", { ...payload, project: proj });
      toast.success(record ? "Design updated" : "New version uploaded");
      invalidate("/designs");
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
    <Drawer
      open={open}
      onClose={onClose}
      title={record ? `Edit ${record.title} v${record.version}` : "Upload design version"}
      subtitle={!record && "Version number is assigned automatically per site + type + room"}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}
    >
      <div className="space-y-4">
        {!project && !record && (
          <div>
            <label className="label">Site *</label>
            <EntitySelect value={proj} onChange={setProj} config={REF.project} />
          </div>
        )}
        <FormGrid fields={designFields} values={f.values} setValue={f.setValue} errors={f.errors} />
        <div>
          <label className="label">Files (PDF, JPG/PNG renders, DWG, SKP…)</label>
          <Attachments files={files} onChange={(ids) => setFiles((prev) => ids.map((id) => prev.find((p: any) => (p.id ?? p) === id) ?? id))} meta={{ category: f.values.type === "render" ? "render" : "design", project: proj ?? undefined, entityType: "Design" }} />
        </div>
      </div>
    </Drawer>
  );
}

function VersionCard({ d, onEdit, reload }: { d: any; onEdit: () => void; reload: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [fb, setFb] = useState<null | "changes" | "approve">(null);
  const [text, setText] = useState("");
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      reload();
      invalidate("/projects");
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <div className={cx("rounded-lg border p-3", d.isFinal ? "border-emerald-300 bg-emerald-50/40" : "border-line bg-white", d.status === "superseded" && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-ink px-1.5 py-0.5 text-[11px] font-bold text-white">v{d.version}</span>
            {d.isFinal && <Badge color="green"><Star className="size-3 fill-current" /> Final</Badge>}
            <StatusBadge options={DESIGN_STATUS} value={d.status} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {labelOf(DESIGN_TOOLS, d.tool)} · {d.createdBy?.name} · {relative(d.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {d.externalLink && <Button size="xs" variant="secondary" href={d.externalLink} icon={<ExternalLink className="size-3.5" />}>Open link</Button>}
          {can("designs:write") && d.status === "draft" && (
            <Button size="xs" variant="secondary" icon={<Send className="size-3.5" />} onClick={() => act(() => api.patch(`/designs/${d.id}`, { status: "shared" }), "Marked as shared with client")}>
              Shared
            </Button>
          )}
          {can("designs:write") && !d.isFinal && d.status !== "superseded" && (
            <Button size="xs" variant="secondary" icon={<MessageSquareWarning className="size-3.5" />} onClick={() => (setText(d.clientFeedback ?? ""), setFb("changes"))}>
              Changes
            </Button>
          )}
          {can("designs:approve") && !d.isFinal && (
            <Button size="xs" variant="success" icon={<CheckCircle2 className="size-3.5" />} onClick={() => (setText(d.clientFeedback ?? ""), setFb("approve"))}>
              Mark final
            </Button>
          )}
          {can("designs:write") && <Button size="xs" variant="ghost" onClick={onEdit}>Edit</Button>}
          {can("designs:delete") && (
            <button
              className="rounded p-1 text-stone-400 hover:text-red-600"
              title="Delete"
              onClick={async () => (await confirm({ title: `Delete v${d.version}?`, danger: true, confirmText: "Delete" })) && act(() => api.del(`/designs/${d.id}`), "Deleted")}
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>
      {d.description && <p className="mt-2 text-sm">{d.description}</p>}
      {d.clientFeedback && <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-sm text-amber-900">Client: {d.clientFeedback}</p>}
      {d.files?.length > 0 && (
        <div className="mt-3">
          <FileGrid files={d.files} />
        </div>
      )}
      <Modal
        open={!!fb}
        onClose={() => setFb(null)}
        title={fb === "approve" ? `Finalise v${d.version}` : "Client requested changes"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFb(null)}>Cancel</Button>
            <Button
              variant={fb === "approve" ? "success" : "primary"}
              onClick={() => {
                const fn = fb === "approve" ? () => api.post(`/designs/${d.id}/approve`, { clientFeedback: text }) : () => api.patch(`/designs/${d.id}`, { status: "changes_requested", clientFeedback: text });
                act(fn, fb === "approve" ? "Design finalised" : "Feedback saved");
                setFb(null);
              }}
            >
              {fb === "approve" ? "Mark as final" : "Save feedback"}
            </Button>
          </>
        }
      >
        {fb === "approve" && <p className="mb-3 text-sm text-muted">Older versions for this room become superseded. The site will move to the next design stage automatically if applicable.</p>}
        <label className="label">Client feedback / remarks</label>
        <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      </Modal>
    </div>
  );
}

export function DesignsPanel({ project }: { project?: string }) {
  const { can } = useAuth();
  const [type, setType] = useState<string>("all");
  const [drawer, setDrawer] = useState<{ record?: any; preset?: any } | null>(null);
  const { rows, mutate, loading } = useList("/designs", { project, type: type === "all" ? undefined : type, limit: 200, sort: "-version" });
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const d of rows) {
      const k = `${d.project?.id}|${d.type}|${d.room}`;
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return [...m.values()].map((v) => v.sort((a, b) => b.version - a.version));
  }, [rows]);
  const counts = useMemo(() => Object.fromEntries(DESIGN_TYPES.map((t) => [t.value, rows.filter((r) => r.type === t.value).length])), [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          value={type}
          onChange={setType}
          tabs={[{ value: "all", label: "All" }, ...DESIGN_TYPES.filter((t) => t.value !== "other").map((t) => ({ value: t.value, label: t.label.replace(/\s*\(.*\)/, ""), count: type === "all" ? counts[t.value] || undefined : undefined }))]}
        />
        {can("designs:write") && (
          <Button icon={<Upload className="size-4" />} onClick={() => setDrawer({ preset: type !== "all" ? { type } : {} })}>
            Upload design
          </Button>
        )}
      </div>
      {loading && rows.length === 0 ? (
        <Loading />
      ) : groups.length === 0 ? (
        <Empty title="No designs yet" hint="Upload 2D layouts (AutoCAD), 3D models (SketchUp), Enscape renders and elevations. Each upload becomes a new version." />
      ) : (
        groups.map((versions) => {
          const head = versions[0];
          const final = versions.find((v) => v.isFinal);
          return (
            <Card
              key={`${head.project?.id}${head.type}${head.room}`}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <span>{head.title}</span>
                  <Badge color="brand">{labelOf(DESIGN_TYPES, head.type)}</Badge>
                  <Badge>{labelOf(ROOMS, head.room)}</Badge>
                  <span className="text-xs font-normal text-muted">{versions.length} version{versions.length > 1 ? "s" : ""}{final ? ` · final v${final.version}` : ""}</span>
                  {!project && <ProjectLink project={head.project} />}
                </span>
              }
              action={
                can("designs:write") && (
                  <Button size="xs" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setDrawer({ preset: { type: head.type, room: head.room, title: head.title, tool: head.tool, project: head.project?.id }, record: undefined })}>
                    New version
                  </Button>
                )
              }
            >
              <div className="space-y-2">
                {versions.map((d) => (
                  <VersionCard key={d.id} d={d} reload={mutate} onEdit={() => setDrawer({ record: d })} />
                ))}
              </div>
            </Card>
          );
        })
      )}
      <DesignDrawer open={!!drawer} onClose={() => setDrawer(null)} record={drawer?.record} preset={drawer?.preset} project={project ?? drawer?.preset?.project} onSaved={mutate} />
    </div>
  );
}

export function DesignsPage() {
  const [project, setProject] = useState<string | null>(null);
  return (
    <div>
      <PageHeader
        title="Designs & renders"
        subtitle="2D layouts, 3D models, Enscape renders & elevations — versioned per room, with client feedback and final selection"
        actions={<EntitySelect className="w-72" value={project} onChange={setProject} config={REF.project} placeholder="All sites" />}
      />
      <DesignsPanel key={project ?? "all"} project={project ?? undefined} />
    </div>
  );
}
