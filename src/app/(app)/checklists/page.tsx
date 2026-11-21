import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { ChecklistsView } from "@/views/site";

export const metadata: Metadata = { title: "QC checklists" };

export default function Page() {
  return (
    <Guard perm={"checklists:read"}>
      <Suspense fallback={<Loading />}>
        <ChecklistsView />
      </Suspense>
    </Guard>
  );
}
