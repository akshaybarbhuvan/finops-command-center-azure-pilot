"use client";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarDays, Layers, TrendingUp, Wallet } from "lucide-react";
import { DailySpendChart, RankedBars, SpendTrendChart } from "@/components/charts/charts";
import { ChartCard, ExportButton, InsightPanel, KpiGrid, MetricCard, PageHeader } from "@/components/data/blocks";
import { DataTable } from "@/components/data/DataTable";
import { EnvBadge } from "@/components/data/badges";
import { Card, CardHeader, SegmentedControl, Tabs, cx } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { allocation, dailySpend, spendByCategory, spendBySubscription, spendSummary, spendTrend, type AllocationDimension } from "@/lib/demo/selectors";
import { spendInsights } from "@/lib/demo/insights";
import { money, moneySigned, num, pct, pctSigned } from "@/lib/format";

type T = "overview" | "allocation";
const DIMS: { id: AllocationDimension; label: string }[] = [
  { id: "businessUnit", label: "Business unit" },
  { id: "application", label: "Application" },
  { id: "costCenter", label: "Cost center" },
  { id: "subscription", label: "Subscription" },
  { id: "environment", label: "Environment" },
  { id: "team", label: "Owner team" },
];

export function CostSpend() {
  const params = useSearchParams();
  const [tab, setTab] = useState<T>(params.get("tab") === "allocation" ? "allocation" : "overview");
  return (
    <div className="space-y-5">
      <PageHeader crumbs={[{ label: "Inform" }, { label: "Cost & Spend" }]} title="Cost & Spend" subtitle="Where the money goes — trend, run-rate, category mix, and showback from Azure spend to accountable owners." />
      <Tabs<T> value={tab} onChange={setTab} tabs={[{ id: "overview", label: "Spend overview" }, { id: "allocation", label: "Allocation & showback" }]} />
      {tab === "overview" ? <Overview /> : <Allocation />}
    </div>
  );
}

