import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { DesignsPage } from "@/views/designs";

export const metadata: Metadata = { title: "Designs & renders" };

export default function Page() {
  return (
    <Guard perm={"designs:read"}>
      <Suspense fallback={<Loading />}>
        <DesignsPage />
      </Suspense>
    </Guard>
  );
}
