import { Lock } from "lucide-react";
import type { AppMode } from "@/lib/app-mode";

/**
 * Rendered for every route when APP_MODE is pilot or production.
 * The local demo sign-in, synthetic dataset and local ticketing are never mounted in these modes.
 */
export function PilotGate({ mode }: { mode: AppMode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-900 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-pop">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <Lock className="h-5 w-5" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">FinOps Command Center</h1>
        <p className="mt-1 text-sm text-slate-500">Enterprise FinOps Governance &amp; Optimization Platform</p>
        <p className="mt-5 text-sm text-slate-700">
          This environment is running in <strong className="font-semibold">{mode}</strong> mode. Sign-in through your organization&apos;s single sign-on is required.
        </p>
        <p className="mt-3 text-xs text-slate-500">Local demo sign-in and illustrative data are available only when APP_MODE=demo on a local workstation.</p>
      </div>
    </main>
  );
}
