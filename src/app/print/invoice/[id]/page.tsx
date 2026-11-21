import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { InvoicePrint } from "@/views/print";

export const metadata: Metadata = { title: "Bill" };

export default function Page({ params }: PageProps<"/print/invoice/[id]">) {
  return (
    <Guard perm={"invoices:read"}>
      <Suspense fallback={<Loading />}>
        <InvoicePrint params={params} />
      </Suspense>
    </Guard>
  );
}
