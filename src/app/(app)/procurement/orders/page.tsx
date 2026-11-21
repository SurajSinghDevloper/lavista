import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { PurchaseOrdersView } from "@/views/procurement";

export const metadata: Metadata = { title: "Purchase orders" };

export default function Page() {
  return (
    <Guard perm={"purchase_orders:read"}>
      <Suspense fallback={<Loading />}>
        <PurchaseOrdersView />
      </Suspense>
    </Guard>
  );
}
