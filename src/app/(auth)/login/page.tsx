import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(197,150,79,0.35),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(149,101,44,0.3),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand-500 font-display text-xl font-bold">LV</span>
            <span className="font-display text-2xl font-semibold tracking-wide">LA-VISTA</span>
          </div>
          <div className="max-w-md">
            <h1 className="font-display text-5xl font-semibold leading-[1.05]">From first enquiry to final handover.</h1>
            <p className="mt-5 text-base leading-relaxed text-stone-300">
              Leads, site visits, 2D/3D designs, quotations, contractors, materials, daily tasks and site-wise accounts — in one place.
            </p>
          </div>
          <p className="text-xs text-stone-500">© LA-VISTA Interiors</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
