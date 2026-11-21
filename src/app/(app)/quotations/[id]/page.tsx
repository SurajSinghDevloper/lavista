import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { QuotationDetail } from "@/views/quotations";

export const metadata: Metadata = { title: "Quotation" };

export default function Page({ params }: PageProps<"/quotations/[id]">) {
  return (
    <Guard perm={"quotations:read"}>
      <Suspense fallback={<Loading />}>
        <QuotationDetail params={params} />
      </Suspense>
    </Guard>
  );
}
