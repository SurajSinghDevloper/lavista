import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { MaterialRequestsView } from "@/views/procurement";

export const metadata: Metadata = { title: "Material requests" };

export default function Page() {
  return (
    <Guard perm={"material_requests:read"}>
      <Suspense fallback={<Loading />}>
        <MaterialRequestsView />
      </Suspense>
    </Guard>
  );
}
