import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { QuotationsPage } from "@/views/quotations";

export const metadata: Metadata = { title: "Quotations" };

export default function Page() {
  return (
    <Guard perm={"quotations:read"}>
      <Suspense fallback={<Loading />}>
        <QuotationsPage />
      </Suspense>
    </Guard>
  );
}
