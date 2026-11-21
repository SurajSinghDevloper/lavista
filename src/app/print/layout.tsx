import { Providers } from "@/components/auth";

export default function PrintLayout({ children }: LayoutProps<"/print">) {
  return <Providers>{children}</Providers>;
}
