import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">404</p>
      <h1 className="mt-1 text-lg font-semibold text-slate-900">This page doesn&apos;t exist</h1>
      <p className="mt-1 text-sm text-slate-500">The link may be outdated, or the record is not part of the demo dataset.</p>
      <Link href="/" className="mt-5 inline-flex h-9 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">
        Back to home
      </Link>
    </div>
  );
}
