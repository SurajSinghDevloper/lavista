import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { NewInvoice } from "@/views/accounts";

export const metadata: Metadata = { title: "New bill" };

export default function Page() {
  return (
    <Guard perm={"invoices:write"}>
      <Suspense fallback={<Loading />}>
        <NewInvoice />
      </Suspense>
    </Guard>
  );
}