function Overview() {
  const { ds } = useDemo();
  const m = useMemo(() => ({ sp: spendSummary(ds), trend: spendTrend(ds), daily: dailySpend(ds), cats: spendByCategory(ds), subs: spendBySubscription(ds), insights: spendInsights(ds) }), [ds]);
  const { sp } = m;
  return (
    <div className="space-y-5">
      <KpiGrid cols={4}>
        <MetricCard label="Month-to-date" value={sp.mtd} format={money} context={`Oct 1–7 · ${pct(sp.budgetUtilizationPct)} of monthly budget`} delta={{ text: `${pctSigned(sp.mtdChangePct)} vs Sep 1–7`, direction: sp.mtdChangePct >= 0 ? "up" : "down", tone: sp.mtdChangePct > 1 ? "unfavorable" : "neutral" }} icon={<Wallet className="h-4 w-4" aria-hidden />} />
        <MetricCard label="Monthly run-rate" value={sp.runRate} format={money} context={`${money(sp.annualizedRunRate)} annualized`} icon={<TrendingUp className="h-4 w-4" aria-hidden />} accent="violet" />
        <MetricCard label="Last month (Sep)" value={sp.lastMonth} format={money} context="Closed month actual" icon={<CalendarDays className="h-4 w-4" aria-hidden />} accent="slate" />
        <MetricCard label="Trailing 12 months" value={sp.ttm} format={money} context="Nov 2025 – Oct 2026 (Oct forecast)" icon={<Layers className="h-4 w-4" aria-hidden />} accent="teal" />
      </KpiGrid>
      <InsightPanel insights={m.insights} title="Spend signals" compact />
      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Monthly spend, forecast and budget" subtitle="Nov 2025 – Dec 2026">
          <SpendTrendChart data={m.trend} height={300} />
        </ChartCard>
        <ChartCard title="Daily spend — October" subtitle="Versus the same day last month">
          <DailySpendChart data={m.daily} height={300} />
        </ChartCard>
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard className="lg:col-span-2" title="Run-rate by category" subtitle="Monthly · share of total and 3-month growth">
          <div className="pt-2">
            <RankedBars items={m.cats.map((c) => ({ label: c.category, value: c.runRate, sub: `${pct(c.share)} of spend · ${pctSigned(c.growth3mPct)} over 3 months` }))} />
          </div>
        </ChartCard>
        <Card className="lg:col-span-3">
          <CardHeader
            title="Subscriptions"
            subtitle="Run-rate, forecast and budget position"
            action={
              <ExportButton
                size="sm"
                rows={m.subs}
                filename="fcc-subscription-spend.csv"
                columns={[
                  { header: "Subscription", value: (s) => s.name },
                  { header: "Business unit", value: (s) => s.businessUnit },
                  { header: "Environment", value: (s) => s.environment },
                  { header: "Run-rate (USD/mo)", value: (s) => Math.round(s.runRate) },
                  { header: "Forecast (USD)", value: (s) => Math.round(s.forecast) },
                  { header: "Budget (USD)", value: (s) => s.budget },
                  { header: "Variance (USD)", value: (s) => Math.round(s.variance) },
                ]}
              />
            }
          />
          <div className="mt-2">
            <DataTable
              dense
              caption="Subscription spend"
              rows={m.subs}
              rowKey={(s) => s.id}
              pageSize={14}
              initialSort={{ id: "rr", dir: "desc" }}
              columns={[
                { id: "name", header: "Subscription", sortValue: (s) => s.name, cell: (s) => <div><div className="font-medium text-slate-900">{s.name}</div><div className="text-[11px] text-slate-500">{s.businessUnit}</div></div> },
                { id: "env", header: "Env", cell: (s) => <EnvBadge env={s.environment} /> },
                { id: "rr", header: "Run-rate", align: "right", sortValue: (s) => s.runRate, cell: (s) => money(s.runRate) },
                { id: "fc", header: "Forecast", align: "right", sortValue: (s) => s.forecast, cell: (s) => money(s.forecast) },
                { id: "var", header: "vs Budget", align: "right", sortValue: (s) => s.variance, cell: (s) => <span className={s.variance > 0 ? "font-medium text-rose-700" : "text-emerald-700"}>{moneySigned(s.variance)}</span> },
              ]}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Allocation() {
  const { ds } = useDemo();
  const [dim, setDim] = useState<AllocationDimension>("businessUnit");
  const rows = useMemo(() => allocation(ds, dim), [ds, dim]);
  const total = rows.reduce((s, r) => s + r.runRate, 0);
  const label = DIMS.find((d) => d.id === dim)!.label;
  const unalloc = rows.find((r) => r.key === "Unallocated" || r.key === "No owner");
  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="text-sm text-slate-600">
          Showback of <strong className="font-semibold text-slate-900 num">{money(total)}</strong>/mo run-rate by <strong className="font-semibold text-slate-900">{label.toLowerCase()}</strong>
          {unalloc && <span className="ml-2 text-amber-700">· {money(unalloc.runRate)} cannot be attributed ({unalloc.key.toLowerCase()})</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl label="Allocation dimension" value={dim} onChange={setDim} options={DIMS} />
          <ExportButton
            size="sm"
            rows={rows}
            filename={`fcc-showback-${dim}.csv`}
            columns={[
              { header: label, value: (r) => r.key },
              { header: "Run-rate (USD/mo)", value: (r) => Math.round(r.runRate) },
              { header: "Budget (USD/mo)", value: (r) => Math.round(r.budget) },
              { header: "Forecast (USD)", value: (r) => Math.round(r.forecast) },
              { header: "Variance (USD)", value: (r) => Math.round(r.variance) },
              { header: "Open optimization (USD/yr)", value: (r) => Math.round(r.opportunity) },
              { header: "Resources", value: (r) => r.resources },
            ]}
          />
        </div>
      </Card>
      <div className="grid gap-5 xl:grid-cols-5">
        <ChartCard className="xl:col-span-2" title={`Spend by ${label.toLowerCase()}`} subtitle="Monthly run-rate · top 10">
          <div className="pt-2">
            <RankedBars color="#0EA5A4" items={rows.slice(0, 10).map((r) => ({ label: r.key, value: r.runRate, sub: `${pct((r.runRate / total) * 100)} of total · ${num(r.resources)} resources` }))} />
          </div>
        </ChartCard>
        <Card className="xl:col-span-3">
          <CardHeader title="Showback statement" subtitle="Spend, budget, forecast, variance and optimization opportunity — illustrative; no accounting system integration" />
          <div className="mt-2">
            <DataTable
              dense
              caption={`Showback by ${label}`}
              rows={rows}
              rowKey={(r) => r.key}
              pageSize={12}
              initialSort={{ id: "rr", dir: "desc" }}
              rowClassName={(r) => (r.key === "Unallocated" || r.key === "No owner" ? "bg-amber-50/60" : undefined)}
              columns={[
                { id: "key", header: label, sortValue: (r) => r.key, cell: (r) => <span className="font-medium text-slate-900">{r.key}</span> },
                { id: "rr", header: "Spend", align: "right", sortValue: (r) => r.runRate, cell: (r) => money(r.runRate) },
                { id: "budget", header: "Budget", align: "right", sortValue: (r) => r.budget, cell: (r) => money(r.budget) },
                { id: "fc", header: "Forecast", align: "right", sortValue: (r) => r.forecast, cell: (r) => money(r.forecast) },
                { id: "var", header: "Variance", align: "right", sortValue: (r) => r.variance, cell: (r) => <span className={cx(r.variance > 0 ? "font-medium text-rose-700" : "text-emerald-700")}>{moneySigned(r.variance)}</span> },
                { id: "opp", header: "Optimization", align: "right", sortValue: (r) => r.opportunity, cell: (r) => <span className="text-brand-700">{money(r.opportunity)}/yr</span> },
              ]}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
