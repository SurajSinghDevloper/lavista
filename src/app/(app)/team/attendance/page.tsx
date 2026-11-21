import type { Metadata } from "next";
import { Suspense } from "react";
import { Guard } from "@/components/auth";
import { Loading } from "@/components/ui";
import { AttendancePage } from "@/views/team";

export const metadata: Metadata = { title: "Attendance" };

export default function Page() {
  return (
    <Guard perm={"attendance:read"}>
      <Suspense fallback={<Loading />}>
        <AttendancePage />
      </Suspense>
    </Guard>
  );
}
