"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { userMessage } from "@/components/ui";

export function LoginForm() {
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/login", { email, password, deviceName: navigator.userAgent.slice(0, 80) });
      const next = sp.get("next");
      // only allow same-site relative redirects
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    } catch (err) {
      setError(userMessage(err));
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm">
      <div className="mb-8 lg:hidden">
        <span className="font-display text-3xl font-semibold">LA-VISTA</span>
      </div>
      <h2 className="font-display text-3xl font-semibold">Welcome back</h2>
      <p className="mt-1 text-sm text-muted">Sign in with your email or phone number.</p>
      <div className="mt-8 space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Email or phone
          </label>
          <input id="email" className="input h-11" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={show ? "text" : "password"}
              className="input h-11 pr-10"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600" aria-label="Toggle password">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-60">
          {loading && <Loader2 className="size-4 animate-spin" />}
          Sign in
        </button>
      </div>
      <p className="mt-6 text-xs text-muted">Forgot your password? Ask your admin to reset it from Team → Members.</p>
    </form>
  );
}
