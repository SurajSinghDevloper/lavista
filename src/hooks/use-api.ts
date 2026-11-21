"use client";

import useSWR, { mutate as globalMutate, type SWRConfiguration } from "swr";
import { qs, request, type ListMeta } from "@/lib/api-client";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any> & { id: string };

const fetcher = (key: string) => request(key);

/** GET a single object. Pass null to skip. */
export function useOne<T = Row>(path: string | null, config?: SWRConfiguration) {
  const swr = useSWR(path ? `/api/v1${path}` : null, fetcher, config);
  return { ...swr, data: swr.data?.data as T | undefined, meta: swr.data?.meta };
}

/** GET a list with query params. */
export function useList<T = Row>(path: string | null, params: Record<string, unknown> = {}, config?: SWRConfiguration) {
  const key = path ? `/api/v1${path}${qs(params)}` : null;
  const swr = useSWR(key, fetcher, { keepPreviousData: true, ...config });
  return {
    ...swr,
    rows: (swr.data?.data as T[] | undefined) ?? [],
    meta: swr.data?.meta as ListMeta | undefined,
    loading: swr.isLoading,
  };
}

/** Revalidate every cached key under a resource path, e.g. invalidate("/leads"). */
export function invalidate(...paths: string[]) {
  // matcher-only call = revalidate without clearing cached data (no loading flash)
  return globalMutate((key) => typeof key === "string" && paths.some((p) => key.startsWith(`/api/v1${p}`)));
}
