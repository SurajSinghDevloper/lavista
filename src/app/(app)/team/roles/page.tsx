import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { RolesPage } from "@/views/admin";

export const metadata: Metadata = { title: "Roles & permissions" };

export default function Page() {
  return (
    <Guard perm={"users:read"}>
      <Suspense fallback={<Loading />}>
        <RolesPage />
      </Suspense>
    </Guard>
  );
}
