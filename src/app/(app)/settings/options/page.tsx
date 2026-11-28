import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { OptionsManagerPage } from "@/views/admin";

export const metadata: Metadata = { title: "Dropdown options" };

export default function Page() {
  return (
    <Guard perm={"settings:read"}>
      <Suspense fallback={<Loading />}>
        <OptionsManagerPage />
      </Suspense>
    </Guard>
  );
}
