import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/primitives";
import { PageHeader } from "@/components/data/blocks";
import { pageSession } from "@/components/pilot/guard";
import { PilotShell } from "@/components/pilot/Shell";
import { RecTable } from "@/components/pilot/RecTable";
import { SyncButton } from "@/components/pilot/SyncButton";
import { ConnectorBadge } from "@/components/pilot/ui";
import { listRecommendations } from "@/pilot/queries/recommendations";
import { connectorHealth, worstStatus } from "@/pilot/queries/portfolio";

export const metadata = { title: "FinOps Workbench" };

export default async function FinOps() {
  const s = await pageSession(["workflow.finops"]);
  if (!s.ok) return s.view;
  const q = (stage: string) => listRecommendations(s.db, s.actor, { stage, pageSize: 25, approvedSubscriptions: s.config.subscriptionIds });
  const [toValidate, toAssign, toVerify, health] = await Promise.all([q("identified"), q("validated"), q("implemented"), connectorHealth(s.db, s.config)]);
  const section = (title: string, sub: string, r: Awaited<ReturnType<typeof q>>, stage: string) => (
    <Card>
      <CardHeader
        title={`${title} (${r.total.toLocaleString("en-US")})`}
        subtitle={sub}
        action={
          r.total > r.rows.length ? (
            <Link className="text-sm font-medium text-brand-700 hover:underline" href={`/recommendations?stage=${stage}`}>
              View all
            </Link>
          ) : null
        }
      />
      <div className="px-5 pb-5">
        <RecTable rows={r.rows} caption={title} />
      </div>
    </Card>
  );
  return (
    <PilotShell actor={s.actor} config={s.config} active="/finops">
      <PageHeader title="FinOps Workbench" subtitle="Validate, assign and track recommendations, then verify savings with measured evidence. Technical change approval stays with the engineering owner's change process." actions={<SyncButton />} />
      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        {(["cost", "inventory", "advisor"] as const).map((src) => (
          <span key={src} className="flex items-center gap-1.5">
            {src === "cost" ? "Cost" : src === "inventory" ? "Inventory" : "Advisor"} <ConnectorBadge status={worstStatus(health, src)} />
          </span>
        ))}
        <Link href="/admin" className="text-brand-700 hover:underline">
          Connector details
        </Link>
      </div>
      {section("Awaiting verification", "Implemented with evidence. Record a measured verification or a 'not verified' decision.", toVerify, "implemented")}
      {section("To assign", "Validated opportunities without an accountable owner.", toAssign, "validated")}
      {section("To validate", "New from Azure Advisor. Confirm relevance before assigning.", toValidate, "identified")}
    </PilotShell>
  );
}
