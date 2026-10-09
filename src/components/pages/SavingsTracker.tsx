"use client";
import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { RealizedTrendChart, SavingsFunnel, WaterfallChart } from "@/components/charts/charts";
import { ChartCard, ExportButton, KpiGrid, MetricCard, PageHeader } from "@/components/data/blocks";
import { RecommendationGrid } from "@/components/recommendations/RecommendationTable";
import { Card, Tabs } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { annual, lookup, ownerAccountability, realizedTrend, savingsFunnel, savingsSummary, savingsWaterfall, slaStatus } from "@/lib/demo/selectors";
import { isRealized, STAGE_META } from "@/lib/demo/workflow";
import { money, num, pct } from "@/lib/format";

type T = "realized" | "approved" | "atrisk" | "deferred";

export function SavingsTracker() {
  const { ds } = useDemo();
  const [tab, setTab] = useState<T>("realized");
  const m = useMemo(
    () => ({ s: savingsSummary(ds), wf: savingsWaterfall(ds), funnel: savingsFunnel(ds), trend: realizedTrend(ds), teams: ownerAccountability(ds) }),
    [ds],
  );
  const { s } = m;
  const L = lookup(ds);
  const lists = useMemo(
    () => ({
      realized: ds.recommendations.filter((r) => isRealized(r.stage)),
      approved: ds.recommendations.filter((r) => ["approved", "implemented"].includes(r.stage)),
      atrisk: ds.recommendations.filter((r) => STAGE_META[r.stage].open && ["Breached", "Due soon"].includes(slaStatus(r).status)),
      deferred: ds.recommendations.filter((r) => r.stage === "deferred"),
    }),
    [ds],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "Optimize" }, { label: "Savings" }]}
        title="Savings Tracker"
        subtitle="From potential to realized: how identified opportunities progress through validation, approval and implementation into verified savings."
        actions={
          <ExportButton
            rows={ds.recommendations}
            filename="fcc-savings-pipeline.csv"
            columns={[
              { header: "ID", value: (r) => r.id },
              { header: "Title", value: (r) => r.title },
              { header: "Stage", value: (r) => STAGE_META[r.stage].label },
              { header: "Team", value: (r) => L.teamName(r.teamId) },
              { header: "Owner", value: (r) => L.userName(r.ownerId) },
              { header: "Estimated annual savings (USD)", value: (r) => annual(r) },
              { header: "Verified annual savings (USD)", value: (r) => r.realizedMonthlySavings * 12 },
              { header: "Verified on", value: (r) => r.realizedDate ?? "" },
            ]}
          />
        }
      />

      <div className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          <strong className="font-semibold">Potential</strong> savings are engineering estimates. They become <strong className="font-semibold">realized</strong> only after the change is implemented and FinOps verifies the reduction against billing. All values are annualized run-rates unless noted.
        </p>
      </div>

      <KpiGrid>
        <MetricCard label="Potential savings" value={s.identifiedAnnual} format={money} context={`All identified, excl. rejected · ${num(s.totalCount - s.rejectedCount)} recs`} accent="slate" href="/recommendations" />
        <MetricCard label="Validated" value={s.validatedAnnual} format={money} context={`${pct((s.validatedAnnual / s.identifiedAnnual) * 100, 0)} of potential confirmed by FinOps`} accent="brand" href="/recommendations?stage=validated" />
        <MetricCard label="Approved" value={s.approvedAnnual} format={money} context={`${pct((s.approvedAnnual / s.validatedAnnual) * 100, 0)} of validated approved for change`} accent="violet" href="/recommendations?stage=approved" />
        <MetricCard label="Realized" value={s.realizedAnnual} format={money} context={`Verified · ${money(s.realizedYtdCash)} cash realized YTD`} accent="teal" href="/recommendations?stage=realized" />
        <MetricCard label="At-risk savings" value={s.atRiskAnnual} format={money} context={`${s.atRiskCount} open items past or near SLA`} accent="rose" href="/recommendations?sla=Breached" />
        <MetricCard label="Deferred savings" value={s.deferredAnnual} format={money} context={`${s.deferredCount} deferred · ${money(s.rejectedAnnual)} rejected`} accent="amber" href="/recommendations?stage=deferred" />
      </KpiGrid>

      <div className="grid gap-5 xl:grid-cols-5">
        <ChartCard
          className="xl:col-span-3"
          title="Savings waterfall"
          subtitle="Where identified value sits today, from potential to realized (annualized)"
          summary={m.wf.map((w) => `${w.name}: ${money(w.value)}`).join("; ")}
          footer="Grey steps show value still in the pipeline or not pursued; teal is verified, realized savings."
        >
          <WaterfallChart steps={m.wf} height={320} />
        </ChartCard>
        <ChartCard className="xl:col-span-2" title="Pipeline conversion" subtitle="Cumulative value reaching each stage">
          <div className="pt-3">
            <SavingsFunnel stages={m.funnel} />
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <ChartCard className="xl:col-span-3" title="Realized savings over time" subtitle="Annualized savings verified per month and cumulative run-rate (2026)">
          <RealizedTrendChart data={m.trend} />
        </ChartCard>
        <Card className="xl:col-span-2">
          <div className="px-5 pt-4">
            <h2 className="text-[15px] font-semibold text-slate-900">Delivery by team</h2>
            <p className="text-xs text-slate-500">Open pipeline vs realized (annualized)</p>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Savings delivery by team</caption>
              <thead className="border-y border-line bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-2 text-left">Team</th>
                  <th scope="col" className="px-3 py-2 text-right">Open</th>
                  <th scope="col" className="px-3 py-2 text-right">Realized</th>
                  <th scope="col" className="px-5 py-2 text-right">Past SLA</th>
                </tr>
              </thead>
              <tbody>
                {m.teams.map((t) => (
                  <tr key={t.teamId} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-2 text-slate-800">{t.team}</td>
                    <td className="px-3 py-2 text-right num">{money(t.annual)}</td>
                    <td className="px-3 py-2 text-right font-medium text-emerald-700 num">{money(t.realized)}</td>
                    <td className="px-5 py-2 text-right num">{t.overdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <Tabs<T>
          className="px-3"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "realized", label: "Realized", count: lists.realized.length },
            { id: "approved", label: "Approved & implementing", count: lists.approved.length },
            { id: "atrisk", label: "At risk", count: lists.atrisk.length },
            { id: "deferred", label: "Deferred", count: lists.deferred.length },
          ]}
        />
        <RecommendationGrid rows={lists[tab]} caption={`Savings — ${tab}`} pageSize={10} />
      </Card>
    </div>
  );
}
