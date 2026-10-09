"use client";
import { useMemo } from "react";
import { Gauge, Target, TrendingUp, Wallet } from "lucide-react";
import { BudgetBar, SpendTrendChart } from "@/components/charts/charts";
import { ChartCard, ExportButton, KpiGrid, MetricCard, PageHeader } from "@/components/data/blocks";
import { DataTable } from "@/components/data/DataTable";
import { Badge, Card, CardHeader, type Tone } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { allocation, spendBySubscription, spendSummary, spendTrend } from "@/lib/demo/selectors";
import { money, moneyExact, moneySigned, pct, pctSigned } from "@/lib/format";

export function thresholdStatus(forecastPct: number): { label: string; tone: Tone } {
  if (forecastPct >= 100) return { label: "Over budget", tone: "danger" };
  if (forecastPct >= 90) return { label: "At risk (≥ 90%)", tone: "warning" };
  if (forecastPct >= 80) return { label: "Watch (≥ 80%)", tone: "info" };
  return { label: "Within budget", tone: "success" };
}

export function BudgetsForecast() {
  const { ds } = useDemo();
  const m = useMemo(() => ({ sp: spendSummary(ds), subs: spendBySubscription(ds), trend: spendTrend(ds), bus: allocation(ds, "businessUnit") }), [ds]);
  const { sp } = m;
  const counts = m.subs.reduce(
    (a, s) => {
      const p = s.utilizationPct;
      if (p >= 100) a.over++;
      else if (p >= 90) a.risk++;
      else if (p >= 80) a.watch++;
      else a.ok++;
      return a;
    },
    { over: 0, risk: 0, watch: 0, ok: 0 },
  );
  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "Inform" }, { label: "Budgets & Forecast" }]}
        title="Budgets & Forecast"
        subtitle="October budget position by subscription and business unit, with month-end forecast against 80% / 90% / 100% thresholds."
        actions={
          <ExportButton
            rows={m.subs}
            filename="fcc-budgets-october.csv"
            columns={[
              { header: "Subscription", value: (s) => s.name },
              { header: "Business unit", value: (s) => s.businessUnit },
              { header: "Budget (USD)", value: (s) => s.budget },
              { header: "Actual MTD (USD)", value: (s) => Math.round(s.mtd) },
              { header: "Forecast month-end (USD)", value: (s) => Math.round(s.forecast) },
              { header: "Variance (USD)", value: (s) => Math.round(s.variance) },
              { header: "Forecast % of budget", value: (s) => s.utilizationPct.toFixed(1) },
            ]}
          />
        }
      />
      <KpiGrid cols={5}>
        <MetricCard label="October budget" value={sp.budget} format={money} context={`${ds.subscriptions.length} subscription budgets`} icon={<Target className="h-4 w-4" aria-hidden />} accent="slate" />
        <MetricCard label="Actual (MTD)" value={sp.mtd} format={money} context={`${pct(sp.budgetUtilizationPct)} consumed · ${pct((sp.dayOfMonth / sp.daysInMonth) * 100)} of month elapsed`} icon={<Wallet className="h-4 w-4" aria-hidden />} />
        <MetricCard label="Forecast at month-end" value={sp.forecast} format={money} context={`${pct((sp.forecast / sp.budget) * 100)} of budget`} icon={<TrendingUp className="h-4 w-4" aria-hidden />} accent="violet" />
        <MetricCard label="Forecast variance" value={sp.variance} format={moneySigned} context="Forecast minus budget" delta={{ text: pctSigned(sp.variancePct), direction: sp.variance > 0 ? "up" : "down", tone: sp.variance > 0 ? "unfavorable" : "favorable" }} icon={<Gauge className="h-4 w-4" aria-hidden />} accent={sp.variance > 0 ? "amber" : "teal"} />
        <MetricCard label="Subscriptions over budget" value={counts.over} format={(n) => String(Math.round(n))} context={`${counts.risk} at risk ≥ 90% · ${counts.watch} watch ≥ 80%`} icon={<Gauge className="h-4 w-4" aria-hidden />} accent="rose" />
      </KpiGrid>

      <Card>
        <CardHeader
          title="Subscription budget position"
          subtitle="Solid bar = actual MTD · shaded = forecast · markers at 80%, 90% and 100% of budget"
          action={
            <div className="hidden flex-wrap gap-1.5 md:flex">
              <Badge tone="success">Within</Badge>
              <Badge tone="info">≥ 80%</Badge>
              <Badge tone="warning">≥ 90%</Badge>
              <Badge tone="danger">≥ 100%</Badge>
            </div>
          }
        />
        <div className="mt-2">
          <DataTable
            caption="Subscription budget position"
            rows={m.subs}
            rowKey={(s) => s.id}
            pageSize={20}
            initialSort={{ id: "util", dir: "desc" }}
            columns={[
              { id: "name", header: "Subscription", sortValue: (s) => s.name, cell: (s) => <div><div className="font-medium text-slate-900">{s.name}</div><div className="text-[11px] text-slate-500">{s.businessUnit} · {s.owner}</div></div> },
              { id: "budget", header: "Budget", align: "right", sortValue: (s) => s.budget, cell: (s) => moneyExact(s.budget) },
              { id: "mtd", header: "Actual MTD", align: "right", sortValue: (s) => s.mtd, cell: (s) => moneyExact(s.mtd) },
              { id: "fc", header: "Forecast", align: "right", sortValue: (s) => s.forecast, cell: (s) => moneyExact(s.forecast) },
              { id: "var", header: "Variance", align: "right", sortValue: (s) => s.variance, cell: (s) => <span className={s.variance > 0 ? "font-medium text-rose-700" : "text-emerald-700"}>{moneySigned(s.variance)}</span> },
              {
                id: "util",
                header: "Forecast vs budget",
                minWidth: 220,
                sortValue: (s) => s.utilizationPct,
                cell: (s) => {
                  const st = thresholdStatus(s.utilizationPct);
                  return (
                    <div className="flex items-center gap-3">
                      <BudgetBar actualPct={(s.mtd / s.budget) * 100} forecastPct={s.utilizationPct} className="w-28" />
                      <span className="w-12 text-right text-xs font-medium num">{pct(s.utilizationPct, 0)}</span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                  );
                },
              },
            ]}
          />
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-5">
        <ChartCard className="xl:col-span-3" title="Budget vs actual and forecast" subtitle="Monthly · forecast from October">
          <SpendTrendChart data={m.trend} height={280} />
        </ChartCard>
        <Card className="xl:col-span-2">
          <CardHeader title="Business unit rollup" subtitle="October forecast vs budget" />
          <ul className="space-y-3 px-5 py-4">
            {m.bus.map((b) => {
              const p = (b.forecast / b.budget) * 100;
              const st = thresholdStatus(p);
              return (
                <li key={b.key}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-800">{b.key}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 num">
                        {money(b.forecast)} / {money(b.budget)}
                      </span>
                      <Badge tone={st.tone}>{pct(p, 0)}</Badge>
                    </span>
                  </div>
                  <BudgetBar actualPct={((sp.mtd * b.runRate) / sp.runRate / b.budget) * 100} forecastPct={p} className="mt-1.5" />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
