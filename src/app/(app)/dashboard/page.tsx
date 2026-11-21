import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import View from "@/views/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <Guard perm={"dashboard:read"}>
      <Suspense fallback={<Loading />}>
        <View />
      </Suspense>
    </Guard>
  );
}
