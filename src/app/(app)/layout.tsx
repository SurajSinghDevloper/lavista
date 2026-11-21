import { Providers } from "@/components/auth";
import { AppShell } from "@/components/shell";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
