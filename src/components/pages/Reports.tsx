"use client";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { FileText, Printer } from "lucide-react";
import { ExportButton, PageHeader } from "@/components/data/blocks";
import { Badge, Button, Card, cx } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { executiveInsights } from "@/lib/demo/insights";
import {
  allocation,
  annual,
  GOVERNANCE_META,
  governanceSummary,
  lookup,
  opportunityByCategory,
  ownerAccountability,
  savingsFunnel,
  savingsSummary,
  slaStatus,
  spendSummary,
  stageDistribution,
  topOpportunities,
} from "@/lib/demo/selectors";
import { isOpen, STAGE_META } from "@/lib/demo/workflow";
import type { CsvColumn } from "@/lib/csv";
import { date, money, moneyExact, moneySigned, num, pct, pctSigned } from "@/lib/format";
import type { Dataset } from "@/lib/demo/types";

type ReportId = "executive" | "opportunity" | "pipeline" | "status" | "governance";

const REPORTS: { id: ReportId; title: string; audience: string; description: string }[] = [
  { id: "executive", title: "Executive FinOps Summary", audience: "CIO · CFO · CTO", description: "Spend position, forecast, savings and decisions on one page." },
  { id: "opportunity", title: "Optimization Opportunity Report", audience: "FinOps · Engineering leaders", description: "Open opportunity by category and the top 25 recommendations." },
  { id: "pipeline", title: "Savings Pipeline Report", audience: "Finance · FinOps", description: "Potential → validated → approved → realized, with deferrals and rejections." },
  { id: "status", title: "Recommendation Status Report", audience: "Engineering · PMO", description: "Lifecycle distribution, SLA performance and team accountability." },
  { id: "governance", title: "Governance Health Report", audience: "Cloud governance · Security", description: "Score, findings, unallocated spend and policy exceptions." },
];

type Row = Record<string, string | number>;

export function Reports() {
  const params = useSearchParams();
  const initial = params.get("r") as ReportId | null;
  const [id, setId] = useState<ReportId>(initial && REPORTS.some((r) => r.id === initial) ? initial : "executive");
  const { ds } = useDemo();
  const report = REPORTS.find((r) => r.id === id)!;
  const built = useMemo(() => buildReport(ds, id), [ds, id]);

  return (
    <div className="space-y-5">
      <PageHeader crumbs={[{ label: "Operate" }, { label: "Reports" }]} title="Leadership Reports" subtitle="Ready-to-share reports generated from the current demo state. Export to CSV, or print / save as PDF from the browser." />
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <nav aria-label="Reports" className="no-print space-y-2">
          {REPORTS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setId(r.id)}
              aria-current={r.id === id ? "page" : undefined}
              className={cx("card flex w-full items-start gap-3 p-3.5 text-left transition", r.id === id ? "border-brand-300 ring-2 ring-brand-100" : "hover:border-slate-300")}
            >
              <FileText className={cx("mt-0.5 h-4 w-4 shrink-0", r.id === id ? "text-brand-500" : "text-slate-400")} aria-hidden />
              <span>
                <span className="block text-[13px] font-semibold text-slate-900">{r.title}</span>
                <span className="block text-[11.5px] text-slate-500">{r.description}</span>
                <span className="mt-1 block text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{r.audience}</span>
              </span>
            </button>
          ))}
        </nav>
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-gradient-to-r from-slate-50 to-white px-6 py-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">FinOps Command Center · Report</div>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{report.title}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Data as of {date(ds.asOf)}</span>
                <Badge tone="neutral">Illustrative demo data</Badge>
              </div>
            </div>
            <div className="no-print flex gap-2">
              <Button icon={<Printer className="h-4 w-4" aria-hidden />} onClick={() => window.print()}>
                Print / Save as PDF
              </Button>
              <ExportButton rows={built.rows} columns={built.columns} filename={`fcc-${id}-report.csv`} />
            </div>
          </div>
          <div className="space-y-6 px-6 py-6">{built.body}</div>
        </Card>
      </div>
    </div>
  );
}

