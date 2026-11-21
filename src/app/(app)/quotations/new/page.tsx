import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { NewQuotation } from "@/views/quotations";

export const metadata: Metadata = { title: "New quotation" };

export default function Page() {
  return (
    <Guard perm={"quotations:write"}>
      <Suspense fallback={<Loading />}>
        <NewQuotation />
      </Suspense>
    </Guard>
  );
}
