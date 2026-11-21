import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { ProjectsPage } from "@/views/projects";

export const metadata: Metadata = { title: "Sites" };

export default function Page() {
  return (
    <Guard perm={"projects:read"}>
      <Suspense fallback={<Loading />}>
        <ProjectsPage />
      </Suspense>
    </Guard>
  );
}
