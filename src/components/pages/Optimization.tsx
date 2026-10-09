"use client";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Cpu, HardDrive, Handshake, LayoutGrid, Zap } from "lucide-react";
import { RankedBars } from "@/components/charts/charts";
import { ChartCard, ExportButton, KpiGrid, MetricCard, PageHeader } from "@/components/data/blocks";
import { DataTable } from "@/components/data/DataTable";
import { RecommendationGrid } from "@/components/recommendations/RecommendationTable";
import { Badge, Card, CardHeader, Progress, Tabs, cx } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { annual, commitmentSummary, lookup, opportunityByCategory, savingsSummary } from "@/lib/demo/selectors";
import { isOpen, isRealized } from "@/lib/demo/workflow";
import { date, money, moneyExact, num, pct } from "@/lib/format";
import { daysBetween } from "@/lib/demo/seed";
import { AS_OF } from "@/lib/demo/org";
import type { RecCategory, Recommendation } from "@/lib/demo/types";

type T = "overview" | "compute" | "storage" | "commitments";

export function Optimization() {
  const params = useSearchParams();
  const initial = (params.get("tab") as T) || "overview";
  const [tab, setTab] = useState<T>(["overview", "compute", "storage", "commitments"].includes(initial) ? initial : "overview");
  return (
    <div className="space-y-5">
      <PageHeader crumbs={[{ label: "Optimize" }, { label: "Optimization" }]} title="Optimization" subtitle="Where we can save: waste, rightsizing, storage hygiene and commitment opportunities across the estate." />
      <Tabs<T>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "compute", label: "Compute" },
          { id: "storage", label: "Storage" },
          { id: "commitments", label: "Commitments" },
        ]}
      />
      {tab === "overview" && <OverviewTab />}
      {tab === "compute" && <CategoryTab category="Compute" icon={<Cpu className="h-4 w-4" aria-hidden />} />}
      {tab === "storage" && <CategoryTab category="Storage" icon={<HardDrive className="h-4 w-4" aria-hidden />} />}
      {tab === "commitments" && <CommitmentsTab />}
    </div>
  );
}

function OverviewTab() {
  const { ds } = useDemo();
  const m = useMemo(() => {
    const open = ds.recommendations.filter((r) => isOpen(r.stage));
    const quick = open.filter((r) => r.effort === "Low" && r.risk === "Low" && r.confidence >= 85).sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings);
    return { s: savingsSummary(ds), cats: opportunityByCategory(ds), quick, open };
  }, [ds]);
  const quickSum = m.quick.reduce((a, r) => a + annual(r), 0);
  return (
    <div className="space-y-5">
      <KpiGrid cols={4}>
        <MetricCard label="Open opportunity" value={m.s.openAnnual} format={money} context={`${num(m.s.openCount)} recommendations · annualized`} icon={<LayoutGrid className="h-4 w-4" aria-hidden />} href="/recommendations?stage=open" />
        <MetricCard label="Quick wins" value={quickSum} format={money} context={`${m.quick.length} low-risk, low-effort, ≥ 85% confidence`} icon={<Zap className="h-4 w-4" aria-hidden />} accent="teal" />
        <MetricCard label="Compute" value={m.cats.find((c) => c.category === "Compute")?.annual ?? 0} format={money} context={`${m.cats.find((c) => c.category === "Compute")?.count ?? 0} recommendations`} icon={<Cpu className="h-4 w-4" aria-hidden />} accent="violet" href="/optimization?tab=compute" />
        <MetricCard label="Storage" value={m.cats.find((c) => c.category === "Storage")?.annual ?? 0} format={money} context={`${m.cats.find((c) => c.category === "Storage")?.count ?? 0} recommendations`} icon={<HardDrive className="h-4 w-4" aria-hidden />} accent="amber" href="/optimization?tab=storage" />
      </KpiGrid>
      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard className="lg:col-span-2" title="Opportunity by category" subtitle="Open, annualized">
          <div className="pt-2">
            <RankedBars items={m.cats.map((c) => ({ label: c.category, value: c.annual, sub: `${c.count} recommendations`, href: `/recommendations?category=${encodeURIComponent(c.category)}&stage=open` }))} />
          </div>
        </ChartCard>
        <Card className="lg:col-span-3">
          <CardHeader title="Quick wins" subtitle="Low risk · low effort · high confidence — ideal for this sprint" />
          <RecommendationGrid rows={m.quick} caption="Quick wins" pageSize={8} />
        </Card>
      </div>
    </div>
  );
}

