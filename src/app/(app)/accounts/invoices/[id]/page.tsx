import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { InvoiceDetail } from "@/views/accounts";

export const metadata: Metadata = { title: "Bill" };

export default function Page({ params }: PageProps<"/accounts/invoices/[id]">) {
  return (
    <Guard perm={"invoices:read"}>
      <Suspense fallback={<Loading />}>
        <InvoiceDetail params={params} />
      </Suspense>
    </Guard>
  );
}
