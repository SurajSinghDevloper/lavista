import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { WorkOrdersView } from "@/views/site";

export const metadata: Metadata = { title: "Work orders" };

export default function Page() {
  return (
    <Guard perm={"workorders:read"}>
      <Suspense fallback={<Loading />}>
        <WorkOrdersView />
      </Suspense>
    </Guard>
  );
}
