import { Card } from "@/components/ui/primitives";
import { PageHeader } from "@/components/data/blocks";
import { pageSession } from "@/components/pilot/guard";
import { PilotShell } from "@/components/pilot/Shell";
import { Pager, SimpleTable, Timestamp, td } from "@/components/pilot/ui";
import { listAudit } from "@/pilot/queries/portfolio";

export const metadata = { title: "Audit log" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function Audit({ searchParams }: { searchParams: SP }) {
  const s = await pageSession(["admin.read"]);
  if (!s.ok) return s.view;
  const sp = await searchParams;
  const page = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1;
  const r = await listAudit(s.db, { page });
  return (
    <PilotShell actor={s.actor} config={s.config} active="/admin">
      <PageHeader crumbs={[{ label: "Administration", href: "/admin" }, { label: "Audit log" }]} title="Audit log" subtitle="Append-only record of workflow decisions and data refreshes." />
      <Card className="p-4">
        <SimpleTable caption="Audit events" head={["When", "Who", "Action", "Target", "Details"]} empty={!r.rows.length ? <p className="py-6 text-center text-sm text-slate-500">No events yet.</p> : null}>
          {r.rows.map((e, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0 text-xs">
              <td className={td}>
                <Timestamp iso={e.at} />
              </td>
              <td className={td}>{e.actor_name ?? "System"}</td>
              <td className={td}>{e.action}</td>
              <td className={`${td} font-mono`}>
                {e.target_type}
                {e.target_id ? `:${e.target_id}` : ""}
              </td>
              <td className={`${td} max-w-md break-words font-mono text-[10.5px] text-slate-600`}>{e.detail_json ?? ""}</td>
            </tr>
          ))}
        </SimpleTable>
        <Pager page={r.page} pageSize={r.pageSize} total={r.total} hrefFor={(p) => `/admin/audit?page=${p}`} />
      </Card>
    </PilotShell>
  );
}
