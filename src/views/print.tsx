"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Printer } from "lucide-react";
import { Fragment, use, useEffect, type ReactNode } from "react";
import { BankDetails, Letterhead, amountInWords, useCompany } from "@/components/domain";
import { Button, Loading } from "@/components/ui";
import { useOne } from "@/hooks/use-api";
import { DELIVERY_LOCATIONS, INVOICE_TYPES, PAYMENT_MODES, RECEIPT_TYPES, UNITS, labelOf } from "@/lib/constants";
import { date, money, number } from "@/lib/format";

function Page({ children, ready }: { children: ReactNode; ready: boolean }) {
  useEffect(() => {
    if (ready) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [ready]);
  return (
    <div className="min-h-screen bg-stone-100 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-4">
        <Button variant="secondary" onClick={() => window.close()}>Close</Button>
        <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Print / Save as PDF</Button>
      </div>
      <div className="print-area mx-auto max-w-[210mm] bg-white p-10 text-[13px] leading-relaxed text-ink shadow-lg">{ready ? children : <Loading />}</div>
    </div>
  );
}

function Party({ title, name, lines }: { title: string; name?: string; lines: (string | undefined)[] }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">{title}</p>
      <p className="font-semibold">{name}</p>
      {lines.filter(Boolean).map((l, i) => <p key={i} className="text-xs text-stone-600">{l}</p>)}
    </div>
  );
}

function Signature() {
  const { company } = useCompany();
  return (
    <div className="mt-12 flex justify-between text-xs">
      <div className="w-48 border-t border-stone-400 pt-1 text-center">Customer signature</div>
      <div className="w-56 border-t border-stone-400 pt-1 text-center">For {company.name || "LA-VISTA"}<br />Authorised signatory</div>
    </div>
  );
}

function ItemsTable({ items, gst }: { items: any[]; gst?: boolean }) {
  const sections = [...new Set(items.map((i) => i.section || ""))];
  let n = 0;
  return (
    <table className="mt-6 w-full border-collapse text-xs">
      <thead>
        <tr className="border-y-2 border-ink text-left">
          <th className="py-2 pr-2">#</th>
          <th className="py-2 pr-2">Description</th>
          <th className="py-2 pr-2 text-right">Qty</th>
          <th className="py-2 pr-2">Unit</th>
          <th className="py-2 pr-2 text-right">Rate</th>
          {gst && <th className="py-2 pr-2 text-right">GST</th>}
          <th className="py-2 text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        {sections.map((s) => (
          <Fragment key={s || "_"}>
            {s && sections.length > 1 && (
              <tr key={"s" + s} className="bg-stone-100">
                <td colSpan={gst ? 7 : 6} className="py-1.5 pl-1 font-semibold uppercase tracking-wide">{s}</td>
              </tr>
            )}
            {items.filter((i) => (i.section || "") === s).map((i) => (
              <tr key={i.id ?? `${s}-${n}`} className="border-b border-stone-200 align-top">
                <td className="py-1.5 pr-2">{++n}</td>
                <td className="py-1.5 pr-2">{i.description}{i.specification && <span className="block text-[11px] text-stone-500">{i.specification}</span>}{i.hsn && <span className="block text-[10px] text-stone-400">HSN {i.hsn}</span>}</td>
                <td className="py-1.5 pr-2 text-right">{number(i.qty)}</td>
                <td className="py-1.5 pr-2">{labelOf(UNITS, i.unit)}</td>
                <td className="py-1.5 pr-2 text-right">{money(i.rate, true)}</td>
                {gst && <td className="py-1.5 pr-2 text-right">{i.gstRate ?? 0}%</td>}
                <td className="py-1.5 text-right">{money(i.amount ?? i.qty * i.rate, true)}</td>
              </tr>
            ))}
            {s && sections.length > 1 && (
              <tr key={"t" + s}>
                <td colSpan={gst ? 6 : 5} className="py-1 pr-2 text-right text-[11px] text-stone-500">{s} total</td>
                <td className="py-1 text-right text-[11px] font-semibold">{money(items.filter((i) => (i.section || "") === s).reduce((a, i) => a + (i.amount ?? i.qty * i.rate), 0), true)}</td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

function Sum({ rows }: { rows: [string, number | undefined, boolean?][] }) {
  return (
    <div className="mt-4 ml-auto w-72 space-y-1 text-sm">
      {rows.filter(([, v]) => v !== undefined && v !== 0).map(([l, v, strong]) => (
        <div key={l} className={strong ? "flex justify-between border-t-2 border-ink pt-1 text-base font-bold" : "flex justify-between"}>
          <span>{l}</span>
          <span className="tabular-nums">{money(v, true)}</span>
        </div>
      ))}
    </div>
  );
}

export function QuotationPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: q } = useOne<any>(`/quotations/${id}`);
  return (
    <Page ready={!!q}>
      {q && (
        <>
          <Letterhead title="Quotation" number={`${q.quoteNo} (v${q.version})`} dateValue={q.date} right={q.validUntil && <p className="text-xs text-stone-500">Valid till {date(q.validUntil)}</p>} />
          <div className="mt-6 grid grid-cols-2 gap-6">
            <Party title="Prepared for" name={q.client?.name ?? q.customerName} lines={[q.client?.phone ?? q.customerPhone, q.client?.address ?? q.customerAddress, q.client?.gstin && `GSTIN ${q.client.gstin}`]} />
            <Party title="Project" name={q.title} lines={[q.project?.name, q.project?.siteAddress]} />
          </div>
          <ItemsTable items={q.items} />
          <Sum rows={[["Subtotal", q.subtotal], ["Discount", -q.discountAmount], [`GST @ ${q.taxRate}%`, q.taxAmount], ["Total", q.total, true]]} />
          <p className="mt-2 text-right text-xs italic text-stone-600">{amountInWords(q.total)}</p>
          {q.terms && (
            <div className="mt-8">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider">Terms & conditions</p>
              <ol className="list-decimal space-y-0.5 pl-4 text-xs text-stone-600">{q.terms.split("\n").filter(Boolean).map((t: string, i: number) => <li key={i}>{t}</li>)}</ol>
            </div>
          )}
          <div className="mt-6"><BankDetails /></div>
          <Signature />
        </>
      )}
    </Page>
  );
}

export function InvoicePrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: inv } = useOne<any>(`/invoices/${id}`);
  return (
    <Page ready={!!inv}>
      {inv && (
        <>
          <Letterhead title={labelOf(INVOICE_TYPES, inv.type)} number={inv.invoiceNo} dateValue={inv.date} right={inv.dueDate && <p className="text-xs text-stone-500">Due {date(inv.dueDate)}</p>} />
          <div className="mt-6 grid grid-cols-2 gap-6">
            <Party title="Bill to" name={inv.client?.name} lines={[inv.client?.phone, inv.client?.address, inv.client?.gstin && `GSTIN ${inv.client.gstin}`]} />
            <Party title="Site" name={inv.project?.name} lines={[inv.project?.projectNo, inv.project?.siteAddress]} />
          </div>
          <ItemsTable items={inv.items} gst />
          <Sum rows={[["Subtotal", inv.subtotal], ["Discount", -inv.discountAmount], ["Taxable value", inv.discountAmount ? inv.taxableAmount : undefined], ["CGST", inv.cgst], ["SGST", inv.sgst], ["IGST", inv.igst], ["Round off", inv.roundOff], ["Total", inv.total, true], ["Received", inv.amountPaid ? -inv.amountPaid : undefined], ["Balance due", inv.amountPaid ? inv.balance : undefined, true]]} />
          <p className="mt-2 text-right text-xs italic text-stone-600">{amountInWords(inv.total)}</p>
          {inv.notes && <p className="mt-6 text-xs">{inv.notes}</p>}
          {inv.terms && <p className="mt-4 whitespace-pre-line text-xs text-stone-600">{inv.terms}</p>}
          <div className="mt-6"><BankDetails /></div>
          <Signature />
        </>
      )}
    </Page>
  );
}

