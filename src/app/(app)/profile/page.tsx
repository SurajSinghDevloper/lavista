import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { ProfilePage } from "@/views/team";

export const metadata: Metadata = { title: "My profile" };

export default function Page() {
  return (
    <Guard perm={undefined}>
      <Suspense fallback={<Loading />}>
        <ProfilePage />
      </Suspense>
    </Guard>
  );
}
