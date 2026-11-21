import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { QuotationPrint } from "@/views/print";

export const metadata: Metadata = { title: "Quotation" };

export default function Page({ params }: PageProps<"/print/quotation/[id]">) {
  return (
    <Guard perm={"quotations:read"}>
      <Suspense fallback={<Loading />}>
        <QuotationPrint params={params} />
      </Suspense>
    </Guard>
  );
}
