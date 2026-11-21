import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { POPrint } from "@/views/print";

export const metadata: Metadata = { title: "Purchase order" };

export default function Page({ params }: PageProps<"/print/po/[id]">) {
  return (
    <Guard perm={"purchase_orders:read"}>
      <Suspense fallback={<Loading />}>
        <POPrint params={params} />
      </Suspense>
    </Guard>
  );
}
