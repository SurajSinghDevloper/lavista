import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { VendorsPage } from "@/views/procurement";

export const metadata: Metadata = { title: "Vendors" };

export default function Page() {
  return (
    <Guard perm={"vendors:read"}>
      <Suspense fallback={<Loading />}>
        <VendorsPage />
      </Suspense>
    </Guard>
  );
}
