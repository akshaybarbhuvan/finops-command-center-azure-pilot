"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCheck, ClipboardCheck, Hourglass, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { AgingChart, RankedBars, SavingsFunnel, SpendTrendChart } from "@/components/charts/charts";
import { ChartCard, ExportButton, InsightPanel, KpiGrid, MetricCard, PageHeader } from "@/components/data/blocks";
import { AnomalyStatusBadge } from "@/components/data/badges";
import { RecFilterBar } from "@/components/recommendations/RecFilterBar";
import { RecommendationGrid } from "@/components/recommendations/RecommendationTable";
import { ButtonLink, Card, CardHeader, Progress, Tabs } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { applyRecFilters, filtersFromParams, filtersToQuery, type RecFilters } from "@/lib/demo/filters";
import { recallQuery, rememberQuery } from "@/lib/hooks/filter-memory";
import { agingBuckets, annual, anomalyImpact, commitmentSummary, lookup, ownerAccountability, savingsFunnel, savingsSummary, spendTrend, stageDistribution } from "@/lib/demo/selectors";
import { finopsInsights } from "@/lib/demo/insights";
import { STAGE_META } from "@/lib/demo/workflow";
import { money, num, pct } from "@/lib/format";

type Q = "validate" | "assign" | "approve" | "verify";

