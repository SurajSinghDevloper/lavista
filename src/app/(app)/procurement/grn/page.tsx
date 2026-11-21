import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { GRNView } from "@/views/procurement";

export const metadata: Metadata = { title: "Goods receipt" };

export default function Page() {
  return (
    <Guard perm={"grn:read"}>
      <Suspense fallback={<Loading />}>
        <GRNView />
      </Suspense>
    </Guard>
  );
}
