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

/** Plain-language fallback when the server didn't send its own message (proxy errors, outages…). */
const STATUS_MESSAGES: Record<number, string> = {
  400: "Some details are not valid. Please check and try again.",
  401: "Your session has ended. Please log in again.",
  403: "You don't have permission to do this. Ask your admin if you need access.",
  404: "This item could not be found. It may have been deleted.",
  408: "The server took too long to answer. Please try again.",
  409: "This conflicts with an existing record.",
  413: "The file is too large to upload. Please choose a smaller file (max 25 MB).",
  422: "Some details are not valid. Please check the form and try again.",
  423: "This account is temporarily locked. Please try again in 15 minutes.",
  429: "Too many requests – please wait a moment and try again.",
  500: "Something went wrong on our side. Please try again.",
  502: "The server is not responding right now. Please try again in a minute.",
  503: "The service is temporarily unavailable. Please try again in a minute.",
  504: "The server took too long to answer. Please try again in a minute.",
};
export const NETWORK_ERROR = "Can't reach the server. Please check your internet connection and try again.";

export function statusMessage(status: number) {
  return STATUS_MESSAGES[status] ?? (status >= 500 ? STATUS_MESSAGES[500] : "Something went wrong. Please try again.");
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
  let res: Response;
  try {
    res = await fetch(path.startsWith("http") || path.startsWith("/api") ? path : `${API}${path}`, {
      ...rest,
      headers,
      credentials: "same-origin",
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiClientError(0, NETWORK_ERROR, "NETWORK_ERROR");
  }

  if (res.status === 401 && retry && !path.includes("/auth/")) {
    if (await refreshSession()) return request<T>(path, init, false);
    toLogin();
    throw new ApiClientError(401, statusMessage(401), "SESSION_EXPIRED");
  }

  let body: { success?: boolean; data?: T; meta?: ListMeta; error?: { message: string; code?: string; details?: [] } } = {};
  try {
    body = await res.json();
  } catch {
    // not JSON – e.g. an nginx error page (502 / 413) in front of the app
    if (!res.ok) throw new ApiClientError(res.status, statusMessage(res.status), "HTTP_" + res.status);
  }
  if (!res.ok || body.success === false) {
    throw new ApiClientError(res.status, body.error?.message || statusMessage(res.status), body.error?.code, body.error?.details);
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
