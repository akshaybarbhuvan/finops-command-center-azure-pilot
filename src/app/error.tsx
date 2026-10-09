"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Something went wrong on this page</h1>
      <p className="mt-1 text-sm text-slate-500">Your demo session state is intact. Try again, or use Reset Demo Data from the Administration page.</p>
      <button type="button" onClick={reset} className="mt-5 inline-flex h-9 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">
        Try again
      </button>
    </div>
  );
}
