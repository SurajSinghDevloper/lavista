import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { PurchaseOrderDetail } from "@/views/procurement";

export const metadata: Metadata = { title: "Purchase order" };

export default function Page({ params }: PageProps<"/procurement/orders/[id]">) {
  return (
    <Guard perm={"purchase_orders:read"}>
      <Suspense fallback={<Loading />}>
        <PurchaseOrderDetail params={params} />
      </Suspense>
    </Guard>
  );
}
