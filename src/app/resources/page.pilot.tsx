import { Card } from "@/components/ui/primitives";
import { PageHeader } from "@/components/data/blocks";
import { pageSession } from "@/components/pilot/guard";
import { PilotShell } from "@/components/pilot/Shell";
import { Pager, SimpleTable, SourceTag, Timestamp, shortSub, td } from "@/components/pilot/ui";
import { listResources } from "@/pilot/queries/portfolio";

export const metadata = { title: "Resources" };
type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Resources({ searchParams }: { searchParams: SP }) {
  const s = await pageSession(["portfolio.read"]);
  if (!s.ok) return s.view;
  const sp = await searchParams;
  const f = { q: one(sp.q), subscription: one(sp.subscription), type: one(sp.type), present: one(sp.present), page: Number(one(sp.page) ?? 1) || 1 };
  const r = await listResources(s.db, s.config, f);
  const qs = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, page })) if (v) p.set(k, String(v));
    return p.toString();
  };
  return (
    <PilotShell actor={s.actor} config={s.config} active="/resources">
      <PageHeader title="Resources" subtitle="Inventory of the approved subscriptions, keyed by full Azure resource ID." actions={<SourceTag kind="graph" />} />
      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter resources">
          <label className="text-xs font-medium text-slate-600">
            Search
            <input name="q" defaultValue={f.q} className="input mt-1 w-64" placeholder="Name, resource group or ID" maxLength={100} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Type
            <input name="type" defaultValue={f.type} className="input mt-1 w-64" placeholder="microsoft.compute/virtualmachines" maxLength={200} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Status
            <select name="present" defaultValue={f.present ?? ""} className="input mt-1">
              <option value="">Present</option>
              <option value="absent">No longer returned</option>
              <option value="all">All</option>
            </select>
          </label>
          <button type="submit" className="h-9 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
            Apply
          </button>
        </form>
      </Card>
      <Card className="p-4">
        <SimpleTable caption="Resources" head={["Name", "Type", "Resource group", "Location", "Subscription", "Last seen"]} empty={!r.rows.length ? <p className="py-6 text-center text-sm text-slate-500">No resources match, or inventory has not been refreshed yet.</p> : null}>
          {r.rows.map((x) => (
            <tr key={String(x.resource_id)} className="border-b border-slate-100 last:border-0">
              <td className={td}>
                <span className="font-medium text-slate-800">{String(x.name)}</span>
                {Number(x.is_present) === 0 && <span className="ml-2 text-xs text-amber-800">no longer returned</span>}
                <div className="break-all font-mono text-[10.5px] text-slate-400">{String(x.resource_id)}</div>
              </td>
              <td className={td}>{String(x.type)}</td>
              <td className={td}>{x.resource_group ? String(x.resource_group) : "—"}</td>
              <td className={td}>{x.location ? String(x.location) : "—"}</td>
              <td className={`${td} font-mono text-xs`}>{shortSub(String(x.subscription_id))}</td>
              <td className={td}>
                <Timestamp iso={String(x.last_seen_at)} />
              </td>
            </tr>
          ))}
        </SimpleTable>
        <Pager page={r.page} pageSize={r.pageSize} total={r.total} hrefFor={(p) => `/resources?${qs(p)}`} />
      </Card>
    </PilotShell>
  );
}
