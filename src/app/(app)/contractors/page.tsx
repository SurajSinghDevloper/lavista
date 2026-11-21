import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { ContractorsPage } from "@/views/site";

export const metadata: Metadata = { title: "Contractors" };

export default function Page() {
  return (
    <Guard perm={"contractors:read"}>
      <Suspense fallback={<Loading />}>
        <ContractorsPage />
      </Suspense>
    </Guard>
  );
}
