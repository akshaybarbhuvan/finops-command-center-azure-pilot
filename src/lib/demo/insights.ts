// Executive "so what" statements. Every sentence is computed from the dataset at render time.
import { money, moneySigned, pct, pctSigned } from "../format";
import {
  anomalySummary,
  commitmentSummary,
  governanceSummary,
  lookup,
  opportunityByCategory,
  savingsSummary,
  spendByCategory,
  spendBySubscription,
  spendSummary,
  topOpportunities,
  annual,
} from "./selectors";
import type { Dataset } from "./types";

export interface Insight {
  id: string;
  tone: "positive" | "attention" | "neutral";
  headline: string;
  detail: string;
  href?: string;
  action?: string;
}

export function executiveInsights(ds: Dataset): Insight[] {
  const sp = spendSummary(ds);
  const sv = savingsSummary(ds);
  const cats = opportunityByCategory(ds);
  const top = topOpportunities(ds, 1)[0];
  const subs = spendBySubscription(ds).filter((s) => s.variance > 0).sort((a, b) => b.variance - a.variance);
  const L = lookup(ds);
  const out: Insight[] = [];

  out.push({
    id: "forecast",
    tone: sp.variance > 0 ? "attention" : "positive",
    headline:
      sp.variance > 0
        ? `October is forecast to land ${money(sp.forecast)}, ${moneySigned(sp.variance)} (${pctSigned(sp.variancePct)}) over budget.`
        : `October is forecast to land ${money(sp.forecast)}, ${money(Math.abs(sp.variance))} under budget.`,
    detail: subs.length
      ? `${subs.length} subscriptions are forecast over budget; ${subs[0].name} (${subs[0].businessUnit}) accounts for ${moneySigned(subs[0].variance)}.`
      : "All subscriptions are tracking within budget.",
    href: "/budgets",
    action: "Review budgets",
  });

  out.push({
    id: "opportunity",
    tone: "neutral",
    headline: `${money(sv.openAnnual)} in annualized savings is open across ${sv.openCount} recommendations.`,
    detail: `${cats[0].category} (${money(cats[0].annual)}) and ${cats[1].category} (${money(cats[1].annual)}) represent ${pct(((cats[0].annual + cats[1].annual) / sv.openAnnual) * 100, 0)} of the open opportunity.`,
    href: "/optimization",
    action: "Explore opportunities",
  });

  out.push({
    id: "ownership",
    tone: sv.unownedAnnual > 0 ? "attention" : "positive",
    headline: `${pct(sv.ownedSharePct, 0)} of open savings has an accountable owner; ${money(sv.unownedAnnual)} remains unowned.`,
    detail: top && !top.ownerId ? `The largest unowned item is ${top.id} (${money(annual(top))}/yr) in ${L.teamName(top.teamId)}.` : `${sv.unownedCount} recommendations still need an owner.`,
    href: top && !top.ownerId ? `/recommendations/${top.id}` : "/recommendations?owner=unassigned&stage=open",
    action: top && !top.ownerId ? "Assign owner" : "View unassigned",
  });

  out.push({
    id: "realized",
    tone: "positive",
    headline: `${money(sv.realizedAnnual)} in annualized savings verified; ${money(sv.realizedYtdCash)} realized year-to-date.`,
    detail: `${sv.realizedCount} recommendations verified against billing. ${money(sv.approvedAnnual - sv.realizedAnnual)} more is approved and progressing to realization.`,
    href: "/savings",
    action: "Open savings tracker",
  });

  if (sv.atRiskCount > 0)
    out.push({
      id: "risk",
      tone: "attention",
      headline: `${money(sv.atRiskAnnual)} of savings is at risk from SLA breaches or deadlines within 7 days.`,
      detail: `${sv.overdueCount} recommendations are past SLA; ${sv.pendingApproval.length} await an approval decision.`,
      href: "/recommendations?sla=Breached",
      action: "Review at-risk items",
    });

  return out;
}

export function finopsInsights(ds: Dataset): Insight[] {
  const sv = savingsSummary(ds);
  const gov = governanceSummary(ds);
  const cm = commitmentSummary(ds);
  const an = anomalySummary(ds);
  return [
    {
      id: "validate",
      tone: sv.pendingValidation.length ? "attention" : "positive",
      headline: `${sv.pendingValidation.length} opportunities (${money(sv.pendingValidation.reduce((a, r) => a + annual(r), 0))}/yr) are waiting for validation.`,
      detail: `${sv.pendingVerification.length} implemented changes are ready for savings verification.`,
      href: "/recommendations?stage=identified",
      action: "Open validation queue",
    },
    {
      id: "coverage",
      tone: cm.coveragePct < 65 ? "attention" : "positive",
      headline: `Commitment coverage is ${pct(cm.coveragePct)} of eligible production compute; ${money(cm.onDemandExposure)}/mo remains on-demand.`,
      detail: `${cm.underutilized.length} commitments run below 80% utilization (${money(cm.wastedMonthly)}/mo unused).`,
      href: "/optimization?tab=commitments",
      action: "Review commitments",
    },
    {
      id: "governance",
      tone: gov.score >= 85 ? "positive" : "attention",
      headline: `Governance score ${Math.round(gov.score)}/100 — ${money(gov.unallocatedSpend)}/mo (${pct(gov.unallocatedPct)}) of spend is unallocated.`,
      detail: `${gov.resourcesWithIssues.toLocaleString("en-US")} resources carry at least one governance finding.`,
      href: "/governance",
      action: "Open governance",
    },
    {
      id: "anomalies",
      tone: an.open ? "attention" : "positive",
      headline: `${an.open} open spend anomalies with ${money(an.openImpact)} estimated 30-day impact.`,
      detail: `${an.new} new anomalies need triage.`,
      href: "/anomalies",
      action: "Triage anomalies",
    },
  ];
}

export function spendInsights(ds: Dataset): Insight[] {
  const cats = spendByCategory(ds);
  const fastest = [...cats].sort((a, b) => b.growth3mPct - a.growth3mPct)[0];
  const sp = spendSummary(ds);
  return [
    {
      id: "mtd",
      tone: sp.mtdChangePct > 2 ? "attention" : "neutral",
      headline: `Month-to-date spend is ${money(sp.mtd)}, ${pctSigned(sp.mtdChangePct)} versus the same ${sp.dayOfMonth} days last month.`,
      detail: `Run-rate ${money(sp.runRate)}/mo (${money(sp.annualizedRunRate)} annualized).`,
    },
    {
      id: "growth",
      tone: fastest.growth3mPct > 5 ? "attention" : "neutral",
      headline: `${fastest.category} is the fastest-growing category at ${pctSigned(fastest.growth3mPct)} over three months.`,
      detail: `${cats[0].category} remains the largest category at ${pct(cats[0].share)} of run-rate.`,
    },
  ];
}
