"use client";

import Link from "next/link";
import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { useOne } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import type { Role } from "@/lib/constants";
import { applyManagedOptions, type OptionsPayload } from "@/lib/options";
import { can as canCheck, canAny as canAnyCheck, type Permission } from "@/lib/permissions";
import { ConfirmProvider, Loading as PageLoading, ToastProvider, useToast, userMessage } from "./ui";

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
  // only changes when the user / permissions change, so screens don't re-render for nothing
  const value = useMemo<AuthCtx>(
    () => ({
      user: data,
      loading: isLoading,
      can: (p) => canCheck(data?.permissions, p),
      canAny: (p) => canAnyCheck(data?.permissions, p),
      logout: async () => {
        await api.post("/auth/logout").catch(() => undefined);
        window.location.href = "/login";
      },
      reload: () => void mutate(),
    }),
    [data, isLoading, mutate]
  );
  return <Ctx value={value}>{children}</Ctx>;
}

/** Any screen whose data fails to load tells the user why (same message is not repeated within 30 s). */
function DataLayer({ children }: { children: ReactNode }) {
  const toast = useToast(); // stable object
  const last = useRef({ message: "", at: 0 });
  // created once – a new config object would re-render every screen (and reset open forms)
  const config = useMemo(
    () => ({
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      onError: (err: unknown) => {
        if (err instanceof ApiClientError && err.status === 401) return; // already sending them to the login page
        const message = userMessage(err);
        const now = Date.now();
        if (message === last.current.message && now - last.current.at < 30_000) return;
        last.current = { message, at: now };
        toast.error(message);
      },
    }),
    [toast]
  );
  return <SWRConfig value={config}>{children}</SWRConfig>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <DataLayer>
        <ConfirmProvider>
          <AuthInner>{children}</AuthInner>
        </ConfirmProvider>
      </DataLayer>
    </ToastProvider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside <Providers>");
  return c;
}

/** Loads the client's own dropdown lists (Settings → Dropdown options) before any screen draws a form. */
export function OptionsReady({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data, error } = useOne<OptionsPayload>(user ? "/settings/options" : null, { revalidateOnFocus: false, dedupingInterval: 60_000 });
  useMemo(() => data && applyManagedOptions(data), [data]);
  if (user && !data && !error) return <PageLoading />;
  return children;
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
