import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { InventoryPage } from "@/views/procurement";

export const metadata: Metadata = { title: "Factory stock" };

export default function Page() {
  return (
    <Guard perm={"inventory:read"}>
      <Suspense fallback={<Loading />}>
        <InventoryPage />
      </Suspense>
    </Guard>
  );
}
