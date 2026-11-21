import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { LeadDetail } from "@/views/sales";

export const metadata: Metadata = { title: "Lead" };

export default function Page({ params }: PageProps<"/leads/[id]">) {
  return (
    <Guard perm={"leads:read"}>
      <Suspense fallback={<Loading />}>
        <LeadDetail params={params} />
      </Suspense>
    </Guard>
  );
}
