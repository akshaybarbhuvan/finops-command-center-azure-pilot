import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { pageSession } from "./guard";
import { PilotShell } from "./Shell";

/** For product areas that exist in the local demo but have no connected data source in this pilot. */
export async function NotConnected({ title, what }: { title: string; what: string }) {
  const s = await pageSession([]);
  if (!s.ok) return s.view;
  return (
    <PilotShell actor={s.actor} config={s.config} active="">
      <Card className="mx-auto mt-6 max-w-2xl p-6">
        <h1 className="text-base font-semibold text-slate-900">{title}: not connected in this pilot</h1>
        <p className="mt-2 text-sm text-slate-600">{what}</p>
        <p className="mt-2 text-sm text-slate-600">This area is shown with illustrative data only in the local demonstration build. The pilot shows no figures here rather than synthetic ones.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-brand-700 underline">
          Back to your home page
        </Link>
      </Card>
    </PilotShell>
  );
}
