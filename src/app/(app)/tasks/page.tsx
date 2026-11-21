import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { TasksPage } from "@/views/tasks";

export const metadata: Metadata = { title: "Tasks" };

export default function Page() {
  return (
    <Guard perm={"tasks:read"}>
      <Suspense fallback={<Loading />}>
        <TasksPage />
      </Suspense>
    </Guard>
  );
}
