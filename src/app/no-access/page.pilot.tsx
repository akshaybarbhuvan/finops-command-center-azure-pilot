import Link from "next/link";
import { pageSession } from "@/components/pilot/guard";
export default async function NoAccess() {
  const s = await pageSession([]);
  return s.ok ? <p className="p-6 text-sm">Your account has an FCC role. Return to the <Link className="text-brand-700 underline" href="/">home page</Link>.</p> : s.view;
}
