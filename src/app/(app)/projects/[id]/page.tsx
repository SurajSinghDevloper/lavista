import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { ProjectDetail } from "@/views/projects";

export const metadata: Metadata = { title: "Site" };

export default function Page({ params }: PageProps<"/projects/[id]">) {
  return (
    <Guard perm={"projects:read"}>
      <Suspense fallback={<Loading />}>
        <ProjectDetail params={params} />
      </Suspense>
    </Guard>
  );
}
