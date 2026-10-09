"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, CalendarClock, CircleDollarSign, FileBarChart, Gauge, HandCoins, ListChecks, PiggyBank, ShieldCheck, TrendingUp, UserPlus, Wallet } from "lucide-react";
import { AgingChart, RankedBars, SavingsFunnel, ScoreRing, SpendTrendChart } from "@/components/charts/charts";
import { ChartCard, InsightPanel, KpiGrid, MetricCard, PageHeader } from "@/components/data/blocks";
import { PriorityBadge, StageBadge } from "@/components/data/badges";
import { Badge, ButtonLink, Card, CardHeader, cx } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { SavingsDrillDown } from "@/components/dashboard/SavingsDrillDown";
import {
  agingBuckets,
  allocation,
  annual,
  governanceSummary,
  lookup,
  opportunityByCategory,
  savingsFunnel,
  savingsSummary,
  spendBySubscription,
  spendSummary,
  spendTrend,
  topOpportunities,
} from "@/lib/demo/selectors";
import { executiveInsights } from "@/lib/demo/insights";
import { money, moneySigned, num, pct, pctSigned } from "@/lib/format";

export function ExecutiveOverview() {
  const { ds } = useDemo();
  const m = useMemo(() => {
    const sp = spendSummary(ds);
    const sv = savingsSummary(ds);
    return {
      sp,
      sv,
      trend: spendTrend(ds),
      funnel: savingsFunnel(ds),
      cats: opportunityByCategory(ds),
      top: topOpportunities(ds, 10),
      gov: governanceSummary(ds),
      aging: agingBuckets(ds),
      bus: allocation(ds, "businessUnit"),
      subs: spendBySubscription(ds).slice(0, 6),
      insights: executiveInsights(ds),
      realizedThisMonth: ds.recommendations.filter((r) => r.realizedDate && r.realizedDate >= "2026-10-01").reduce((s, r) => s + r.realizedMonthlySavings * 12, 0),
    };
  }, [ds]);
  const { sp, sv } = m;
  const L = lookup(ds);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={<Badge tone="brand">October 2026 · Month-to-date through Oct 7</Badge>}
        title="Executive Overview"
        subtitle={`Azure spend, savings and accountability across ${ds.subscriptions.length} subscriptions, ${ds.businessUnits.length} business units and ${num(m.gov.activeResources)} resources.`}
        actions={
          <>
            <ButtonLink href="/reports?r=executive" icon={<FileBarChart className="h-4 w-4" aria-hidden />}>
              Executive summary
            </ButtonLink>
            <ButtonLink href="/savings" variant="primary" icon={<PiggyBank className="h-4 w-4" aria-hidden />}>
              Savings tracker
            </ButtonLink>
          </>
        }
      />

      <KpiGrid>
        <MetricCard
          label="MTD spend"
          value={sp.mtd}
          format={money}
          context={`Oct 1–7 · day ${sp.dayOfMonth} of ${sp.daysInMonth}`}
          delta={{ text: `${pctSigned(sp.mtdChangePct)} vs Sep 1–7`, direction: sp.mtdChangePct >= 0 ? "up" : "down", tone: sp.mtdChangePct > 1 ? "unfavorable" : sp.mtdChangePct < -1 ? "favorable" : "neutral" }}
          href="/cost"
          icon={<Wallet className="h-4 w-4" aria-hidden />}
        />
        <MetricCard
          label="Month-end forecast"
          value={sp.forecast}
          format={money}
          context={`Run-rate ${money(sp.runRate)}/mo · ${money(sp.annualizedRunRate)}/yr`}
          delta={{ text: `${pctSigned(sp.forecastVsLastPct)} vs Sep actual`, direction: sp.forecastVsLastPct >= 0 ? "up" : "down", tone: sp.forecastVsLastPct > 1 ? "unfavorable" : "neutral" }}
          href="/budgets"
          icon={<TrendingUp className="h-4 w-4" aria-hidden />}
          accent="violet"
        />
        <MetricCard
          label="Budget variance"
          value={sp.variance}
          format={moneySigned}
          context={`Forecast vs ${money(sp.budget)} October budget`}
          delta={{ text: `${pctSigned(sp.variancePct)} ${sp.variance > 0 ? "over" : "under"} budget`, direction: sp.variance > 0 ? "up" : "down", tone: sp.variance > 0 ? "unfavorable" : "favorable" }}
          href="/budgets"
          icon={<Gauge className="h-4 w-4" aria-hidden />}
          accent={sp.variance > 0 ? "amber" : "teal"}
        />
        <MetricCard
          label="Savings opportunity"
          value={sv.openAnnual}
          format={money}
          context={`Annualized · ${num(sv.openCount)} open recommendations`}
          footnote={`${money(sv.unownedAnnual)} without an owner`}
          href="/optimization"
          icon={<CircleDollarSign className="h-4 w-4" aria-hidden />}
        />
        <MetricCard
          label="Savings realized"
          value={sv.realizedAnnual}
          format={money}
          context={`Verified run-rate · ${money(sv.realizedYtdCash)} realized YTD`}
          delta={m.realizedThisMonth > 0 ? { text: `+${money(m.realizedThisMonth)} this month`, direction: "up", tone: "favorable" } : undefined}
          footnote={m.realizedThisMonth > 0 ? undefined : `${sv.realizedCount} recommendations verified`}
          href="/savings"
          icon={<HandCoins className="h-4 w-4" aria-hidden />}
          accent="teal"
        />
        <MetricCard
          label="Open actions"
          value={sv.openCount}
          format={num}
          context={`${sv.criticalOpen} critical · ${sv.overdueCount} past SLA`}
          delta={{ text: `${money(sv.atRiskAnnual)} at SLA risk`, direction: "flat", tone: sv.atRiskAnnual > 0 ? "unfavorable" : "neutral" }}
          href="/recommendations?stage=open"
          icon={<ListChecks className="h-4 w-4" aria-hidden />}
          accent="slate"
        />
      </KpiGrid>

      <InsightPanel insights={m.insights} />

      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Spend trend, forecast and budget"
          subtitle="Monthly Azure spend · Nov 2025 – Dec 2026 (forecast from October)"
          action={<ButtonLink href="/cost" size="sm" variant="ghost">Details</ButtonLink>}
          summary={`Spend rose from ${money(m.trend[0].actual ?? 0)} in November 2025 to ${money(m.trend[10].actual ?? 0)} in September 2026. October forecast ${money(sp.forecast)} vs budget ${money(sp.budget)}.`}
          footer={<span>Forecast = month-to-date actuals + remaining days at current run-rate. Budget line reflects approved monthly budgets.</span>}
        >
          <SpendTrendChart data={m.trend} height={300} />
        </ChartCard>
        <DecisionsCard />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Savings pipeline" subtitle="Annualized value by lifecycle stage — potential is not realized until verified" action={<ButtonLink href="/savings" size="sm" variant="ghost">Savings</ButtonLink>}>
          <div className="pt-2">
            <SavingsFunnel stages={m.funnel} />
          </div>
        </ChartCard>
        <ChartCard title="Open opportunity by category" subtitle="Annualized estimated savings · lighter segment = unowned" action={<ButtonLink href="/optimization" size="sm" variant="ghost">Optimization</ButtonLink>}>
          <div className="pt-2">
            <RankedBars
              items={m.cats.map((c) => ({
                label: c.category,
                value: c.annual,
                secondary: c.annual - c.unowned,
                sub: `${c.count} recommendations · ${money(c.unowned)} unowned`,
                href: `/recommendations?category=${encodeURIComponent(c.category)}&stage=open`,
              }))}
            />
          </div>
        </ChartCard>
      </div>

      <SavingsDrillDown />

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Top 10 opportunities" subtitle="Largest open recommendations by annualized savings" action={<ButtonLink href="/recommendations?stage=open" size="sm" variant="ghost">View all</ButtonLink>} />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Top 10 open savings opportunities</caption>
              <thead>
                <tr className="border-y border-line bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-5 py-2">Opportunity</th>
                  <th scope="col" className="px-3 py-2">Owner</th>
                  <th scope="col" className="px-3 py-2">Stage</th>
                  <th scope="col" className="px-3 py-2">Priority</th>
                  <th scope="col" className="px-5 py-2 text-right">Annual</th>
                </tr>
              </thead>
              <tbody>
                {m.top.map((r, i) => (
                  <tr key={r.id} className="group border-b border-slate-100 last:border-0 hover:bg-brand-50/30">
                    <td className="px-5 py-2.5">
                      <Link href={`/recommendations/${r.id}`} className="flex items-start gap-3">
                        <span className="mt-0.5 w-4 shrink-0 text-right text-xs font-semibold text-slate-400 num">{i + 1}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-900 group-hover:text-brand-700">{r.title}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {r.id} · {L.subName(r.subscriptionId)}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[13px]">{r.ownerId ? L.userName(r.ownerId) : <Badge tone="warning">Unassigned</Badge>}</td>
                    <td className="px-3 py-2.5">
                      <StageBadge stage={r.stage} />
                    </td>
                    <td className="px-3 py-2.5">
                      <PriorityBadge priority={r.priority} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right font-semibold text-slate-900 num">{money(annual(r))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Governance health" subtitle="Allocation, ownership and hygiene" action={<ButtonLink href="/governance" size="sm" variant="ghost">Governance</ButtonLink>} />
          <div className="flex items-center gap-5 px-5 py-4">
            <ScoreRing value={m.gov.score} label="Governance score" />
            <div className="space-y-2.5 text-sm">
              <div>
                <div className="text-xs text-slate-500">Rating</div>
                <div className={cx("font-semibold", m.gov.score >= 85 ? "text-emerald-700" : m.gov.score >= 70 ? "text-amber-700" : "text-rose-700")}>{m.gov.grade}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Unallocated spend</div>
                <div className="font-semibold text-slate-900 num">
                  {money(m.gov.unallocatedSpend)}/mo <span className="text-xs font-normal text-slate-500">({pct(m.gov.unallocatedPct)})</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Tagging compliance</div>
                <div className="font-semibold text-slate-900 num">{pct(m.gov.taggingCompliancePct)}</div>
              </div>
            </div>
          </div>
          <ul className="space-y-1 border-t border-line px-5 py-3">
            {m.gov.issues
              .filter((i) => i.cost > 0 || i.count > 0)
              .sort((a, b) => a.compliancePct - b.compliancePct)
              .slice(0, 4)
              .map((i) => (
                <li key={i.key}>
                  <Link href={`/governance?issue=${i.key}`} className="flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] hover:bg-slate-50">
                    <span className="text-slate-700">{i.label}</span>
                    <span className="text-slate-500 num">
                      {num(i.count)}
                      {i.cost > 0 && <span className="ml-2 font-medium text-slate-800">{money(i.cost)}/mo</span>}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <ChartCard title="Spend by business unit" subtitle="Monthly run-rate · forecast vs budget" action={<ButtonLink href="/cost?tab=allocation" size="sm" variant="ghost">Showback</ButtonLink>}>
          <div className="pt-2">
            <RankedBars
              items={m.bus.map((b) => ({
                label: b.key,
                value: b.runRate,
                sub: (
                  <span className={b.variance > 0 ? "text-rose-700" : "text-emerald-700"}>
                    {moneySigned(b.variance)} vs budget ({pctSigned(b.variancePct)}) · {money(b.opportunity)}/yr opportunity
                  </span>
                ),
              }))}
            />
          </div>
        </ChartCard>
        <ChartCard title="Top subscriptions" subtitle="Monthly run-rate and budget position" action={<ButtonLink href="/budgets" size="sm" variant="ghost">Budgets</ButtonLink>}>
          <div className="pt-2">
            <RankedBars
              color="#8B5CF6"
              items={m.subs.map((s) => ({
                label: s.name,
                value: s.runRate,
                sub: (
                  <span>
                    {s.businessUnit} ·{" "}
                    <span className={s.variance > 0 ? "font-medium text-rose-700" : "text-emerald-700"}>
                      {pct(s.utilizationPct, 0)} of budget {s.variance > 0 ? "(over)" : ""}
                    </span>
                  </span>
                ),
              }))}
            />
          </div>
        </ChartCard>
        <ChartCard title="Recommendation aging & SLA" subtitle="Open recommendations by age" action={<ButtonLink href="/recommendations?sla=Breached" size="sm" variant="ghost">Past SLA</ButtonLink>} summary={m.aging.map((a) => `${a.bucket}: ${a.total} open, ${a.breached} past SLA`).join("; ")}>
          <AgingChart data={m.aging} height={250} />
        </ChartCard>
      </div>
    </div>
  );
}

export function DecisionsCard() {
  const { ds } = useDemo();
  const L = lookup(ds);
  const sv = savingsSummary(ds);
  const unowned = topOpportunities(ds, 20).filter((r) => !r.ownerId).slice(0, 2);
  const approvals = [...sv.pendingApproval].sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings).slice(0, 3);
  const items = [
    ...unowned.map((r) => ({ id: r.id, kind: "Assign owner", icon: UserPlus, tone: "danger" as const, title: r.title, meta: `${money(annual(r))}/yr · ${L.teamName(r.teamId)} · due ${r.dueDate.slice(5)}`, href: `/recommendations/${r.id}` })),
    ...approvals.map((r) => ({ id: r.id, kind: "Approval", icon: ShieldCheck, tone: "violet" as const, title: r.title, meta: `${money(annual(r))}/yr · ${r.risk} risk · ${L.userName(r.ownerId)}`, href: `/recommendations/${r.id}` })),
  ];
  return (
    <Card className="flex flex-col">
      <CardHeader title="Decisions required" subtitle={`${items.length} items need leadership action`} action={<Badge tone="danger">{sv.overdueCount} past SLA</Badge>} />
      <ul className="mt-3 flex-1 divide-y divide-slate-100 border-t border-line">
        {items.map((i) => (
          <li key={`${i.kind}-${i.id}`}>
            <Link href={i.href} className="group flex items-start gap-3 px-5 py-3 transition hover:bg-slate-50">
              <span className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", i.tone === "danger" ? "bg-rose-50 text-rose-600" : "bg-violet-50 text-violet-600")}>
                <i.icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {i.kind} · {i.id}
                </span>
                <span className="block truncate text-[13px] font-medium text-slate-900 group-hover:text-brand-700">{i.title}</span>
                <span className="block truncate text-xs text-slate-500">{i.meta}</span>
              </span>
              <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-slate-300 group-hover:text-brand-500" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs text-slate-500">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        {sv.pendingApproval.length} approvals pending · {money(sv.unownedAnnual)}/yr unowned
      </div>
    </Card>
  );
}
