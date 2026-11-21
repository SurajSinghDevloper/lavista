import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { LeadsPage } from "@/views/sales";

export const metadata: Metadata = { title: "Leads" };

export default function Page() {
  return (
    <Guard perm={"leads:read"}>
      <Suspense fallback={<Loading />}>
        <LeadsPage />
      </Suspense>
    </Guard>
  );
}