export function POPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: po } = useOne<any>(`/purchase-orders/${id}`);
  const { company } = useCompany();
  return (
    <Page ready={!!po}>
      {po && (
        <>
          <Letterhead title="Purchase Order" number={po.poNo} dateValue={po.date} right={po.expectedDate && <p className="text-xs text-stone-500">Deliver by {date(po.expectedDate)}</p>} />
          <div className="mt-6 grid grid-cols-2 gap-6">
            <Party title="Vendor" name={po.vendor?.name} lines={[po.vendor?.contactPerson, po.vendor?.phone, po.vendor?.address, po.vendor?.gstin && `GSTIN ${po.vendor.gstin}`]} />
            <Party title={`Deliver to (${labelOf(DELIVERY_LOCATIONS, po.deliverTo)})`} name={po.project ? po.project.name : company.name} lines={[po.project ? po.project.siteAddress : company.address]} />
          </div>
          <ItemsTable items={po.items} gst />
          <Sum rows={[["Subtotal", po.subtotal], ["GST", po.taxAmount], ["Freight", po.freight], ["Total", po.total, true]]} />
          {po.terms && <p className="mt-6 whitespace-pre-line text-xs text-stone-600">{po.terms}</p>}
          <Signature />
        </>
      )}
    </Page>
  );
}

export function ReceiptPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: p } = useOne<any>(`/payments/${id}`);
  return (
    <Page ready={!!p}>
      {p && (
        <>
          <Letterhead title="Payment Receipt" number={p.receiptNo} dateValue={p.date} />
          <div className="mt-8 space-y-4 text-sm">
            <p>
              Received with thanks from <strong>{p.client?.name}</strong> the sum of <strong>{money(p.amount, true)}</strong> ({amountInWords(p.amount)}) by{" "}
              <strong>{labelOf(PAYMENT_MODES, p.mode)}</strong>{p.reference && <> (ref. {p.reference})</>} towards <strong>{labelOf(RECEIPT_TYPES, p.type)}</strong> for the site{" "}
              <strong>{p.project?.name}</strong>{p.invoice && <> against bill {p.invoice.invoiceNo}</>}.
            </p>
            {p.notes && <p className="text-stone-600">{p.notes}</p>}
          </div>
          <div className="mt-10 inline-block rounded-lg border-2 border-ink px-6 py-3 text-xl font-bold">{money(p.amount, true)}</div>
          <Signature />
        </>
      )}
    </Page>
  );
}
