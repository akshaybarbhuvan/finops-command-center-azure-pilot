import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/primitives";
import { PageHeader } from "@/components/data/blocks";
import { pageSession } from "@/components/pilot/guard";
import { PilotShell } from "@/components/pilot/Shell";
import { ConnectorBadge, CurrencyAmounts, Note, SourceTag, Timestamp } from "@/components/pilot/ui";
import { connectorHealth, costSummary, inventorySummary, pipeline, verifiedSavings, worstStatus } from "@/pilot/queries/portfolio";
import { STAGE_LABEL, STAGES } from "@/pilot/workflow/rules";

export const metadata = { title: "Overview" };

export default async function Overview() {
  const s = await pageSession(["portfolio.read"]);
  if (!s.ok) return s.view;
  const { db, config, actor } = s;
  const [health, cost, pipe, verified, inv] = await Promise.all([connectorHealth(db, config), costSummary(db, config), pipeline(db, config.subscriptionIds), verifiedSavings(db, config.subscriptionIds), inventorySummary(db, config.subscriptionIds)]);
  const sourceRow = (source: "cost" | "inventory" | "advisor", label: string) => {
    const rows = health.filter((h) => h.source === source);
    const lastSuccess = rows.map((r) => r.lastSuccessAt).filter(Boolean).sort()[0] ?? null; // oldest across subscriptions
    return (
      <li key={source} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span className="text-sm font-medium text-slate-800">{label}</span>
        <span className="flex items-center gap-3 text-xs text-slate-500">
          <span>
            Oldest successful refresh: <Timestamp iso={lastSuccess} />
          </span>
          <ConnectorBadge status={worstStatus(health, source)} />
        </span>
      </li>
    );
  };

  return (
    <PilotShell actor={actor} config={config} active="/overview">
      <PageHeader title="Executive Overview" subtitle="Cost, optimization pipeline and verified savings for the approved Azure subscriptions. Read-only." />

      <Card>
        <CardHeader title="Data sources" subtitle="Worst status across approved subscriptions. Figures below reflect the last successful refresh, not real-time billing." />
        <ul className="divide-y divide-slate-100 px-5 pb-3">
          {sourceRow("cost", "Azure Cost Management — cost")}
          {sourceRow("inventory", "Azure Resource Graph — inventory")}
          {sourceRow("advisor", "Azure Advisor — recommendations")}
        </ul>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Azure cost" subtitle={`Subscription scope · ${cost.subscriptionsCovered} of ${cost.subscriptionsApproved} approved subscriptions have cost data`} action={<SourceTag kind="cost" />} />
          <div className="space-y-3 px-5 pb-5">
            {!cost.available ? (
              <Note tone="warning">No cost data has been retrieved yet. Values are shown as unavailable, not as zero.</Note>
            ) : (
              <table className="w-full text-sm">
                <caption className="sr-only">Cost by period and cost basis</caption>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th scope="col" className="py-1.5">Period</th>
                    <th scope="col" className="py-1.5">Actual cost</th>
                    <th scope="col" className="py-1.5">Amortized cost</th>
                  </tr>
                </thead>
                <tbody>
                  {cost.periods.map((p) => (
                    <tr key={p.label} className="border-t border-slate-100 align-top">
                      <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-800">
                        {p.label}
                        <div className="text-[11px] font-normal text-slate-500">
                          {p.from} → {p.to}
                          {p.label.startsWith("Current") ? " (period to date — incomplete)" : p.complete ? "" : " (coverage incomplete)"}
                        </div>
                      </th>
                      <td className="py-2 pr-3">
                        <CurrencyAmounts totals={p.totals.ActualCost} />
                      </td>
                      <td className="py-2">
                        <CurrencyAmounts totals={p.totals.AmortizedCost} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-[11px] text-slate-500">
              Last retrieved: <Timestamp iso={cost.lastRetrievedAt} />. Azure cost data is not real-time; recent days can change as Azure finalizes usage. Charges that Azure does not attribute to a subscription in scope are not included. No forecast is shown: the Cost Management forecast API is not connected in this pilot.
            </p>
            <Link href="/cost" className="text-sm font-medium text-brand-700 hover:underline">
              Daily cost →
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader title="Savings" subtitle="Estimates and verified results are kept separate and are never added together." />
          <dl className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
            <div className="rounded-lg bg-emerald-50 p-3">
              <dt className="text-xs font-medium text-emerald-800">Verified savings (monthly-normalized)</dt>
              <dd className="mt-1 text-lg font-semibold text-slate-900">
                <CurrencyAmounts totals={verified.monthly} empty="None verified yet" />
              </dd>
              <dd className="mt-1 text-[11px] text-emerald-900">
                {verified.count} recommendation(s). FinOps-attested: measured by an independent FinOps reviewer from Cost Management or invoice figures they entered; not automatically reconciled. <Link href="/savings" className="underline">Ledger</Link>
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs font-medium text-slate-700">Open opportunity — Advisor estimate (monthly)</dt>
              <dd className="mt-1 text-lg font-semibold text-slate-900">
                <CurrencyAmounts totals={pipe.estimatedOpenMonthly} empty="No estimates" />
              </dd>
              <dd className="mt-1 text-[11px] text-slate-600">Not achieved savings. Excludes items Advisor no longer returns. {pipe.openWithoutEstimate} open item(s) have no estimate from the source.</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Unassigned estimate</dt>
              <dd className="text-sm font-medium">
                <CurrencyAmounts totals={pipe.estimatedUnassignedMonthly} empty="—" />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Assigned / in delivery estimate</dt>
              <dd className="text-sm font-medium">
                <CurrencyAmounts totals={pipe.estimatedAssignedMonthly} empty="—" />
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Implemented, awaiting verification (estimate)</dt>
              <dd className="text-sm font-medium">
                <CurrencyAmounts totals={pipe.estimatedAwaitingVerificationMonthly} empty="—" />
              </dd>
            </div>
          </dl>
          <div className="space-y-2 px-5 pb-5">
            {pipe.overlappingResources > 0 && (
              <Note tone="warning">{pipe.overlappingResources} resource(s) have more than one open recommendation; Advisor estimates for the same resource can overlap, so the estimate total may overstate the opportunity.</Note>
            )}
            {pipe.notReturnedOpen > 0 && <Note>{pipe.notReturnedOpen} open recommendation(s) were not returned by Advisor at the last complete refresh (resolved, dismissed or no longer applicable at source).</Note>}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recommendation pipeline" subtitle="Counts by workflow stage (all sources)" action={<SourceTag kind="advisor" />} />
          <ul className="grid grid-cols-2 gap-2 px-5 pb-5 sm:grid-cols-3">
            {STAGES.map((st) => (
              <li key={st}>
                <Link href={`/recommendations?stage=${st}`} className="block rounded-lg border border-line px-3 py-2 hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
                  <span className="block text-[11px] text-slate-500">{STAGE_LABEL[st]}</span>
                  <span className="num text-lg font-semibold text-slate-900">{pipe.byStage[st].toLocaleString("en-US")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Inventory" subtitle="Resources currently present in the approved subscriptions" action={<SourceTag kind="graph" />} />
          <div className="px-5 pb-5 text-sm">
            <p className="num text-2xl font-semibold text-slate-900">{inv.present.toLocaleString("en-US")}</p>
            <p className="text-xs text-slate-500">
              {inv.absent.toLocaleString("en-US")} previously seen resource(s) no longer returned. Last seen: <Timestamp iso={inv.lastSeenAt} />
            </p>
            <ul className="mt-3 space-y-1">
              {inv.topTypes.map((t) => (
                <li key={t.type} className="flex justify-between gap-3 text-xs">
                  <span className="truncate text-slate-600">{t.type}</span>
                  <span className="num font-medium">{t.count.toLocaleString("en-US")}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </PilotShell>
  );
}
