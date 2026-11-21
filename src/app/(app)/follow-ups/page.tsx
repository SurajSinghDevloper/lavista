import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { FollowUpsPage } from "@/views/sales";

export const metadata: Metadata = { title: "Follow-ups" };

export default function Page() {
  return (
    <Guard perm={"followups:read"}>
      <Suspense fallback={<Loading />}>
        <FollowUpsPage />
      </Suspense>
    </Guard>
  );
}
