import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { ExpensesView } from "@/views/accounts";

export const metadata: Metadata = { title: "Expenses" };

export default function Page() {
  return (
    <Guard perm={"expenses:read"}>
      <Suspense fallback={<Loading />}>
        <ExpensesView />
      </Suspense>
    </Guard>
  );
}
