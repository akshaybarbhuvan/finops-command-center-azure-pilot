import Link from "next/link";
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="card max-w-md p-6 text-center">
        <h1 className="text-base font-semibold text-slate-900">Not found</h1>
        <p className="mt-2 text-sm text-slate-600">The page or record does not exist, or it is outside the records your role can access.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-brand-700 underline">
          Go to your home page
        </Link>
      </div>
    </main>
  );
}
