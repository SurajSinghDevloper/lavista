import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { AccountsPage } from "@/views/accounts";

export const metadata: Metadata = { title: "Site accounts" };

export default function Page() {
  return (
    <Guard perm={"accounts:read"}>
      <Suspense fallback={<Loading />}>
        <AccountsPage />
      </Suspense>
    </Guard>
  );
}
