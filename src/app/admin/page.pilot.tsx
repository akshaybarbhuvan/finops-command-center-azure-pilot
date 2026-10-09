import Link from "next/link";
import { readFileSync } from "node:fs";
import { Card, CardHeader, KeyValue } from "@/components/ui/primitives";
import { PageHeader } from "@/components/data/blocks";
import { pageSession } from "@/components/pilot/guard";
import { PilotShell } from "@/components/pilot/Shell";
import { SyncButton } from "@/components/pilot/SyncButton";
import { ConnectorBadge, SimpleTable, Timestamp, shortSub, td } from "@/components/pilot/ui";
import { can } from "@/pilot/auth/permissions";
import { describeScope } from "@/pilot/config";
import { connectorHealth, listUsers, recentRuns } from "@/pilot/queries/portfolio";
import { ADVISOR_API } from "@/pilot/azure/advisor";
import { COST_MANAGEMENT_API } from "@/pilot/azure/costManagement";
import { RESOURCE_GRAPH_API } from "@/pilot/azure/resourceGraph";

export const metadata = { title: "Administration" };
const SOURCE = { inventory: "Resource Graph", cost: "Cost Management", advisor: "Advisor" } as const;

export default async function Admin() {
  const s = await pageSession(["admin.read"]);
  if (!s.ok) return s.view;
  const [health, runs, users] = await Promise.all([connectorHealth(s.db, s.config), recentRuns(s.db), listUsers(s.db)]);
  const scope = describeScope(s.config);
  let release = "local build (no release marker)";
  try {
    release = readFileSync(".fcc-version", "utf8").trim().slice(0, 64) || release;
  } catch {
    /* .fcc-version is written by the deployment workflow */
  }
  return (
    <PilotShell actor={s.actor} config={s.config} active="/admin">
      <PageHeader title="Administration" subtitle="Connector health, configuration summary, users and audit. Administrators cannot perform workflow or savings decisions." actions={can(s.actor, "sync.trigger") ? <SyncButton /> : null} />
      <Card>
        <CardHeader title="Configuration (non-secret summary)" />
        <div className="px-5 pb-5">
          <KeyValue
            cols={3}
            items={[
              { label: "Deployed release", value: <span className="font-mono text-xs">{release}</span> },
              { label: "Approved subscriptions", value: `${scope.subscriptionCount}: ${scope.subscriptions.join(", ")}` },
              { label: "Advisor categories", value: scope.advisorCategories.join(", ") },
              { label: "Database", value: scope.database },
              { label: "Scheduled refresh", value: scope.scheduledSync },
              { label: "Sign-in", value: s.config.authMode === "appservice" ? "App Service Authentication (Microsoft Entra ID)" : "Development principal (next dev only)" },
              { label: "API versions", value: `Resource Graph ${RESOURCE_GRAPH_API} · Cost Management ${COST_MANAGEMENT_API} · Advisor ${ADVISOR_API}` },
            ]}
          />
        </div>
      </Card>
      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Connector health by subscription</h2>
        <SimpleTable caption="Connector health" head={["Source", "Subscription", "Status", "Last attempt", "Last success", "Duration", "Records", "Error"]}>
          {health.map((h) => (
            <tr key={`${h.source}-${h.scope}`} className="border-b border-slate-100 last:border-0">
              <td className={td}>{SOURCE[h.source]}</td>
              <td className={`${td} font-mono text-xs`}>{shortSub(h.scope)}</td>
              <td className={td}>
                <ConnectorBadge status={h.status} />
              </td>
              <td className={`${td} text-xs`}>
                <Timestamp iso={h.lastAttemptAt} />
              </td>
              <td className={`${td} text-xs`}>
                <Timestamp iso={h.lastSuccessAt} />
              </td>
              <td className={`${td} text-xs`}>{h.lastDurationMs !== null ? `${Math.round(h.lastDurationMs / 1000)} s` : "—"}</td>
              <td className={`${td} num text-xs`}>{h.lastRecords ?? "—"}</td>
              <td className={`${td} text-xs text-slate-600`}>{h.errorClass ? `${h.errorClass}: ${h.errorDetail ?? ""}` : "—"}</td>
            </tr>
          ))}
        </SimpleTable>
      </Card>
      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Recent refresh runs</h2>
        <SimpleTable caption="Recent runs" head={["Started", "Source", "Subscription", "Trigger", "Status", "Read / written", "Error"]} empty={!runs.length ? <p className="py-4 text-sm text-slate-500">No refresh has run yet.</p> : null}>
          {runs.map((r) => (
            <tr key={String(r.id)} className="border-b border-slate-100 last:border-0 text-xs">
              <td className={td}>
                <Timestamp iso={String(r.started_at)} />
              </td>
              <td className={td}>{SOURCE[r.source as keyof typeof SOURCE]}</td>
              <td className={`${td} font-mono`}>{shortSub(String(r.scope))}</td>
              <td className={td}>{String(r.trigger_kind)}</td>
              <td className={td}>{String(r.status)}</td>
              <td className={`${td} num`}>
                {String(r.records_read)} / {String(r.records_written)}
              </td>
              <td className={`${td} text-slate-600`}>{r.error_class ? `${String(r.error_class)}: ${String(r.error_detail ?? "")}` : "—"}</td>
            </tr>
          ))}
        </SimpleTable>
      </Card>
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Users seen by FCC</h2>
          <Link href="/admin/audit" className="text-sm font-medium text-brand-700 hover:underline">
            Audit log →
          </Link>
        </div>
        <p className="mb-2 text-xs text-slate-500">Roles are managed in Microsoft Entra ID (app-role assignments) and refreshed at each sign-in. FCC cannot grant roles.</p>
        <SimpleTable caption="Users" head={["Name", "Email", "Roles", "First seen", "Last seen"]}>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-slate-100 last:border-0 text-xs">
              <td className={td}>{u.display_name}</td>
              <td className={td}>{u.email ?? "—"}</td>
              <td className={td}>{u.roles || "none"}</td>
              <td className={td}>
                <Timestamp iso={u.first_seen_at} />
              </td>
              <td className={td}>
                <Timestamp iso={u.last_seen_at} />
              </td>
            </tr>
          ))}
        </SimpleTable>
      </Card>
    </PilotShell>
  );
}
