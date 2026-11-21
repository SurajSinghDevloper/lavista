"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { KeyRound, LogOut, MapPin, Monitor, MoreHorizontal, Pencil, Plus, Save, ShieldCheck, Smartphone, Trash2, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth";
import { DataTable, ResourcePage } from "@/components/data-table";
import { REF } from "@/components/domain";
import { FormDrawer } from "@/components/form";
import { Avatar, Badge, Button, Card, Empty, IconButton, KV, LoadError, Loading, Menu, MenuItem, Modal, PageHeader, StatusBadge, Tabs, useConfirm, useToast } from "@/components/ui";
import { invalidate, useList, useOne } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { ATTENDANCE_STATUS, DEPARTMENTS, ROLES, labelOf } from "@/lib/constants";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import { date, dateTime, mapsLink, relative, time, toInputDate } from "@/lib/format";
import { userFields } from "./config";

/* ---------------------------------- Team --------------------------------- */
export function TeamPage() {
  const { can, user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [reset, setReset] = useState<any>(null);
  const [pw, setPw] = useState("");
  const [roles, setRoles] = useState(false);
  const doReset = async () => {
    try {
      await api.post(`/users/${reset.id}/reset-password`, { password: pw });
      toast.success(`Password reset for ${reset.name}. They'll be asked to change it.`);
      setReset(null);
      setPw("");
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <>
      <ResourcePage
        title="Team members"
        subtitle="Office, design, site, factory & accounts staff — role decides what each person can see and do"
        endpoint="/users"
        resource="users"
        entityName="team member"
        canDelete={false}
        columns={[
          { key: "name", label: "Member", render: (r) => <span className="flex items-center gap-2.5"><Avatar name={r.name} /><span><span className="font-medium">{r.name}</span><span className="block text-xs text-muted">{r.designation}</span></span></span> },
          { key: "role", label: "Role", render: (r) => <StatusBadge options={ROLES} value={r.role} /> },
          { key: "department", label: "Department", render: (r) => labelOf(DEPARTMENTS, r.department), hideOnMobile: true },
          { key: "contact", label: "Contact", render: (r) => <span className="text-sm">{r.email}<span className="block text-xs text-muted">{r.phone}</span></span> },
          { key: "lastLoginAt", label: "Last login", render: (r) => (r.lastLoginAt ? relative(r.lastLoginAt) : "Never"), hideOnMobile: true },
          { key: "isActive", label: "", render: (r) => (r.isActive ? null : <Badge color="red">Deactivated</Badge>) },
        ]}
        fields={can("users:write") ? userFields : undefined}
        defaults={{ role: "staff", isActive: true }}
        filters={[{ name: "role", label: "Role", options: ROLES }, { name: "department", label: "Department", options: DEPARTMENTS }]}
        createLabel="Add member"
        headerActions={<Button variant="secondary" icon={<ShieldCheck className="size-4" />} onClick={() => setRoles(true)}>Role permissions</Button>}
        rowMenu={
          can("users:write")
            ? (r, reload) => (
                <>
                  <MenuItem icon={<KeyRound className="size-4" />} onClick={() => setReset(r)}>Reset password</MenuItem>
                  {can("users:delete") && r.isActive && r.id !== user?.id && (
                    <MenuItem
                      danger
                      icon={<UserX className="size-4" />}
                      onClick={async () => {
                        if (!(await confirm({ title: `Deactivate ${r.name}?`, message: "They will be logged out of all devices and can no longer log in. History is kept.", danger: true, confirmText: "Deactivate" }))) return;
                        try {
                          await api.del(`/users/${r.id}`);
                          toast.success("Deactivated");
                          reload();
                        } catch (e) {
                          toast.error(e);
                        }
                      }}
                    >
                      Deactivate
                    </MenuItem>
                  )}
                </>
              )
            : undefined
        }
      />
      <Modal open={!!reset} onClose={() => setReset(null)} title={`Reset password – ${reset?.name}`} footer={<><Button variant="secondary" onClick={() => setReset(null)}>Cancel</Button><Button onClick={doReset}>Reset</Button></>}>
        <label className="label">New temporary password</label>
        <input className="input" type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Min 8 chars, letters + numbers" />
        <p className="mt-2 text-xs text-muted">The member is logged out everywhere and must change this password on next login.</p>
      </Modal>
      <Modal open={roles} onClose={() => setRoles(false)} size="xl" title="What each role can do">
        <div className="grid gap-4 md:grid-cols-2">
          {ROLES.map((r) => {
            const perms = ROLE_PERMISSIONS[r.value];
            const grouped = perms.includes("*")
              ? { Everything: ["full access"] }
              : perms.reduce<Record<string, string[]>>((a, p) => {
                  const [res, act] = p.split(":");
                  (a[res] ??= []).push(act);
                  return a;
                }, {});
            return (
              <div key={r.value} className="rounded-lg border border-line p-3">
                <StatusBadge options={ROLES} value={r.value} />
                <ul className="mt-2 space-y-0.5 text-xs text-stone-600">
                  {Object.entries(grouped).map(([res, acts]) => (
                    <li key={res}><span className="font-medium capitalize text-ink">{res.replace(/_/g, " ")}</span>: {acts.join(", ")}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">Designers, supervisors and office staff only see the sites they are assigned to (manager / designer / supervisor / member).</p>
      </Modal>
    </>
  );
}

/* -------------------------------- Attendance ----------------------------- */
export function AttendancePage() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const all = can("attendance:all");
  const [day, setDay] = useState(toInputDate(new Date()));
  const [mark, setMark] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const { rows, loading, mutate } = useList("/attendance", all ? { date: day, limit: 200 } : { limit: 60, sort: "-date" });
  const { rows: users } = useList(all ? "/users" : null, { isActive: true, limit: 200, sort: "name" });
  const present = new Set(rows.map((r) => r.user?.id));
  const absent = users.filter((u) => !present.has(u.id));
  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle={all ? "Check-in / check-out with GPS location (from web or mobile)" : "My attendance history"}
        actions={
          all && (
            <>
              <input type="date" className="input w-auto" value={day} onChange={(e) => setDay(e.target.value)} />
              <Button icon={<Plus className="size-4" />} onClick={() => setMark(true)}>Mark attendance</Button>
            </>
          )
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <DataTable
            loading={loading}
            rows={rows}
            empty={<Empty title="No attendance records" />}
            onRowClick={all ? (r) => setEditing(r) : undefined}
            rowActions={
              all
                ? (r) => (
                    <Menu trigger={<IconButton label="Actions"><MoreHorizontal className="size-4" /></IconButton>}>
                      <MenuItem icon={<Pencil className="size-4" />} onClick={() => setEditing(r)}>Correct entry</MenuItem>
                      {can("attendance:delete") && (
                        <MenuItem
                          danger
                          icon={<Trash2 className="size-4" />}
                          onClick={async () => {
                            if (!(await confirm({ title: `Delete ${r.user?.name}'s attendance for ${date(r.date)}?`, danger: true, confirmText: "Delete" }))) return;
                            try {
                              await api.del(`/attendance/${r.id}`);
                              mutate();
                            } catch (e) {
                              toast.error(e);
                            }
                          }}
                        >
                          Delete
                        </MenuItem>
                      )}
                    </Menu>
                  )
                : undefined
            }
            columns={[
              ...(all ? [{ key: "user", label: "Member", render: (r: any) => <span className="flex items-center gap-2"><Avatar name={r.user?.name} size="sm" />{r.user?.name}</span> }] : [{ key: "date", label: "Date", render: (r: any) => date(r.date) }]),
              { key: "status", label: "Status", render: (r) => <StatusBadge options={ATTENDANCE_STATUS} value={r.status} /> },
              { key: "checkIn", label: "In", render: (r) => (r.checkIn ? <span>{time(r.checkIn)}{r.checkInLocation && <a className="ml-1 text-brand-700" href={mapsLink(undefined, r.checkInLocation)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><MapPin className="inline size-3" /></a>}</span> : "—") },
              { key: "checkOut", label: "Out", render: (r) => (r.checkOut ? time(r.checkOut) : "—") },
              { key: "hours", label: "Hours", render: (r) => (r.checkIn && r.checkOut ? ((new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 36e5).toFixed(1) : "—"), align: "right" },
              { key: "project", label: "Site", render: (r) => r.project?.name ?? "—", hideOnMobile: true },
              { key: "notes", label: "Notes", render: (r) => <span className="text-xs">{r.notes}</span>, hideOnMobile: true },
            ]}
          />
        </div>
        {all && (
          <Card title={`Not marked (${absent.length})`} padded={false}>
            <ul className="divide-y divide-line">
              {absent.map((u) => (
                <li key={u.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="flex items-center gap-2"><Avatar name={u.name} size="sm" />{u.name}</span>
                  <span className="text-xs text-muted">{labelOf(ROLES, u.role)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      {all && (
        <FormDrawer
          modal
          open={!!editing}
          onClose={() => setEditing(null)}
          title={`Correct attendance – ${editing?.user?.name ?? ""}, ${date(editing?.date)}`}
          endpoint="/attendance"
          record={editing}
          fields={[
            { name: "status", label: "Status", type: "select", options: ATTENDANCE_STATUS, required: true },
            { name: "checkIn", label: "Check-in", type: "datetime" },
            { name: "checkOut", label: "Check-out", type: "datetime" },
            { name: "project", label: "Site", type: "ref", ref: REF.activeProject },
            { name: "notes", label: "Notes", type: "textarea", rows: 2 },
          ]}
          onSaved={() => mutate()}
        />
      )}
      {all && (
        <FormDrawer
          modal
          open={mark}
          onClose={() => setMark(false)}
          title="Mark attendance"
          endpoint="/attendance"
          fields={[
            { name: "user", label: "Member", type: "ref", ref: REF.user, required: true },
            { name: "date", label: "Date", type: "date", required: true },
            { name: "status", label: "Status", type: "select", options: ATTENDANCE_STATUS, required: true },
            { name: "project", label: "Site", type: "ref", ref: REF.activeProject },
            { name: "notes", label: "Notes", type: "textarea", rows: 2 },
          ]}
          defaults={{ date: day, status: "present" }}
          transform={(p) => ({ ...p, date: typeof p.date === "string" ? p.date.slice(0, 10) : toInputDate(p.date) })}
          onSaved={() => mutate()}
        />
      )}
    </div>
  );
}

/* --------------------------------- Profile ------------------------------- */
export function ProfilePage() {
  const { user, reload, logout } = useAuth();
  const toast = useToast();
  const { data: me } = useOne<any>("/auth/me");
  const { data: sessions, mutate: reloadSessions } = useOne<any[]>("/auth/sessions");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [nw2, setNw2] = useState("");
  useEffect(() => {
    if (me) {
      setName(me.name);
      setPhone(me.phone ?? "");
    }
  }, [me]);
  const saveProfile = async () => {
    try {
      await api.patch("/auth/me", { name, phone });
      toast.success("Profile updated");
      reload();
    } catch (e) {
      toast.error(e);
    }
  };
  const changePw = async () => {
    if (nw !== nw2) return toast.error("New passwords do not match");
    try {
      await api.post("/auth/change-password", { currentPassword: cur, newPassword: nw, logoutOtherDevices: true });
      toast.success("Password changed. Other devices were logged out.");
      setCur("");
      setNw("");
      setNw2("");
      reload();
      reloadSessions();
    } catch (e) {
      toast.error(e);
    }
  };
  const revoke = async (id: string) => {
    await api.del(`/auth/sessions/${id}`);
    reloadSessions();
  };
  return (
    <div className="space-y-5">
      <PageHeader title="My profile & security" subtitle={`${user?.email} · ${labelOf(ROLES, user?.role)}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Profile">
          <div className="space-y-3">
            <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label className="label">Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <dl className="grid grid-cols-2 gap-3 pt-2"><KV label="Designation">{me?.designation}</KV><KV label="Department">{labelOf(DEPARTMENTS, me?.department)}</KV></dl>
            <Button icon={<Save className="size-4" />} onClick={saveProfile}>Save</Button>
          </div>
        </Card>
        <Card title="Change password">
          <div className="space-y-3">
            <div><label className="label">Current password</label><input type="password" className="input" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
            <div><label className="label">New password</label><input type="password" className="input" autoComplete="new-password" value={nw} onChange={(e) => setNw(e.target.value)} /></div>
            <div><label className="label">Confirm new password</label><input type="password" className="input" autoComplete="new-password" value={nw2} onChange={(e) => setNw2(e.target.value)} /></div>
            <p className="text-xs text-muted">Minimum 8 characters with letters and numbers.</p>
            <Button icon={<KeyRound className="size-4" />} onClick={changePw}>Change password</Button>
          </div>
        </Card>
      </div>
      <Card title="Where you're logged in" action={<Button size="xs" variant="secondary" icon={<LogOut className="size-3.5" />} onClick={async () => (await api.post("/auth/logout-all"), logout())}>Log out everywhere</Button>} padded={false}>
        {!sessions ? <Loading /> : (
          <ul className="divide-y divide-line">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex items-center gap-3">
                  {s.client === "mobile" ? <Smartphone className="size-5 text-stone-400" /> : <Monitor className="size-5 text-stone-400" />}
                  <span>
                    <span className="block text-sm font-medium">{s.deviceName?.slice(0, 60) || (s.client === "mobile" ? "Mobile app" : "Web browser")} {s.current && <Badge color="green">This device</Badge>}</span>
                    <span className="block text-xs text-muted">{s.ip} · last active {relative(s.lastUsedAt ?? s.createdAt)} · signed in {dateTime(s.createdAt)}</span>
                  </span>
                </span>
                {!s.current && <Button size="xs" variant="ghost" className="text-red-600" icon={<Trash2 className="size-3.5" />} onClick={() => revoke(s.id)}>Log out</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* --------------------------------- Settings ------------------------------ */
export function SettingsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, mutate, isLoading, error } = useOne<any>("/settings");
  const [tab, setTab] = useState<"company" | "documents" | "schedule" | "integrations">("company");
  const [company, setCompany] = useState<any>({});
  const [terms, setTerms] = useState<any>({});
  const [schedule, setSchedule] = useState<any[]>([]);
  const editable = can("settings:write");
  useEffect(() => {
    if (!data) return;
    setCompany(data.company ?? {});
    setTerms({ quotationTerms: data.quotationTerms, invoiceTerms: data.invoiceTerms, poTerms: data.poTerms, defaultGstRate: data.defaultGstRate });
    setSchedule(data.paymentSchedule ?? []);
  }, [data]);
  if (isLoading) return <Loading />;
  if (error && !data) return <LoadError error={error} onRetry={() => mutate()} />;
  const put = async (key: string, value: unknown) => {
    try {
      await api.put(`/settings/${key}`, { value });
      toast.success("Saved");
      mutate();
      invalidate("/settings");
    } catch (e) {
      toast.error(e);
    }
  };
  const c = (k: string) => ({ value: company[k] ?? "", disabled: !editable, onChange: (e: any) => setCompany((x: any) => ({ ...x, [k]: e.target.value })) });
  const b = (k: string) => ({ value: company.bank?.[k] ?? "", disabled: !editable, onChange: (e: any) => setCompany((x: any) => ({ ...x, bank: { ...x.bank, [k]: e.target.value } })) });
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Company profile, document terms, payment schedule & integrations" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "company", label: "Company" }, { value: "documents", label: "Quotation / bill / PO" }, { value: "schedule", label: "Payment schedule" }, { value: "integrations", label: "Website & Meta leads" }]} />
      {tab === "company" && (
        <Card title="Company profile (printed on quotations, bills and POs)">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><label className="label">Company name</label><input className="input" {...c("name")} /></div>
            <div><label className="label">Tagline</label><input className="input" {...c("tagline")} /></div>
            <div><label className="label">Phone</label><input className="input" {...c("phone")} /></div>
            <div className="sm:col-span-2"><label className="label">Address</label><input className="input" {...c("address")} /></div>
            <div><label className="label">City</label><input className="input" {...c("city")} /></div>
            <div><label className="label">State</label><input className="input" {...c("state")} /></div>
            <div><label className="label">Email</label><input className="input" {...c("email")} /></div>
            <div><label className="label">Website</label><input className="input" {...c("website")} /></div>
            <div><label className="label">GSTIN</label><input className="input" {...c("gstin")} /></div>
            <div><label className="label">PAN</label><input className="input" {...c("pan")} /></div>
            <h4 className="col-span-full mt-2 border-b border-line pb-1 text-xs font-semibold uppercase text-stone-500">Bank details</h4>
            <div><label className="label">Account name</label><input className="input" {...b("accountName")} /></div>
            <div><label className="label">Account number</label><input className="input" {...b("accountNo")} /></div>
            <div><label className="label">IFSC</label><input className="input" {...b("ifsc")} /></div>
            <div><label className="label">Bank</label><input className="input" {...b("bankName")} /></div>
            <div><label className="label">UPI ID</label><input className="input" {...b("upi")} /></div>
          </div>
          {editable && <Button className="mt-4" icon={<Save className="size-4" />} onClick={() => put("company", { ...company, logo: company.logo ?? null })}>Save company profile</Button>}
        </Card>
      )}
      {tab === "documents" && (
        <div className="grid gap-5 lg:grid-cols-2">
          {(["quotationTerms", "invoiceTerms", "poTerms"] as const).map((k) => (
            <Card key={k} title={{ quotationTerms: "Default quotation terms", invoiceTerms: "Default bill terms", poTerms: "Default purchase order terms" }[k]}>
              <textarea className="input" rows={8} value={terms[k] ?? ""} disabled={!editable} onChange={(e) => setTerms((t: any) => ({ ...t, [k]: e.target.value }))} />
              {editable && <Button className="mt-3" size="sm" onClick={() => put(k, terms[k] ?? "")}>Save</Button>}
            </Card>
          ))}
          <Card title="Default GST on quotations">
            <select className="input w-40" value={terms.defaultGstRate ?? 18} disabled={!editable} onChange={(e) => setTerms((t: any) => ({ ...t, defaultGstRate: Number(e.target.value) }))}>
              {[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}
            </select>
            {editable && <Button className="mt-3" size="sm" onClick={() => put("defaultGstRate", terms.defaultGstRate ?? 18)}>Save</Button>}
          </Card>
        </div>
      )}
      {tab === "schedule" && (
        <Card title="Default client payment schedule (applied to new sites)">
          <div className="space-y-2">
            {schedule.map((m, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" value={m.name} disabled={!editable} onChange={(e) => setSchedule((l) => l.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                <input type="number" className="input w-24" value={m.percent} disabled={!editable} onChange={(e) => setSchedule((l) => l.map((x, k) => (k === i ? { ...x, percent: Number(e.target.value) } : x)))} />
                {editable && <button className="text-stone-400 hover:text-red-600" onClick={() => setSchedule((l) => l.filter((_, k) => k !== i))}><Trash2 className="size-4" /></button>}
              </div>
            ))}
            <p className="text-xs text-muted">Total: {schedule.reduce((s, m) => s + (Number(m.percent) || 0), 0)}% (must be 100%)</p>
            {editable && (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setSchedule((l) => [...l, { name: "", percent: 0 }])}>Add</Button>
                <Button size="sm" onClick={() => put("paymentSchedule", schedule)}>Save</Button>
              </div>
            )}
          </div>
        </Card>
      )}
      {tab === "integrations" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Website enquiry form → Leads">
            <p className="text-sm text-stone-600">Point your website contact form (or Zapier / WordPress plugin) to this endpoint. New enquiries appear in Leads instantly and duplicates by phone are merged.</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-stone-900 p-3 text-xs text-stone-100">{`POST ${origin}/api/v1/integrations/leads
x-api-key: <LEAD_WEBHOOK_KEY from server .env>
Content-Type: application/json

{ "name": "Rahul", "phone": "9876543210",
  "email": "r@x.com", "city": "Kolkata",
  "message": "3BHK full interior",
  "utm_source": "google", "utm_campaign": "diwali" }`}</pre>
          </Card>
          <Card title="Meta (Facebook / Instagram) Lead Ads → Leads">
            <ol className="list-decimal space-y-1 pl-4 text-sm text-stone-600">
              <li>In Meta for Developers, add a <em>Webhooks</em> product and subscribe the Page to <code>leadgen</code>.</li>
              <li>Callback URL: <code className="break-all">{origin}/api/v1/integrations/meta</code></li>
              <li>Verify token: value of <code>META_VERIFY_TOKEN</code> in the server <code>.env</code>.</li>
              <li>Set <code>META_APP_SECRET</code> (signature check) and <code>META_PAGE_ACCESS_TOKEN</code> (to fetch lead details).</li>
            </ol>
            <p className="mt-3 text-xs text-muted">Each form submission becomes a lead with source “Meta Ads”, assigned for follow-up.</p>
          </Card>
          <Card title="Mobile app API">
            <p className="text-sm text-stone-600">The mobile app uses the same REST API (<code>/api/v1</code>). Send header <code>X-Client-Type: mobile</code> on login/refresh to receive tokens in the response body, then call the API with <code>Authorization: Bearer &lt;accessToken&gt;</code>. See <code>docs/API.md</code>.</p>
          </Card>
          <Card title="Maps">
            <p className="text-sm text-stone-600">Site addresses and GPS captured during site visits / attendance open directly in Google Maps — no API key needed.</p>
          </Card>
        </div>
      )}
    </div>
  );
}