function Figures({ items }: { items: { label: string; value: string; sub?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="rounded-xl border border-line p-3.5">
          <div className="text-[11px] text-slate-500">{i.label}</div>
          <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900 num">{i.value}</div>
          {i.sub && <div className="text-[11px] text-slate-500">{i.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function SimpleTable({ head, rows, caption }: { head: string[]; rows: ReactNode[][]; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={cx("px-4 py-2", i === 0 ? "text-left" : "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={cx("px-4 py-2", j === 0 ? "text-left text-slate-800" : "text-right num")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function H({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold text-slate-900">{children}</h3>;
}

function cols(keys: string[]): CsvColumn<Row>[] {
  return keys.map((k) => ({ header: k, value: (r: Row) => r[k] }));
}

function buildReport(ds: Dataset, id: ReportId): { body: ReactNode; rows: Row[]; columns: CsvColumn<Row>[] } {
  const L = lookup(ds);
  const sp = spendSummary(ds);
  const sv = savingsSummary(ds);

  if (id === "executive") {
    const insights = executiveInsights(ds);
    const bus = allocation(ds, "businessUnit");
    const top = topOpportunities(ds, 10);
    const rows: Row[] = [
      { Metric: "Month-to-date spend", Value: Math.round(sp.mtd) },
      { Metric: "Month-end forecast", Value: Math.round(sp.forecast) },
      { Metric: "October budget", Value: Math.round(sp.budget) },
      { Metric: "Forecast variance", Value: Math.round(sp.variance) },
      { Metric: "Open savings opportunity (annual)", Value: Math.round(sv.openAnnual) },
      { Metric: "Realized savings (annualized)", Value: Math.round(sv.realizedAnnual) },
      { Metric: "Realized savings YTD (cash)", Value: Math.round(sv.realizedYtdCash) },
      { Metric: "Open recommendations", Value: sv.openCount },
      { Metric: "Unowned open savings (annual)", Value: Math.round(sv.unownedAnnual) },
    ];
    return {
      rows,
      columns: cols(["Metric", "Value"]),
      body: (
        <>
          <Figures
            items={[
              { label: "MTD spend", value: money(sp.mtd), sub: `${pctSigned(sp.mtdChangePct)} vs Sep 1–7` },
              { label: "Month-end forecast", value: money(sp.forecast), sub: `${moneySigned(sp.variance)} vs budget` },
              { label: "Open opportunity", value: money(sv.openAnnual), sub: `${num(sv.openCount)} recommendations` },
              { label: "Realized savings", value: money(sv.realizedAnnual), sub: `${money(sv.realizedYtdCash)} YTD` },
            ]}
          />
          <div>
            <H>Key messages</H>
            <ul className="space-y-2">
              {insights.map((i) => (
                <li key={i.id} className="flex gap-2 text-sm text-slate-700">
                  <span aria-hidden className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", i.tone === "attention" ? "bg-amber-500" : i.tone === "positive" ? "bg-emerald-500" : "bg-brand-500")} />
                  <span>
                    <strong className="font-medium text-slate-900">{i.headline}</strong> {i.detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <H>Business units</H>
            <SimpleTable caption="Business units" head={["Business unit", "Run-rate / mo", "Forecast vs budget", "Opportunity / yr"]} rows={bus.map((b) => [b.key, money(b.runRate), `${moneySigned(b.variance)} (${pctSigned(b.variancePct)})`, money(b.opportunity)])} />
          </div>
          <div>
            <H>Top 10 opportunities</H>
            <SimpleTable caption="Top opportunities" head={["Recommendation", "Owner", "Stage", "Annual savings"]} rows={top.map((r) => [`${r.id} · ${r.title}`, L.userName(r.ownerId), STAGE_META[r.stage].label, money(annual(r))])} />
          </div>
        </>
      ),
    };
  }

  if (id === "opportunity") {
    const cats = opportunityByCategory(ds);
    const top = topOpportunities(ds, 25);
    const rows: Row[] = top.map((r) => ({ ID: r.id, Title: r.title, Category: r.category, Team: L.teamName(r.teamId), Owner: L.userName(r.ownerId), Stage: STAGE_META[r.stage].label, Priority: r.priority, "Annual savings (USD)": annual(r), "Confidence %": r.confidence }));
    return {
      rows,
      columns: cols(Object.keys(rows[0] ?? {})),
      body: (
        <>
          <Figures items={cats.slice(0, 4).map((c) => ({ label: c.category, value: money(c.annual), sub: `${c.count} open` }))} />
          <div>
            <H>Opportunity by category</H>
            <SimpleTable caption="Opportunity by category" head={["Category", "Open recommendations", "Annual savings", "Unowned"]} rows={cats.map((c) => [c.category, num(c.count), money(c.annual), money(c.unowned)])} />
          </div>
          <div>
            <H>Top 25 recommendations</H>
            <SimpleTable caption="Top 25" head={["Recommendation", "Team", "Priority", "Confidence", "Annual savings"]} rows={top.map((r) => [`${r.id} · ${r.title}`, L.teamName(r.teamId), r.priority, pct(r.confidence, 0), moneyExact(annual(r))])} />
          </div>
        </>
      ),
    };
  }

  if (id === "pipeline") {
    const funnel = savingsFunnel(ds);
    const rows: Row[] = [
      ...funnel.map((f) => ({ Stage: f.stage, "Annualized value (USD)": Math.round(f.value) })),
      { Stage: "At risk (SLA)", "Annualized value (USD)": Math.round(sv.atRiskAnnual) },
      { Stage: "Deferred", "Annualized value (USD)": Math.round(sv.deferredAnnual) },
      { Stage: "Rejected", "Annualized value (USD)": Math.round(sv.rejectedAnnual) },
    ];
    const realized = ds.recommendations.filter((r) => r.realizedDate).sort((a, b) => b.realizedMonthlySavings - a.realizedMonthlySavings).slice(0, 15);
    return {
      rows,
      columns: cols(["Stage", "Annualized value (USD)"]),
      body: (
        <>
          <Figures
            items={[
              { label: "Potential", value: money(sv.identifiedAnnual) },
              { label: "Approved", value: money(sv.approvedAnnual) },
              { label: "Realized", value: money(sv.realizedAnnual), sub: `${money(sv.realizedYtdCash)} YTD cash` },
              { label: "At risk", value: money(sv.atRiskAnnual), sub: `${sv.atRiskCount} items` },
            ]}
          />
          <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">Potential savings are estimates; realized savings are verified against billing after implementation.</p>
          <div>
            <H>Pipeline stages (cumulative)</H>
            <SimpleTable caption="Pipeline" head={["Stage", "Annualized value", "Conversion"]} rows={funnel.map((f, i) => [f.stage, money(f.value), i === 0 ? "—" : pct((f.value / funnel[i - 1].value) * 100, 0)])} />
          </div>
          <div>
            <H>Largest realized savings</H>
            <SimpleTable caption="Realized" head={["Recommendation", "Team", "Verified", "Annualized"]} rows={realized.map((r) => [`${r.id} · ${r.title}`, L.teamName(r.teamId), date(r.realizedDate), money(r.realizedMonthlySavings * 12)])} />
          </div>
        </>
      ),
    };
  }

  if (id === "status") {
    const stages = stageDistribution(ds);
    const teams = ownerAccountability(ds);
    const open = ds.recommendations.filter((r) => isOpen(r.stage));
    const sla = (s: string) => open.filter((r) => slaStatus(r).status === s).length;
    const rows: Row[] = teams.map((t) => ({ Team: t.team, "Open recommendations": t.open, "Open value (USD/yr)": Math.round(t.annual), "Past SLA": t.overdue, "Unowned value (USD/yr)": Math.round(t.unowned), "Realized (USD/yr)": Math.round(t.realized) }));
    return {
      rows,
      columns: cols(Object.keys(rows[0] ?? {})),
      body: (
        <>
          <Figures
            items={[
              { label: "Open", value: num(open.length) },
              { label: "On track", value: num(sla("On track")) },
              { label: "Due within 7 days", value: num(sla("Due soon")) },
              { label: "Past SLA", value: num(sla("Breached")) },
            ]}
          />
          <div>
            <H>Lifecycle distribution</H>
            <SimpleTable caption="Lifecycle" head={["Stage", "Recommendations", "Annual value"]} rows={stages.map((s) => [s.label, num(s.count), money(s.annual)])} />
          </div>
          <div>
            <H>Team accountability</H>
            <SimpleTable caption="Teams" head={["Team", "Open", "Open value", "Past SLA", "Realized"]} rows={teams.map((t) => [t.team, num(t.open), money(t.annual), num(t.overdue), money(t.realized)])} />
          </div>
        </>
      ),
    };
  }

  const g = governanceSummary(ds);
  const rows: Row[] = g.issues.map((i) => ({ Control: i.label, Findings: i.count, "Monthly exposure (USD)": Math.round(i.cost), "Compliance %": Number(i.compliancePct.toFixed(1)) }));
  return {
    rows,
    columns: cols(Object.keys(rows[0] ?? {})),
    body: (
      <>
        <Figures
          items={[
            { label: "Governance score", value: `${Math.round(g.score)}/100`, sub: g.grade },
            { label: "Unallocated spend", value: `${money(g.unallocatedSpend)}/mo`, sub: pct(g.unallocatedPct) },
            { label: "Tagging compliance", value: pct(g.taggingCompliancePct) },
            { label: "Resources with findings", value: num(g.resourcesWithIssues), sub: `of ${num(g.activeResources)}` },
          ]}
        />
        <div>
          <H>Controls</H>
          <SimpleTable caption="Controls" head={["Control", "Findings", "Exposure / mo", "Compliance"]} rows={g.issues.map((i) => [i.label, num(i.count), i.cost ? money(i.cost) : "—", pct(i.compliancePct, 0)])} />
        </div>
        <div>
          <H>Policy exceptions</H>
          <SimpleTable caption="Exceptions" head={["Policy", "Subscription", "Expires", "Status"]} rows={ds.policyExceptions.map((e) => [e.policy, L.subName(e.subscriptionId), date(e.expires), e.status])} />
        </div>
        <p className="text-xs text-slate-500">Definitions: {Object.values(GOVERNANCE_META).map((m) => `${m.label} — ${m.description}`).join(". ")}.</p>
      </>
    ),
  };
}
