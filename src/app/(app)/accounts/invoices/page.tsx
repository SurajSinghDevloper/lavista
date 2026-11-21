import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { InvoicesView } from "@/views/accounts";

export const metadata: Metadata = { title: "Bills" };

export default function Page() {
  return (
    <Guard perm={"invoices:read"}>
      <Suspense fallback={<Loading />}>
        <InvoicesView />
      </Suspense>
    </Guard>
  );
}