export function FinOpsWorkbench() {
  const { ds } = useDemo();
  // Filters survive navigating into a recommendation and back (per-tab session memory).
  const [filters, setFilters] = useState<RecFilters>(() => filtersFromParams(new URLSearchParams(recallQuery("/finops"))));
  useEffect(() => rememberQuery("/finops", filtersToQuery(filters)), [filters]);
  const [queue, setQueue] = useState<Q>("validate");
  const L = lookup(ds);

  const m = useMemo(() => {
    const recs = applyRecFilters(ds, ds.recommendations, filters);
    const fds = { ...ds, recommendations: recs };
    return {
      recs,
      s: savingsSummary(fds),
      funnel: savingsFunnel(fds),
      stages: stageDistribution(fds),
      aging: agingBuckets(fds),
      teams: ownerAccountability(fds),
      insights: finopsInsights(ds),
      trend: spendTrend(ds),
      cm: commitmentSummary(ds),
    };
  }, [ds, filters]);
  const { s } = m;
  const q = filtersToQuery(filters);
  const join = (extra: string) => (q ? `${q}&${extra}` : `?${extra}`);

  const queues: Record<Q, typeof m.recs> = {
    validate: m.recs.filter((r) => r.stage === "identified"),
    assign: m.recs.filter((r) => r.stage === "validated"),
    approve: m.recs.filter((r) => r.stage === "submitted"),
    verify: m.recs.filter((r) => r.stage === "implemented"),
  };
  const sumA = (xs: typeof m.recs) => xs.reduce((a, r) => a + annual(r), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "Command" }, { label: "FinOps Workbench" }]}
        title="FinOps Workbench"
        subtitle="Route, prioritize, share and track the optimization pipeline, then verify realized savings. Change approval stays with the engineering owner's change process."
        actions={
          <ExportButton
            rows={m.recs}
            filename="fcc-finops-workbench.csv"
            columns={[
              { header: "ID", value: (r) => r.id },
              { header: "Title", value: (r) => r.title },
              { header: "Stage", value: (r) => STAGE_META[r.stage].label },
              { header: "Category", value: (r) => r.category },
              { header: "Team", value: (r) => L.teamName(r.teamId) },
              { header: "Owner", value: (r) => L.userName(r.ownerId) },
              { header: "Priority", value: (r) => r.priority },
              { header: "Est. annual savings (USD)", value: (r) => annual(r) },
              { header: "Due", value: (r) => r.dueDate },
            ]}
          />
        }
      />

      <Card className="px-4 py-3">
        <RecFilterBar value={filters} onChange={setFilters} compact resultCount={m.recs.length} totalCount={ds.recommendations.length} />
      </Card>

      <KpiGrid>
        <MetricCard label="Open opportunity" value={s.openAnnual} format={money} context={`${num(s.openCount)} open · ${pct(s.ownedSharePct, 0)} owned`} href={`/recommendations${join("stage=open")}`} icon={<Sparkles className="h-4 w-4" aria-hidden />} />
        <MetricCard label="Awaiting validation" value={sumA(queues.validate)} format={money} context={`${queues.validate.length} identified by FCC rules`} href={`/recommendations${join("stage=identified")}`} icon={<ClipboardCheck className="h-4 w-4" aria-hidden />} accent="slate" />
        <MetricCard label="Awaiting owner" value={sumA(queues.assign)} format={money} context={`${queues.assign.length} validated, unassigned`} href={`/recommendations${join("stage=validated")}`} icon={<Layers className="h-4 w-4" aria-hidden />} accent="amber" />
        <MetricCard label="In delivery" value={s.inProgressAnnual} format={money} context="Assigned, in progress or submitted" href={`/recommendations${join("stage=in_progress")}`} icon={<Hourglass className="h-4 w-4" aria-hidden />} accent="violet" />
        <MetricCard label="Awaiting verification" value={sumA(queues.verify)} format={money} context={`${queues.verify.length} implemented changes`} href={`/recommendations${join("stage=implemented")}`} icon={<ShieldCheck className="h-4 w-4" aria-hidden />} accent="brand" />
        <MetricCard label="Realized" value={s.realizedAnnual} format={money} context={`${s.realizedCount} verified · ${money(s.realizedYtdCash)} YTD`} href={`/recommendations${join("stage=realized")}`} icon={<CheckCheck className="h-4 w-4" aria-hidden />} accent="teal" />
      </KpiGrid>

      <InsightPanel insights={m.insights} title="Portfolio signals" compact />

      <Card>
        <CardHeader title="Work queues" subtitle="Select a row to review and act without leaving the workbench" />
        <Tabs<Q>
          className="mt-2 px-3"
          value={queue}
          onChange={setQueue}
          tabs={[
            { id: "validate", label: `Validate · ${money(sumA(queues.validate))}`, count: queues.validate.length },
            { id: "assign", label: `Assign · ${money(sumA(queues.assign))}`, count: queues.assign.length },
            { id: "approve", label: `Approve · ${money(sumA(queues.approve))}`, count: queues.approve.length },
            { id: "verify", label: `Verify · ${money(sumA(queues.verify))}`, count: queues.verify.length },
          ]}
        />
        <RecommendationGrid rows={queues[queue]} caption={`${queue} queue`} pageSize={8} selectable exportName="finops-queue-selected" emptyTitle="Queue is clear" emptyBody="Nothing waiting at this step for the current filters." />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Workload by lifecycle stage" subtitle="Count and annualized value — select a stage to drill in">
          <div className="pt-2">
            <RankedBars
              format={(v) => `${num(v)} recs`}
              color="#0EA5E9"
              items={m.stages.map((st) => ({ label: st.label, value: st.count, sub: `${money(st.annual)}/yr`, href: `/recommendations${join(`stage=${st.stage}`)}` }))}
            />
          </div>
        </ChartCard>
        <div className="grid gap-5">
          <ChartCard title="Pipeline conversion" subtitle="Filtered portfolio · annualized">
            <div className="pt-2">
              <SavingsFunnel stages={m.funnel} />
            </div>
          </ChartCard>
          <ChartCard title="Aging & SLA" subtitle="Open recommendations by age">
            <AgingChart data={m.aging} height={200} />
          </ChartCard>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Ownership & accountability" subtitle="Open savings by owning team" action={<ButtonLink href="/recommendations?owner=unassigned&stage=open" size="sm" variant="ghost">Unassigned</ButtonLink>} />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Open savings by owning team</caption>
              <thead className="border-y border-line bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-2 text-left">Team</th>
                  <th scope="col" className="px-3 py-2 text-right">Open</th>
                  <th scope="col" className="px-3 py-2 text-right">Open value</th>
                  <th scope="col" className="px-3 py-2 text-left">Owned share</th>
                  <th scope="col" className="px-3 py-2 text-right">Past SLA</th>
                  <th scope="col" className="px-5 py-2 text-right">Realized</th>
                </tr>
              </thead>
              <tbody>
                {m.teams.map((t) => {
                  const owned = t.annual ? ((t.annual - t.unowned) / t.annual) * 100 : 100;
                  return (
                    <tr key={t.teamId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-5 py-2.5">
                        <Link href={`/recommendations?team=${t.teamId}&stage=open`} className="font-medium text-slate-800 hover:text-brand-700">
                          {t.team}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-right num">{t.open}</td>
                      <td className="px-3 py-2.5 text-right font-medium num">{money(t.annual)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Progress value={owned} tone={owned >= 70 ? "success" : owned >= 40 ? "warning" : "danger"} className="w-20" label={`${t.team} owned share`} />
                          <span className="text-xs text-slate-500 num">{pct(owned, 0)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right num">{t.overdue > 0 ? <span className="font-medium text-rose-700">{t.overdue}</span> : 0}</td>
                      <td className="px-5 py-2.5 text-right text-emerald-700 num">{money(t.realized)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="grid gap-5">
          <Card>
            <CardHeader title="Commitments" subtitle="Illustrative reservation & savings plan position" action={<ButtonLink href="/optimization?tab=commitments" size="sm" variant="ghost">Open</ButtonLink>} />
            <div className="grid grid-cols-2 gap-4 px-5 py-4">
              <div>
                <div className="text-xs text-slate-500">Coverage</div>
                <div className="text-lg font-semibold num">{pct(m.cm.coveragePct)}</div>
                <Progress value={m.cm.coveragePct} className="mt-1" label="Commitment coverage" />
              </div>
              <div>
                <div className="text-xs text-slate-500">Utilization</div>
                <div className="text-lg font-semibold num">{pct(m.cm.utilizationPct)}</div>
                <Progress value={m.cm.utilizationPct} tone="success" className="mt-1" label="Commitment utilization" />
              </div>
              <div className="col-span-2 text-xs text-slate-500">
                {money(m.cm.onDemandExposure)}/mo on-demand exposure · {m.cm.underutilized.length} commitments under 80%
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Open anomalies" action={<ButtonLink href="/anomalies" size="sm" variant="ghost">Triage</ButtonLink>} />
            <ul className="mt-2 divide-y divide-slate-100 border-t border-line">
              {ds.anomalies
                .filter((a) => a.status !== "Resolved")
                .slice(0, 4)
                .map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800">{a.service}</div>
                      <div className="truncate text-xs text-slate-500">
                        {L.subName(a.subscriptionId)} · +{pct(anomalyImpact(a).deviationPct, 0)}
                      </div>
                    </div>
                    <AnomalyStatusBadge status={a.status} />
                  </li>
                ))}
            </ul>
          </Card>
        </div>
      </div>

      <ChartCard title="Portfolio spend vs budget" subtitle="Monthly Azure spend with forecast and budget" action={<ButtonLink href="/cost" size="sm" variant="ghost">Cost & spend</ButtonLink>}>
        <SpendTrendChart data={m.trend} height={260} />
      </ChartCard>
    </div>
  );
}
