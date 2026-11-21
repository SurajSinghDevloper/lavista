import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { DailyReportsView } from "@/views/site";

export const metadata: Metadata = { title: "Daily site reports" };

export default function Page() {
  return (
    <Guard perm={"daily_reports:read"}>
      <Suspense fallback={<Loading />}>
        <DailyReportsView />
      </Suspense>
    </Guard>
  );
}
