"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { Button, Card, Loading, PageHeader, Progress, StatusBadge, cx } from "@/components/ui";
import { useOne } from "@/hooks/use-api";
import { EXPENSE_CATEGORIES, LEAD_SOURCES, PAYMENT_MODES, PROJECT_STAGES, ROLES, labelOf } from "@/lib/constants";
import { money, moneyShort, toInputDate } from "@/lib/format";

function Bars({ rows, value, label, format = (v: number) => String(v), tone = "bg-brand-400" }: { rows: any[]; value: (r: any) => number; label: (r: any) => string; format?: (v: number) => string; tone?: string }) {
  const max = Math.max(1, ...rows.map(value));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          <span className="w-36 shrink-0 truncate text-stone-600">{label(r)}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-stone-100"><div className={cx("h-full rounded", tone)} style={{ width: `${(value(r) / max) * 100}%` }} /></div>
          <span className="w-20 text-right tabular-nums">{format(value(r))}</span>
        </div>
      ))}
    </div>
  );
}

function csv(rows: any[], cols: { key: string; label: string; get?: (r: any) => unknown }[], name: string) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = [cols.map((c) => esc(c.label)).join(","), ...rows.map((r) => cols.map((c) => esc(c.get ? c.get(r) : r[c.key])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const router = useRouter();
  const [from, setFrom] = useState(() => toInputDate(new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1)));
  const [to, setTo] = useState(() => toInputDate(new Date()));
  const { data, isLoading } = useOne<any>(`/reports?from=${from}&to=${to}`);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle="Sales conversion, site profitability, cash flow and team performance"
        actions={
          <>
            <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-sm text-muted">to</span>
            <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        }
      />
      {isLoading || !data ? (
        <Loading />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Leads & conversion by source">
              <DataTable
                rows={data.leads.bySource.map((r: any) => ({ ...r, id: r.source }))}
                columns={[
                  { key: "source", label: "Source", render: (r) => labelOf(LEAD_SOURCES, r.source) },
                  { key: "total", label: "Leads", align: "right" },
                  { key: "won", label: "Won", align: "right" },
                  { key: "lost", label: "Lost", align: "right" },
                  { key: "rate", label: "Conversion", render: (r) => <span className="font-semibold">{r.rate}%</span>, align: "right" },
                ]}
              />
            </Card>
            <Card title="Monthly enquiries vs conversions">
              <div className="flex h-48 items-end gap-2">
                {data.leads.monthly.map((m: any) => {
                  const max = Math.max(1, ...data.leads.monthly.map((x: any) => x.total));
                  return (
                    <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                      <div className="relative flex h-40 w-full items-end justify-center">
                        <div className="w-3/5 rounded-t bg-stone-300" style={{ height: `${(m.total / max) * 100}%` }} title={`${m.total} leads`} />
                        <div className="absolute bottom-0 w-3/5 rounded-t bg-emerald-500" style={{ height: `${(m.won / max) * 100}%` }} title={`${m.won} won`} />
                      </div>
                      <span className="text-[10px] text-muted">{new Date(m.month + "-01").toLocaleString("en-IN", { month: "short" })}</span>
                    </div>
                  );
                })}
              </div>
              {data.leads.lostReasons.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-stone-500">Why leads were lost</p>
                  <Bars rows={data.leads.lostReasons} value={(r) => r.count} label={(r) => r.reason} tone="bg-rose-300" />
                </div>
              )}
            </Card>
          </div>

          <Card
            title="Site profitability"
            padded={false}
            action={
              <Button size="xs" variant="secondary" icon={<Download className="size-3.5" />} onClick={() => csv(data.sites, [{ key: "projectNo", label: "Site no" }, { key: "name", label: "Site" }, { key: "stage", label: "Stage" }, { key: "contractValue", label: "Contract" }, { key: "received", label: "Received" }, { key: "spent", label: "Spent" }, { key: "margin", label: "Margin" }, { key: "marginPct", label: "Margin %" }], "site-profitability")}>
                CSV
              </Button>
            }
          >
            <DataTable
              rows={data.sites}
              onRowClick={(r) => router.push(`/projects/${r.id}?tab=finance`)}
              columns={[
                { key: "name", label: "Site", render: (r) => <span><span className="font-medium">{r.name}</span><span className="block text-xs text-muted">{r.projectNo}</span></span> },
                { key: "stage", label: "Stage", render: (r) => <StatusBadge options={PROJECT_STAGES} value={r.stage} /> },
                { key: "progress", label: "Progress", render: (r) => <div className="flex w-24 items-center gap-2"><Progress value={r.progress} /><span className="text-xs">{r.progress ?? 0}%</span></div> },
                { key: "contractValue", label: "Contract", render: (r) => money(r.contractValue), align: "right" },
                { key: "received", label: "Received", render: (r) => money(r.received), align: "right" },
                { key: "spent", label: "Spent", render: (r) => money(r.spent), align: "right" },
                { key: "margin", label: "Margin", render: (r) => <strong className={r.margin < 0 ? "text-red-700" : "text-emerald-700"}>{money(r.margin)}</strong>, align: "right" },
                { key: "marginPct", label: "%", render: (r) => `${r.marginPct}%`, align: "right" },
              ]}
            />
          </Card>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Cash flow (12 months)" className="lg:col-span-2">
              <div className="flex h-48 items-end gap-2">
                {data.finance.cashflow.map((m: any) => {
                  const max = Math.max(1, ...data.finance.cashflow.flatMap((x: any) => [x.received, x.spent]));
                  return (
                    <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex h-40 w-full items-end justify-center gap-0.5">
                        <div className="w-2/5 rounded-t bg-emerald-500/85" style={{ height: `${(m.received / max) * 100}%` }} title={money(m.received)} />
                        <div className="w-2/5 rounded-t bg-rose-400/80" style={{ height: `${(m.spent / max) * 100}%` }} title={money(m.spent)} />
                      </div>
                      <span className="text-[10px] text-muted">{new Date(m.month + "-01").toLocaleString("en-IN", { month: "short" })}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card title="Receipts by mode">
              <Bars rows={data.finance.receiptsByMode} value={(r) => r.amount} label={(r) => labelOf(PAYMENT_MODES, r.mode)} format={moneyShort} tone="bg-emerald-400" />
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Expenses by category">
              <Bars rows={data.finance.expenseByCategory} value={(r) => r.amount} label={(r) => labelOf(EXPENSE_CATEGORIES, r.category)} format={moneyShort} tone="bg-rose-300" />
            </Card>
            <Card title="Team task performance" padded={false}>
              <DataTable
                rows={data.team}
                columns={[
                  { key: "name", label: "Member", render: (r) => <span>{r.name}<span className="block text-xs text-muted">{labelOf(ROLES, r.role)}</span></span> },
                  { key: "total", label: "Assigned", align: "right" },
                  { key: "done", label: "Done", align: "right" },
                  { key: "late", label: "Done late", align: "right" },
                  { key: "rate", label: "Completion", render: (r) => `${r.total ? Math.round((r.done / r.total) * 100) : 0}%`, align: "right" },
                ]}
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
