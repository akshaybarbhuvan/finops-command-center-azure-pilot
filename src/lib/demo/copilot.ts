// FinOps Copilot (demo edition): deterministic intent matching over the demo dataset.
// Every answer is computed from the same selectors that drive the dashboards, and cites the records it used.
import { money, moneyExact, moneySigned, pct, pctSigned } from "../format";
import {
  annual,
  anomalyImpact,
  commitmentSummary,
  governanceSummary,
  lookup,
  opportunityByCategory,
  ownerAccountability,
  savingsSummary,
  slaStatus,
  spendByCategory,
  spendBySubscription,
  spendSummary,
  topOpportunities,
} from "./selectors";
import { STAGE_META } from "./workflow";
import type { Dataset } from "./types";

export interface CopilotAnswer {
  title: string;
  summary: string;
  bullets: string[];
  links: { label: string; href: string }[];
  basis: string;
}

export const SUGGESTED_QUESTIONS = [
  "What decisions need my attention?",
  "Where can we save the most?",
  "Why is spend increasing?",
  "Are we going to hit budget this month?",
  "Who owns the open savings?",
  "How much have we actually realized?",
  "How healthy is our commitment coverage?",
  "Summarize REC-2041",
];

type Intent = { id: string; match: RegExp; answer: (ds: Dataset, q: string) => CopilotAnswer };

