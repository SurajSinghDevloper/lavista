import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { SettingsPage } from "@/views/team";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <Guard perm={"settings:read"}>
      <Suspense fallback={<Loading />}>
        <SettingsPage />
      </Suspense>
    </Guard>
  );
}
