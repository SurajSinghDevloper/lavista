"use client";

export const API = "/api/v1";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: { path: string; message: string }[]
  ) {
    super(message);
  }
}

export type ListMeta = { page: number; limit: number; total: number; pages: number; [k: string]: unknown };
export type ApiResult<T> = { data: T; meta?: ListMeta };

let refreshing: Promise<boolean> | null = null;

async function refreshSession() {
  refreshing ??= fetch(`${API}/auth/refresh`, { method: "POST", credentials: "same-origin" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

function toLogin() {
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
  }
}

export async function request<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown; raw?: boolean } = {},
  retry = true
): Promise<ApiResult<T>> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  const res = await fetch(path.startsWith("http") || path.startsWith("/api") ? path : `${API}${path}`, {
    ...rest,
    headers,
    credentials: "same-origin",
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (res.status === 401 && retry && !path.includes("/auth/")) {
    if (await refreshSession()) return request<T>(path, init, false);
    toLogin();
    throw new ApiClientError(401, "Session expired");
  }

  let body: { success?: boolean; data?: T; meta?: ListMeta; error?: { message: string; code?: string; details?: [] } } = {};
  try {
    body = await res.json();
  } catch {
    if (!res.ok) throw new ApiClientError(res.status, `Request failed (${res.status})`);
  }
  if (!res.ok || body.success === false) {
    throw new ApiClientError(res.status, body.error?.message ?? `Request failed (${res.status})`, body.error?.code, body.error?.details);
  }
  return { data: body.data as T, meta: body.meta };
}

export const api = {
  get: <T = unknown>(path: string) => request<T>(path).then((r) => r.data),
  list: <T = unknown>(path: string) => request<T[]>(path),
  post: <T = unknown>(path: string, json?: unknown) => request<T>(path, { method: "POST", json: json ?? {} }).then((r) => r.data),
  patch: <T = unknown>(path: string, json: unknown) => request<T>(path, { method: "PATCH", json }).then((r) => r.data),
  put: <T = unknown>(path: string, json: unknown) => request<T>(path, { method: "PUT", json }).then((r) => r.data),
  del: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }).then((r) => r.data),
  upload: async <T = unknown>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }).then((r) => r.data),
};

/** Build a query string, skipping empty values. */
export function qs(params: Record<string, unknown> = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** download=true forces "save as"; thumb=true returns the small WebP preview (images only). */
export const fileUrl = (id: string, download = false, thumb = false) =>
  `${API}/files/${id}/download${download ? "?download=1" : thumb ? "?thumb=1" : ""}`;