function CategoryTab({ category, icon }: { category: RecCategory; icon: React.ReactNode }) {
  const { ds } = useDemo();
  const L = lookup(ds);
  const [type, setType] = useState<string | null>(null);
  const recs = useMemo(() => ds.recommendations.filter((r) => r.category === category && r.stage !== "rejected"), [ds, category]);
  const groups = useMemo(() => {
    const m = new Map<string, Recommendation[]>();
    for (const r of recs) m.set(r.type, [...(m.get(r.type) ?? []), r]);
    return [...m.entries()]
      .map(([t, rs]) => {
        const open = rs.filter((r) => isOpen(r.stage));
        const teams = new Map<string, number>();
        for (const r of open) teams.set(r.teamId, (teams.get(r.teamId) ?? 0) + annual(r));
        const topTeam = [...teams.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
          type: t,
          resources: new Set(rs.map((r) => r.resourceId)).size,
          open: open.length,
          openAnnual: open.reduce((a, r) => a + annual(r), 0),
          critical: open.filter((r) => r.priority === "Critical" || r.priority === "High").length,
          unowned: open.filter((r) => !r.ownerId).length,
          inDelivery: open.filter((r) => !["identified", "validated"].includes(r.stage)).length,
          realized: rs.filter((r) => isRealized(r.stage)).reduce((a, r) => a + r.realizedMonthlySavings * 12, 0),
          topTeam: topTeam ? L.teamName(topTeam[0]) : "—",
        };
      })
      .sort((a, b) => b.openAnnual - a.openAnnual);
  }, [recs, L]);
  const list = recs.filter((r) => isOpen(r.stage) && (!type || r.type === type));
  const total = groups.reduce((a, g) => a + g.openAnnual, 0);
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              {icon}
              {category} opportunities by type
            </span>
          }
          subtitle={`${money(total)}/yr open across ${groups.reduce((a, g) => a + g.open, 0)} recommendations — select a type to filter the list below`}
          action={
            <ExportButton
              size="sm"
              rows={groups}
              filename={`fcc-${category.toLowerCase()}-opportunities.csv`}
              columns={[
                { header: "Type", value: (g) => g.type },
                { header: "Resources", value: (g) => g.resources },
                { header: "Open recommendations", value: (g) => g.open },
                { header: "Open savings (USD/yr)", value: (g) => Math.round(g.openAnnual) },
                { header: "High/critical", value: (g) => g.critical },
                { header: "Unassigned", value: (g) => g.unowned },
                { header: "Realized (USD/yr)", value: (g) => Math.round(g.realized) },
              ]}
            />
          }
        />
        <div className="mt-2">
          <DataTable
            caption={`${category} opportunity types`}
            rows={groups}
            rowKey={(g) => g.type}
            onRowClick={(g) => setType((t) => (t === g.type ? null : g.type))}
            rowClassName={(g) => (g.type === type ? "bg-brand-50/60" : undefined)}
            initialSort={{ id: "savings", dir: "desc" }}
            pageSize={20}
            columns={[
              { id: "type", header: "Opportunity type", sortValue: (g) => g.type, cell: (g) => <span className="font-medium text-slate-900">{g.type}</span> },
              { id: "res", header: "Resources", align: "right", sortValue: (g) => g.resources, cell: (g) => num(g.resources) },
              { id: "savings", header: "Potential savings", align: "right", sortValue: (g) => g.openAnnual, cell: (g) => <span className="font-semibold">{money(g.openAnnual)}/yr</span> },
              { id: "prio", header: "High / critical", align: "right", sortValue: (g) => g.critical, cell: (g) => num(g.critical) },
              { id: "owner", header: "Lead team", sortValue: (g) => g.topTeam, cell: (g) => g.topTeam },
              {
                id: "status",
                header: "Status",
                cell: (g) => (
                  <div className="flex flex-wrap gap-1">
                    {g.unowned > 0 && <Badge tone="warning">{g.unowned} unassigned</Badge>}
                    {g.inDelivery > 0 && <Badge tone="brand">{g.inDelivery} in delivery</Badge>}
                    {g.realized > 0 && <Badge tone="success">{money(g.realized)} realized</Badge>}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title={type ? `${type} — open recommendations` : `All open ${category.toLowerCase()} recommendations`} subtitle={type ? "Select the type again to clear" : undefined} />
        <RecommendationGrid rows={list} caption={`${category} recommendations`} pageSize={12} />
      </Card>
    </div>
  );
}

function CommitmentsTab() {
  const { ds } = useDemo();
  const c = useMemo(() => commitmentSummary(ds), [ds]);
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-900">Illustrative commitment portfolio. Coverage and utilization are computed from demo resources and reservations — not from a live Azure billing account.</div>
      <KpiGrid cols={5}>
        <MetricCard label="Coverage" value={c.coveragePct} format={(v) => pct(v)} context="Of eligible steady-state production compute" icon={<Handshake className="h-4 w-4" aria-hidden />} />
        <MetricCard label="Utilization" value={c.utilizationPct} format={(v) => pct(v)} context="Weighted by commitment cost" accent="teal" />
        <MetricCard label="On-demand exposure" value={c.onDemandExposure} format={money} context="Eligible spend not covered (per month)" accent="amber" />
        <MetricCard label="Unused commitment" value={c.wastedMonthly} format={money} context={`${c.underutilized.length} commitments below 80% (per month)`} accent="rose" />
        <MetricCard label="Open opportunity" value={c.openOpportunityAnnual} format={money} context="Commitment recommendations, annualized" accent="violet" href="/recommendations?category=Commitments&stage=open" />
      </KpiGrid>
      <Card>
        <CardHeader title="Reservations & savings plans" subtitle="Utilization, expiry and monthly benefit" />
        <div className="mt-2">
          <DataTable
            caption="Commitments"
            rows={ds.reservations}
            rowKey={(r) => r.id}
            initialSort={{ id: "util", dir: "asc" }}
            columns={[
              { id: "name", header: "Commitment", sortValue: (r) => r.name, cell: (r) => <div><div className="font-medium text-slate-900">{r.family}</div><div className="text-[11px] text-slate-500">{r.id} · {r.kind} · {r.term}</div></div> },
              { id: "scope", header: "Scope", cell: (r) => <span className="text-xs">{r.scope}</span> },
              { id: "cost", header: "Monthly commitment", align: "right", sortValue: (r) => r.monthlyCommitment, cell: (r) => moneyExact(r.monthlyCommitment) },
              {
                id: "util",
                header: "Utilization",
                sortValue: (r) => r.utilization,
                cell: (r) => (
                  <div className="flex items-center gap-2">
                    <Progress value={r.utilization} tone={r.utilization >= 90 ? "success" : r.utilization >= 80 ? "warning" : "danger"} className="w-24" label={`${r.id} utilization`} />
                    <span className={cx("text-xs font-medium num", r.utilization < 80 && "text-rose-700")}>{pct(r.utilization)}</span>
                  </div>
                ),
              },
              { id: "benefit", header: "Monthly benefit", align: "right", sortValue: (r) => (r.monthlyOnDemandEquivalent * r.utilization) / 100 - r.monthlyCommitment, cell: (r) => { const b = (r.monthlyOnDemandEquivalent * r.utilization) / 100 - r.monthlyCommitment; return <span className={b < 0 ? "text-rose-700" : "text-emerald-700"}>{money(b)}</span>; } },
              { id: "exp", header: "Expires", sortValue: (r) => r.expiryDate, cell: (r) => { const d = daysBetween(AS_OF, r.expiryDate); return <span className="whitespace-nowrap">{date(r.expiryDate)} {d <= 90 && <Badge tone="warning">{d}d</Badge>}</span>; } },
            ]}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Commitment opportunities" subtitle="Steady-state on-demand families eligible for reservations or savings plans" />
        <RecommendationGrid rows={c.opportunities} caption="Commitment opportunities" pageSize={10} />
      </Card>
    </div>
  );
}
