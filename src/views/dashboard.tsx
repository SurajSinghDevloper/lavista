"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { AlertTriangle, Building2, CheckCircle2, ClipboardList, IndianRupee, MapPin, MessageCircle, PhoneCall, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth";
import { Card, Empty, LoadError, Loading, PageHeader, Progress, StatCard, StatusBadge, cx } from "@/components/ui";
import { useOne } from "@/hooks/use-api";
import { FOLLOWUP_TYPES, LEAD_STATUS, PROJECT_STAGES, TASK_PRIORITY, labelOf } from "@/lib/constants";
import { date, dateTime, isOverdue, isToday, money, moneyShort, relative, telLink, waLink } from "@/lib/format";

function CashflowChart({ data }: { data: { month: string; received: number; spent: number }[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.received, d.spent]));
  return (
    <div>
      <div className="flex h-44 items-end gap-3">
        {data.map((d) => (
          <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-36 w-full items-end justify-center gap-1">
              <div className="w-1/3 max-w-5 rounded-t bg-emerald-500/85" style={{ height: `${(d.received / max) * 100}%` }} title={`Received ${money(d.received)}`} />
              <div className="w-1/3 max-w-5 rounded-t bg-rose-400/80" style={{ height: `${(d.spent / max) * 100}%` }} title={`Spent ${money(d.spent)}`} />
            </div>
            <span className="text-[10px] text-muted">{new Date(d.month + "-01").toLocaleString("en-IN", { month: "short" })}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-500" /> Received</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-rose-400" /> Spent</span>
      </div>
    </div>
  );
}

function Pipeline({ counts }: { counts: Record<string, number> }) {
  const stages = LEAD_STATUS.filter((s) => !["lost", "on_hold"].includes(s.value));
  const max = Math.max(1, ...stages.map((s) => counts[s.value] ?? 0));
  return (
    <div className="space-y-2">
      {stages.map((s) => (
        <Link key={s.value} href={`/leads?status=${s.value}`} className="flex items-center gap-3 text-sm hover:opacity-80">
          <span className="w-40 shrink-0 truncate text-stone-600">{s.label}</span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-stone-100">
            <div className="h-full rounded bg-brand-400/80" style={{ width: `${((counts[s.value] ?? 0) / max) * 100}%` }} />
          </div>
          <span className="w-8 text-right font-semibold tabular-nums">{counts[s.value] ?? 0}</span>
        </Link>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading, error, mutate } = useOne<any>("/dashboard", { refreshInterval: 120_000 });
  if (!data) return error && !isLoading ? <LoadError error={error} onRetry={() => mutate()} /> : <Loading />;
  const { myWork, sales, sites, money: m, store, team, attendance, activity } = data;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      <PageHeader title={`${greet}, ${user?.name?.split(" ")[0] ?? ""}`} subtitle={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="My tasks due today" value={myWork.dueToday} hint={myWork.overdue ? `${myWork.overdue} overdue` : "None overdue"} tone={myWork.overdue ? "bad" : "default"} icon={<ClipboardList className="size-5" />} href="/tasks" />
        {sales && <StatCard label="Open leads" value={sales.open} hint={`${sales.newThisMonth} new this month`} icon={<PhoneCall className="size-5" />} href="/leads" />}
        {sales && <StatCard label="Conversion rate" value={`${sales.conversionRate}%`} hint={`${sales.wonThisMonth} won this month`} tone="good" icon={<TrendingUp className="size-5" />} />}
        {sites && <StatCard label="Active sites" value={sites.active} hint={sites.delayed ? `${sites.delayed} past target date` : "All on schedule"} tone={sites.delayed ? "warn" : "default"} icon={<Building2 className="size-5" />} href="/projects" />}
        {m && <StatCard label="Received this month" value={moneyShort(m.receivedThisMonth)} hint={`Spent ${moneyShort(m.spentThisMonth)}`} tone="good" icon={<IndianRupee className="size-5" />} href="/accounts" />}
        {m && <StatCard label="Client receivables" value={moneyShort(m.receivables)} hint={`Vendor payables ${moneyShort(m.vendorPayables)}`} tone="warn" icon={<IndianRupee className="size-5" />} href="/accounts" />}
        {team && !m && <StatCard label="Team open tasks" value={team.open} hint={`${team.overdue} overdue`} icon={<Users className="size-5" />} href="/tasks?view=team" />}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {sites && (
            <Card title="Running sites" action={<Link href="/projects" className="text-xs text-brand-700 hover:underline">View all</Link>} padded={false}>
              {sites.list.length === 0 ? (
                <Empty title="No active sites" />
              ) : (
                <ul className="divide-y divide-line">
                  {sites.list.map((p: any) => (
                    <li key={p.id}>
                      <Link href={`/projects/${p.id}`} className="grid grid-cols-12 items-center gap-3 px-4 py-3 hover:bg-stone-50">
                        <div className="col-span-12 min-w-0 sm:col-span-5">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-muted">
                            {p.projectNo} {p.city && `· ${p.city}`} {p.supervisor?.name && `· ${p.supervisor.name}`}
                          </p>
                        </div>
                        <div className="col-span-6 sm:col-span-3">
                          <StatusBadge options={PROJECT_STAGES} value={p.stage} />
                        </div>
                        <div className="col-span-6 flex items-center gap-2 sm:col-span-4">
                          <Progress value={p.progress} />
                          <span className="w-9 text-right text-xs tabular-nums text-muted">{p.progress ?? 0}%</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {sales && (
              <Card title="Today's follow-ups" action={<Link href="/follow-ups" className="text-xs text-brand-700 hover:underline">All</Link>} padded={false}>
                {sales.followups.length === 0 ? (
                  <Empty title="No follow-ups due" icon={<CheckCircle2 className="size-5" />} />
                ) : (
                  <ul className="divide-y divide-line">
                    {sales.followups.map((f: any) => (
                      <li key={f.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <Link href={f.lead ? `/leads/${f.lead.id}` : "/follow-ups"} className="text-sm font-medium hover:underline">
                            {f.lead?.name ?? "Follow-up"}
                          </Link>
                          <p className="truncate text-xs text-muted">
                            {labelOf(FOLLOWUP_TYPES, f.type)} · {f.purpose}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={cx("text-xs", isOverdue(f.scheduledAt) && !isToday(f.scheduledAt) ? "font-medium text-red-600" : "text-stone-600")}>{isToday(f.scheduledAt) ? new Date(f.scheduledAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : date(f.scheduledAt)}</p>
                          {f.lead?.phone && (
                            <a href={telLink(f.lead.phone)} className="text-xs text-brand-700 hover:underline">
                              {f.lead.phone}
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
            {sales && (
              <Card title="Site visits this week" action={<Link href="/site-visits" className="text-xs text-brand-700 hover:underline">All</Link>} padded={false}>
                {sales.siteVisits.length === 0 ? (
                  <Empty title="No visits scheduled" icon={<MapPin className="size-5" />} />
                ) : (
                  <ul className="divide-y divide-line">
                    {sales.siteVisits.map((v: any) => (
                      <li key={v.id} className="px-4 py-2.5">
                        <div className="flex justify-between gap-2">
                          <p className="truncate text-sm font-medium">{v.lead?.name ?? v.project?.name}</p>
                          <p className="shrink-0 text-xs text-stone-600">{dateTime(v.scheduledAt)}</p>
                        </div>
                        <p className="truncate text-xs text-muted">
                          {v.address} {v.visitedBy?.length ? `· ${v.visitedBy.map((u: any) => u.name).join(", ")}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>

          {m && m.dueMilestones?.length > 0 && (
            <Card title="Client payments due" action={<Link href="/accounts" className="text-xs text-brand-700 hover:underline">Site accounts</Link>} padded={false}>
              <ul className="divide-y divide-line">
                {m.dueMilestones.map((d: any) => (
                  <li key={d.projectId + d.milestone} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                    <Link href={`/projects/${d.projectId}?tab=finance`} className="min-w-0 hover:underline">
                      <p className="truncate text-sm font-medium">{d.project}</p>
                      <p className="truncate text-xs text-muted">
                        {d.client} · {d.milestone}
                        {d.dueDate && <span className={cx(isOverdue(d.dueDate) && "text-red-600")}> · due {date(d.dueDate)}</span>}
                      </p>
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">{money(d.amount)}</span>
                      {d.phone && (
                        <a
                          href={waLink(d.phone, `Dear ${d.client}, a gentle reminder that the "${d.milestone}" payment of ${money(d.amount)} for ${d.project} is now due. Thank you – LA-VISTA Interiors.`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Send WhatsApp reminder"
                          className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                        >
                          <MessageCircle className="size-4" />
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {m && (
            <Card title="Cash flow (last 6 months)">
              <CashflowChart data={m.cashflow} />
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="My tasks" action={<Link href="/tasks" className="text-xs text-brand-700 hover:underline">Open</Link>} padded={false}>
            {myWork.tasks.length === 0 ? (
              <Empty title="Nothing pending 🎉" />
            ) : (
              <ul className="divide-y divide-line">
                {myWork.tasks.map((t: any) => (
                  <li key={t.id}>
                    <Link href={`/tasks?open=${t.id}`} className="block px-4 py-2.5 hover:bg-stone-50">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm">{t.title}</p>
                        <StatusBadge options={TASK_PRIORITY} value={t.priority} />
                      </div>
                      <p className={cx("text-xs", isOverdue(t.dueDate) ? "text-red-600" : "text-muted")}>
                        {t.dueDate ? `Due ${date(t.dueDate)}` : "No due date"} {t.project && `· ${t.project.name}`}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {sales && (
            <Card title="Sales pipeline">
              <Pipeline counts={sales.byStatus} />
            </Card>
          )}

          {store && (
            <Card title="Store & procurement">
              <div className="grid grid-cols-2 gap-3 text-center">
                <Link href="/procurement/requests" className="rounded-lg bg-stone-50 p-3 hover:bg-stone-100">
                  <p className="text-2xl font-semibold">{store.pendingMaterialRequests}</p>
                  <p className="text-xs text-muted">Material requests open</p>
                </Link>
                <Link href="/procurement/orders" className="rounded-lg bg-stone-50 p-3 hover:bg-stone-100">
                  <p className="text-2xl font-semibold">{store.openPurchaseOrders}</p>
                  <p className="text-xs text-muted">POs awaiting delivery</p>
                </Link>
              </div>
              {store.lowStock.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                    <AlertTriangle className="size-3.5" /> Low factory stock
                  </p>
                  <ul className="space-y-1 text-sm">
                    {store.lowStock.map((x: any) => (
                      <li key={x.id} className="flex justify-between">
                        <span className="truncate">{x.name}</span>
                        <span className="tabular-nums text-amber-700">
                          {x.stockQty}/{x.minStock} {x.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

          {team && (
            <Card title="Team today">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted">Open tasks</p><p className="text-xl font-semibold">{team.open}</p></div>
                <div><p className="text-xs text-muted">Overdue</p><p className={cx("text-xl font-semibold", team.overdue && "text-red-600")}>{team.overdue}</p></div>
                <div><p className="text-xs text-muted">Done today</p><p className="text-xl font-semibold text-emerald-700">{team.doneToday}</p></div>
                <div><p className="text-xs text-muted">Blocked</p><p className={cx("text-xl font-semibold", team.blocked && "text-amber-700")}>{team.blocked}</p></div>
                {attendance && <div className="col-span-2"><p className="text-xs text-muted">Checked in today</p><p className="text-xl font-semibold">{attendance.presentToday}</p></div>}
              </div>
            </Card>
          )}

          {activity && (
            <Card title="Recent activity" padded={false}>
              <ul className="divide-y divide-line">
                {activity.map((a: any) => (
                  <li key={a.id} className="px-4 py-2.5">
                    <p className="text-sm">{a.message}</p>
                    <p className="text-xs text-muted">
                      {a.userName ?? "System"} · {relative(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
