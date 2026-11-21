import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { ClientDetail } from "@/views/sales";

export const metadata: Metadata = { title: "Client" };

export default function Page({ params }: PageProps<"/clients/[id]">) {
  return (
    <Guard perm={"clients:read"}>
      <Suspense fallback={<Loading />}>
        <ClientDetail params={params} />
      </Suspense>
    </Guard>
  );
}
