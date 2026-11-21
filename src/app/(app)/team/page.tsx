import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { TeamPage } from "@/views/team";

export const metadata: Metadata = { title: "Team" };

export default function Page() {
  return (
    <Guard perm={"users:read"}>
      <Suspense fallback={<Loading />}>
        <TeamPage />
      </Suspense>
    </Guard>
  );
}
