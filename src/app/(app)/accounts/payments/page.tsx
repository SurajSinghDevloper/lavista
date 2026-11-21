import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { PaymentsView } from "@/views/accounts";

export const metadata: Metadata = { title: "Payments received" };

export default function Page() {
  return (
    <Guard perm={"payments:read"}>
      <Suspense fallback={<Loading />}>
        <PaymentsView />
      </Suspense>
    </Guard>
  );
}
