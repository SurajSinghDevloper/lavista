import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { NewPurchaseOrder } from "@/views/procurement";

export const metadata: Metadata = { title: "New purchase order" };

export default function Page() {
  return (
    <Guard perm={"purchase_orders:write"}>
      <Suspense fallback={<Loading />}>
        <NewPurchaseOrder />
      </Suspense>
    </Guard>
  );
}
