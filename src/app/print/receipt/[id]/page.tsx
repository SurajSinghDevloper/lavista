import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { ReceiptPrint } from "@/views/print";

export const metadata: Metadata = { title: "Receipt" };

export default function Page({ params }: PageProps<"/print/receipt/[id]">) {
  return (
    <Guard perm={"payments:read"}>
      <Suspense fallback={<Loading />}>
        <ReceiptPrint params={params} />
      </Suspense>
    </Guard>
  );
}
