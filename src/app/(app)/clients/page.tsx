import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { ClientsPage } from "@/views/sales";

export const metadata: Metadata = { title: "Clients" };

export default function Page() {
  return (
    <Guard perm={"clients:read"}>
      <Suspense fallback={<Loading />}>
        <ClientsPage />
      </Suspense>
    </Guard>
  );
}
