"use client";
export default function PilotError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="card max-w-md p-6">
        <h1 className="text-base font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600">The page could not be loaded. No data was changed. {error.digest ? `Reference: ${error.digest}.` : ""}</p>
        <button type="button" onClick={reset} className="mt-4 text-sm font-medium text-brand-700 underline">
          Try again
        </button>
      </div>
    </main>
  );
}