const INTENTS: Intent[] = [
  {
    id: "rec",
    match: /\bREC-\d{4}\b/i,
    answer: (ds, q) => {
      const id = q.match(/REC-\d{4}/i)![0].toUpperCase();
      const r = ds.recommendations.find((x) => x.id === id);
      const L = lookup(ds);
      if (!r) return { title: id, summary: `Recommendation ${id} is not available. It does not exist or is outside the records your role can access.`, bullets: [], links: [{ label: "Browse recommendations", href: "/recommendations" }], basis: "Recommendation index" };
      const sla = slaStatus(r);
      return {
        title: `${r.id} · ${r.title}`,
        summary: `${STAGE_META[r.stage].label} · ${r.priority} priority · ${moneyExact(r.estimatedMonthlySavings)}/mo (${money(annual(r))}/yr) estimated savings at ${r.confidence}% confidence.`,
        bullets: [
          `Owner: ${L.userName(r.ownerId)} (${L.teamName(r.teamId)})`,
          `SLA: ${sla.status}${sla.status === "On track" || sla.status === "Due soon" ? ` — ${sla.daysLeft} days left` : sla.status === "Breached" ? ` — ${Math.abs(sla.daysLeft)} days overdue` : ""}`,
          `Risk: ${r.risk} · Effort: ${r.effort}`,
          `Why: ${r.rationale}`,
          r.ticketId ? `Ticket: ${r.ticketId}` : "No ticket yet",
        ],
        links: [{ label: `Open ${r.id}`, href: `/recommendations/${r.id}` }],
        basis: `Recommendation ${r.id}, resource ${L.resource(r.resourceId)?.name ?? r.resourceId}`,
      };
    },
  },
  {
    id: "decisions",
    match: /decision|attention|approv|escalat|what should i|priorit/i,
    answer: (ds) => {
      const s = savingsSummary(ds);
      const L = lookup(ds);
      const top = topOpportunities(ds, 5).filter((r) => !r.ownerId);
      const approvals = [...s.pendingApproval].sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings).slice(0, 3);
      return {
        title: "Decisions that need leadership attention",
        summary: `${s.pendingApproval.length} changes await approval, ${money(s.unownedAnnual)}/yr of savings has no owner, and ${money(s.atRiskAnnual)}/yr is at SLA risk.`,
        bullets: [
          ...top.slice(0, 2).map((r) => `Assign an owner: ${r.id} — ${money(annual(r))}/yr (${L.teamName(r.teamId)})`),
          ...approvals.map((r) => `Approve or reject: ${r.id} — ${money(annual(r))}/yr, ${r.risk.toLowerCase()} risk`),
          `${s.overdueCount} recommendations are past SLA — consider escalation with owning teams.`,
        ],
        links: [
          ...(top[0] ? [{ label: `Open ${top[0].id}`, href: `/recommendations/${top[0].id}` }] : []),
          { label: "Pending approvals", href: "/recommendations?stage=submitted" },
          { label: "Past SLA", href: "/recommendations?sla=Breached" },
        ],
        basis: `${s.openCount} open recommendations`,
      };
    },
  },
  {
    id: "realized",
    match: /realiz|actual(ly)? sav|achiev|deliver/i,
    answer: (ds) => {
      const s = savingsSummary(ds);
      return {
        title: "Realized savings",
        summary: `${money(s.realizedAnnual)} in annualized savings has been verified against billing across ${s.realizedCount} recommendations; ${money(s.realizedYtdCash)} has been realized year-to-date.`,
        bullets: [
          `Approved pipeline (not yet realized): ${money(s.approvedAnnual - s.realizedAnnual)}/yr`,
          `Awaiting verification: ${s.pendingVerification.length} implemented changes (${money(s.pendingVerification.reduce((a, r) => a + annual(r), 0))}/yr)`,
          "Potential savings are estimates until FinOps verifies them against billing data.",
        ],
        links: [{ label: "Savings tracker", href: "/savings" }],
        basis: "Verified and closed recommendations",
      };
    },
  },
  {
    id: "owners",
    match: /owner|own|accountab|who|team/i,
    answer: (ds) => {
      const s = savingsSummary(ds);
      const teams = ownerAccountability(ds);
      return {
        title: "Ownership of open savings",
        summary: `${pct(s.ownedSharePct, 0)} of open savings is owned; ${money(s.unownedAnnual)}/yr across ${s.unownedCount} recommendations has no accountable owner yet.`,
        bullets: teams.slice(0, 5).map((t) => `${t.team}: ${t.open} open · ${money(t.annual)}/yr · ${t.overdue} past SLA`),
        links: [{ label: "Unassigned recommendations", href: "/recommendations?owner=unassigned&stage=open" }],
        basis: "Open recommendations by owning team",
      };
    },
  },
  {
    id: "commitments",
    match: /commit|reserv|savings plan|coverage|\bri\b/i,
    answer: (ds) => {
      const c = commitmentSummary(ds);
      return {
        title: "Commitment coverage",
        summary: `Coverage is ${pct(c.coveragePct)} of eligible production compute with ${pct(c.utilizationPct)} weighted utilization. ${money(c.onDemandExposure)}/mo remains on-demand.`,
        bullets: [
          `${c.underutilized.length} commitments below 80% utilization (${money(c.wastedMonthly)}/mo unused)`,
          `${c.expiringSoon.length} commitments expire within 90 days`,
          `Open commitment opportunities: ${money(c.openOpportunityAnnual)}/yr`,
        ],
        links: [{ label: "Commitments", href: "/optimization?tab=commitments" }],
        basis: `${ds.reservations.length} reservations and savings plans`,
      };
    },
  },
  {
    id: "governance",
    match: /govern|tag|untag|alloc|orphan|compliance|policy/i,
    answer: (ds) => {
      const g = governanceSummary(ds);
      return {
        title: "Governance health",
        summary: `Governance score is ${Math.round(g.score)}/100 (${g.grade}). ${money(g.unallocatedSpend)}/mo of spend is unallocated and tagging compliance is ${pct(g.taggingCompliancePct)}.`,
        bullets: g.issues.filter((i) => i.count > 0).sort((a, b) => a.compliancePct - b.compliancePct).slice(0, 4).map((i) => `${i.label}: ${i.count.toLocaleString("en-US")} findings${i.cost ? ` · ${money(i.cost)}/mo` : ""}`),
        links: [{ label: "Governance", href: "/governance" }],
        basis: `${g.activeResources.toLocaleString("en-US")} active resources`,
      };
    },
  },
  {
    id: "anomaly",
    match: /anomal|unexpected|alert/i,
    answer: (ds) => {
      const L = lookup(ds);
      const open = ds.anomalies.filter((a) => a.status !== "Resolved");
      return {
        title: "Spend anomalies",
        summary: `${open.length} anomalies are open with ${money(open.reduce((s, a) => s + anomalyImpact(a).estimatedImpact, 0))} estimated 30-day impact.`,
        bullets: open.map((a) => `${a.status}: ${a.service} in ${L.subName(a.subscriptionId)} — ${moneyExact(a.observedDaily)}/day vs ${moneyExact(a.baselineDaily)} baseline`),
        links: [{ label: "Anomaly center", href: "/anomalies" }],
        basis: `${ds.anomalies.length} anomaly records`,
      };
    },
  },
  {
    id: "budget",
    match: /budget|forecast|month.?end|overrun|on track/i,
    answer: (ds) => {
      const sp = spendSummary(ds);
      const over = spendBySubscription(ds).filter((x) => x.variance > 0).sort((a, b) => b.variance - a.variance);
      return {
        title: "October forecast vs budget",
        summary: `Forecast month-end spend is ${money(sp.forecast)} against a ${money(sp.budget)} budget — ${moneySigned(sp.variance)} (${pctSigned(sp.variancePct)}).`,
        bullets: [
          `Month-to-date: ${money(sp.mtd)} after ${sp.dayOfMonth} of ${sp.daysInMonth} days (${pct(sp.budgetUtilizationPct)} of budget consumed).`,
          ...over.slice(0, 3).map((x) => `${x.name} (${x.businessUnit}) forecast ${moneySigned(x.variance)} over budget`),
        ],
        links: [{ label: "Budgets & forecast", href: "/budgets" }],
        basis: "Daily cost, run-rate and subscription budgets",
      };
    },
  },
  {
    id: "drivers",
    match: /why|driv|increas|grow|trend|spik/i,
    answer: (ds) => {
      const cats = [...spendByCategory(ds)].sort((a, b) => b.growth3mPct - a.growth3mPct);
      const sp = spendSummary(ds);
      const anomalies = ds.anomalies.filter((a) => a.status !== "Resolved");
      const L = lookup(ds);
      return {
        title: "What is driving spend",
        summary: `Run-rate is ${money(sp.runRate)}/mo; forecast is ${pctSigned(sp.forecastVsLastPct)} versus last month. Growth is concentrated in ${cats[0].category} (${pctSigned(cats[0].growth3mPct)} over 3 months) and ${cats[1].category} (${pctSigned(cats[1].growth3mPct)}).`,
        bullets: anomalies.slice(0, 3).map((a) => `Anomaly ${a.id}: ${a.service} in ${L.subName(a.subscriptionId)} +${Math.round(anomalyImpact(a).deviationPct)}% vs baseline — ${a.rootCause}`),
        links: [{ label: "Cost & spend", href: "/cost" }, { label: "Anomalies", href: "/anomalies" }],
        basis: "Monthly cost history and open anomalies",
      };
    },
  },
  {
    id: "save",
    match: /save|saving|opportunit|optimi|waste|reduce/i,
    answer: (ds) => {
      const s = savingsSummary(ds);
      const cats = opportunityByCategory(ds);
      const top = topOpportunities(ds, 3);
      return {
        title: "Largest savings opportunities",
        summary: `${money(s.openAnnual)}/yr is open across ${s.openCount} recommendations. ${cats[0].category} leads with ${money(cats[0].annual)}/yr.`,
        bullets: [
          ...top.map((r) => `${r.id}: ${r.title} — ${money(annual(r))}/yr (${STAGE_META[r.stage].label})`),
          `By category: ${cats.slice(0, 4).map((c) => `${c.category} ${money(c.annual)}`).join(" · ")}`,
        ],
        links: [{ label: `Open ${top[0].id}`, href: `/recommendations/${top[0].id}` }, { label: "Optimization overview", href: "/optimization" }],
        basis: `${s.openCount} open recommendations`,
      };
    },
  },
  {
    id: "spend",
    match: /spend|cost|how much/i,
    answer: (ds) => {
      const sp = spendSummary(ds);
      const cats = spendByCategory(ds);
      return {
        title: "Cloud spend at a glance",
        summary: `Month-to-date spend is ${money(sp.mtd)} (${pctSigned(sp.mtdChangePct)} vs the same period last month). Run-rate is ${money(sp.runRate)}/mo, ${money(sp.annualizedRunRate)} annualized.`,
        bullets: cats.slice(0, 4).map((c) => `${c.category}: ${money(c.runRate)}/mo (${pct(c.share)})`),
        links: [{ label: "Cost & spend", href: "/cost" }],
        basis: "Resource run-rate and daily cost",
      };
    },
  },
];

export function askCopilot(ds: Dataset, question: string): CopilotAnswer {
  const q = question.trim();
  for (const intent of INTENTS) if (intent.match.test(q)) return intent.answer(ds, q);
  return {
    title: "Try one of these questions",
    summary: "The demo copilot answers questions about spend, budgets, savings, ownership, governance, commitments, anomalies and specific recommendations by ID (for example REC-1234).",
    bullets: SUGGESTED_QUESTIONS.slice(0, 5),
    links: [],
    basis: "Demo dataset",
  };
}
