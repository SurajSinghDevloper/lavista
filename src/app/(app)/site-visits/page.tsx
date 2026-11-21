import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { SiteVisitsPage } from "@/views/sales";

export const metadata: Metadata = { title: "Site visits" };

export default function Page() {
  return (
    <Guard perm={"site_visits:read"}>
      <Suspense fallback={<Loading />}>
        <SiteVisitsPage />
      </Suspense>
    </Guard>
  );
}
