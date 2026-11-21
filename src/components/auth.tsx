"use client";

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { useOne } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { Role } from "@/lib/constants";
import { can as canCheck, canAny as canAnyCheck, type Permission } from "@/lib/permissions";
import { ConfirmProvider, Loading as PageLoading, ToastProvider } from "./ui";

export type Me = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  designation?: string;
  permissions: Permission[];
  mustChangePassword?: boolean;
};

type AuthCtx = {
  user: Me | undefined;
  loading: boolean;
  can: (p: Permission | Permission[]) => boolean;
  canAny: (p: Permission[]) => boolean;
  logout: () => Promise<void>;
  reload: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

function AuthInner({ children }: { children: ReactNode }) {
  const { data, isLoading, mutate } = useOne<Me>("/auth/me", { revalidateOnFocus: true, dedupingInterval: 30_000 });
  const value: AuthCtx = {
    user: data,
    loading: isLoading,
    can: (p) => canCheck(data?.permissions, p),
    canAny: (p) => canAnyCheck(data?.permissions, p),
    logout: async () => {
      await api.post("/auth/logout").catch(() => undefined);
      window.location.href = "/login";
    },
    reload: () => void mutate(),
  };
  return <Ctx value={value}>{children}</Ctx>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ revalidateOnFocus: false, shouldRetryOnError: false }}>
      <ToastProvider>
        <ConfirmProvider>
          <AuthInner>{children}</AuthInner>
        </ConfirmProvider>
      </ToastProvider>
    </SWRConfig>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside <Providers>");
  return c;
}

/** Page-level guard: shows a clear message instead of empty screens when a role lacks access. */
export function Guard({ perm, children }: { perm?: Permission | Permission[]; children: ReactNode }) {
  const { user, can } = useAuth();
  if (!perm) return children;
  if (!user) return <PageLoading />;
  if (!can(perm)) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-white p-8 text-center">
        <p className="font-display text-2xl font-semibold">No access</p>
        <p className="mt-2 text-sm text-muted">Your role doesn&apos;t include this page. Ask the admin if you need it.</p>
        <Link href="/dashboard" className="mt-5 inline-block rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">Go to dashboard</Link>
      </div>
    );
  }
  return children;
}
