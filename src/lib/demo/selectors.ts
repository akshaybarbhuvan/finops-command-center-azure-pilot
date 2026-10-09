// Single source of truth for every metric shown in the application.
// All values are derived from the dataset records — nothing is hard-coded in UI components.
import { AS_OF, CURRENT_MONTH, DAY_OF_MONTH, DAYS_IN_CURRENT_MONTH } from "./org";
import { daysBetween, FORECAST_MONTHS, HISTORY_MONTHS } from "./seed";
import { isOpen, isRealized, LIFECYCLE, STAGE_META, stageReached } from "./workflow";
import type {
  Anomaly,
  CostCategory,
  Dataset,
  GovernanceIssue,
  Priority,
  RecCategory,
  Recommendation,
  Resource,
  Role,
  Stage,
  User,
} from "./types";

// ---------------------------------------------------------------------------
// Memoization keyed on immutable arrays (dataset slices are replaced, never mutated)
// ---------------------------------------------------------------------------
function memo<K extends object, R>(fn: (k: K) => R): (k: K) => R {
  const cache = new WeakMap<K, R>();
  return (k: K) => {
    if (cache.has(k)) return cache.get(k) as R;
    const v = fn(k);
    cache.set(k, v);
    return v;
  };
}

const sum = <T,>(xs: readonly T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

export const COST_CATEGORIES: CostCategory[] = ["Compute", "Database", "Analytics & AI", "Storage", "Network", "Management & Security"];
export const REC_CATEGORIES: RecCategory[] = ["Compute", "Storage", "Database", "Network", "Commitments", "Other"];
export const PRIORITIES: Priority[] = ["Critical", "High", "Medium", "Low"];

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
export const indexes = memo((ds: Pick<Dataset, "users" | "resources" | "subscriptions" | "teams" | "applications" | "businessUnits">) => ({
  user: new Map(ds.users.map((u) => [u.id, u])),
  resource: new Map(ds.resources.map((r) => [r.id, r])),
  subscription: new Map(ds.subscriptions.map((s) => [s.id, s])),
  team: new Map(ds.teams.map((t) => [t.id, t])),
  application: new Map(ds.applications.map((a) => [a.id, a])),
  businessUnit: new Map(ds.businessUnits.map((b) => [b.id, b])),
}));

export function lookup(ds: Dataset) {
  const ix = indexes(ds);
  return {
    user: (id: string | null | undefined) => (id ? ix.user.get(id) : undefined),
    userName: (id: string | null | undefined) => (id ? ix.user.get(id)?.name ?? "Unknown" : "Unassigned"),
    resource: (id: string) => ix.resource.get(id),
    subscription: (id: string) => ix.subscription.get(id),
    subName: (id: string) => ix.subscription.get(id)?.name ?? id,
    team: (id: string) => ix.team.get(id),
    teamName: (id: string) => ix.team.get(id)?.name ?? id,
    application: (id: string) => ix.application.get(id),
    buName: (id: string) => ix.businessUnit.get(id)?.name ?? id,
    buForSub: (subId: string) => ix.businessUnit.get(ix.subscription.get(subId)?.businessUnitId ?? "")?.name ?? "—",
  };
}

// ---------------------------------------------------------------------------
// Spend
// ---------------------------------------------------------------------------
export const staticRunRate = memo((resources: Resource[]) => sum(resources, (r) => r.monthlyCost));

/** Savings verified during the current session reduce the forward-looking run-rate. */
export function sessionRealizedMonthly(ds: Dataset) {
  return sum(ds.recommendations.filter((r) => r.realizedDate && r.realizedDate >= AS_OF), (r) => r.realizedMonthlySavings);
}

export function runRate(ds: Dataset) {
  return staticRunRate(ds.resources) - sessionRealizedMonthly(ds);
}

export const mtdSpend = memo((daily: Dataset["dailyCosts"]) => sum(daily, (d) => d.cost));
export const priorMtdSpend = memo((daily: Dataset["priorMonthDailyCosts"]) => sum(daily.slice(0, DAY_OF_MONTH), (d) => d.cost));

export const monthTotals = memo((rows: Dataset["monthlyCosts"]) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.month, (m.get(r.month) ?? 0) + r.cost);
  return m;
});

export function lastMonthSpend(ds: Dataset) {
  return monthTotals(ds.monthlyCosts).get(HISTORY_MONTHS[HISTORY_MONTHS.length - 1]) ?? 0;
}

export function monthBudget(ds: Dataset) {
  return sum(ds.subscriptions, (s) => s.monthlyBudget);
}

export function forecastMonthEnd(ds: Dataset) {
  const remaining = DAYS_IN_CURRENT_MONTH - DAY_OF_MONTH;
  return mtdSpend(ds.dailyCosts) + (runRate(ds) / DAYS_IN_CURRENT_MONTH) * remaining;
}

export function spendSummary(ds: Dataset) {
  const mtd = mtdSpend(ds.dailyCosts);
  const priorMtd = priorMtdSpend(ds.priorMonthDailyCosts);
  const forecast = forecastMonthEnd(ds);
  const budget = monthBudget(ds);
  const last = lastMonthSpend(ds);
  const budgetToDate = (budget * DAY_OF_MONTH) / DAYS_IN_CURRENT_MONTH;
  const ttm = sum(HISTORY_MONTHS, (m) => monthTotals(ds.monthlyCosts).get(m) ?? 0) + forecast;
  return {
    mtd,
    priorMtd,
    mtdChangePct: ((mtd - priorMtd) / priorMtd) * 100,
    forecast,
    lastMonth: last,
    forecastVsLastPct: ((forecast - last) / last) * 100,
    budget,
    budgetToDate,
    variance: forecast - budget,
    variancePct: ((forecast - budget) / budget) * 100,
    budgetUtilizationPct: (mtd / budget) * 100,
    runRate: runRate(ds),
    annualizedRunRate: runRate(ds) * 12,
    ttm,
    dayOfMonth: DAY_OF_MONTH,
    daysInMonth: DAYS_IN_CURRENT_MONTH,
  };
}

export interface TrendPoint {
  month: string;
  actual: number | null;
  forecast: number | null;
  mtd: number | null;
  budget: number;
}

export function spendTrend(ds: Dataset): TrendPoint[] {
  const totals = monthTotals(ds.monthlyCosts);
  const budgets = new Map(ds.monthlyBudgets.map((b) => [b.month, b.budget]));
  const rr = runRate(ds);
  const growth = 1.011; // trailing 6-month blended growth used for the forward view
  const points: TrendPoint[] = HISTORY_MONTHS.map((m) => ({ month: m, actual: totals.get(m) ?? 0, forecast: null, mtd: null, budget: budgets.get(m) ?? 0 }));
  // Bridge the forecast line from the last actual month.
  points[points.length - 1].forecast = points[points.length - 1].actual;
  FORECAST_MONTHS.forEach((m, i) => {
    points.push({
      month: m,
      actual: null,
      forecast: m === CURRENT_MONTH ? forecastMonthEnd(ds) : rr * Math.pow(growth, i),
      mtd: m === CURRENT_MONTH ? mtdSpend(ds.dailyCosts) : null,
      budget: budgets.get(m) ?? 0,
    });
  });
  return points;
}

export const categoryRunRate = memo((resources: Resource[]) => {
  const m = new Map<CostCategory, number>(COST_CATEGORIES.map((c) => [c, 0]));
  for (const r of resources) m.set(r.category, (m.get(r.category) ?? 0) + r.monthlyCost);
  return m;
});

export function spendByCategory(ds: Dataset) {
  const rr = categoryRunRate(ds.resources);
  const last = new Map<CostCategory, number>();
  const lm = HISTORY_MONTHS[HISTORY_MONTHS.length - 1];
  const threeBack = HISTORY_MONTHS[HISTORY_MONTHS.length - 4];
  const prev = new Map<CostCategory, number>();
  for (const r of ds.monthlyCosts) {
    if (r.month === lm) last.set(r.category, (last.get(r.category) ?? 0) + r.cost);
    if (r.month === threeBack) prev.set(r.category, (prev.get(r.category) ?? 0) + r.cost);
  }
  const total = sum([...rr.values()], (x) => x);
  return COST_CATEGORIES.map((c) => ({
    category: c,
    runRate: rr.get(c) ?? 0,
    lastMonth: last.get(c) ?? 0,
    share: ((rr.get(c) ?? 0) / total) * 100,
    growth3mPct: (((last.get(c) ?? 0) - (prev.get(c) ?? 0)) / (prev.get(c) || 1)) * 100,
  })).sort((a, b) => b.runRate - a.runRate);
}

export function spendBySubscription(ds: Dataset) {
  const L = lookup(ds);
  const mtd = mtdSpend(ds.dailyCosts);
  const totalRR = staticRunRate(ds.resources);
  const lm = HISTORY_MONTHS[HISTORY_MONTHS.length - 1];
  const opp = opportunityBy(ds, (r) => r.subscriptionId);
  return ds.subscriptions
    .map((s) => {
      const rr = sum(ds.resources.filter((r) => r.subscriptionId === s.id), (r) => r.monthlyCost);
      const share = rr / totalRR;
      const subMtd = mtd * share;
      const forecast = subMtd + (rr / DAYS_IN_CURRENT_MONTH) * (DAYS_IN_CURRENT_MONTH - DAY_OF_MONTH);
      const last = sum(ds.monthlyCosts.filter((r) => r.month === lm && r.subscriptionId === s.id), (r) => r.cost);
      return {
        id: s.id,
        name: s.name,
        businessUnit: L.buName(s.businessUnitId),
        environment: s.environment,
        owner: L.userName(s.ownerId),
        runRate: rr,
        mtd: subMtd,
        forecast,
        lastMonth: last,
        budget: s.monthlyBudget,
        variance: forecast - s.monthlyBudget,
        variancePct: ((forecast - s.monthlyBudget) / s.monthlyBudget) * 100,
        utilizationPct: (forecast / s.monthlyBudget) * 100,
        opportunity: opp.get(s.id) ?? 0,
      };
    })
    .sort((a, b) => b.runRate - a.runRate);
}

export type AllocationDimension = "businessUnit" | "application" | "costCenter" | "subscription" | "environment" | "team";

export function allocation(ds: Dataset, dim: AllocationDimension) {
  const L = lookup(ds);
  const subs = spendBySubscription(ds);
  const subForecastRatio = new Map(subs.map((s) => [s.id, s.forecast / (s.runRate || 1)]));
  const subBudgetRatio = new Map(subs.map((s) => [s.id, s.budget / (s.runRate || 1)]));
  const keyOf = (r: Resource): string => {
    switch (dim) {
      case "businessUnit":
        return L.buForSub(r.subscriptionId);
      case "application":
        return L.application(r.applicationId)?.name ?? "Unmapped";
      case "costCenter":
        return r.costCenter ?? "Unallocated";
      case "subscription":
        return L.subName(r.subscriptionId);
      case "environment":
        return r.environment;
      case "team":
        return r.ownerId ? L.teamName(L.user(r.ownerId)!.teamId) : "No owner";
    }
  };
  const recKey = (rec: Recommendation) => {
    const res = L.resource(rec.resourceId);
    return res ? keyOf(res) : "—";
  };
  const opp = opportunityBy(ds, recKey);
  const rows = new Map<string, { key: string; runRate: number; forecast: number; budget: number; resources: number }>();
  for (const r of ds.resources) {
    const k = keyOf(r);
    const row = rows.get(k) ?? { key: k, runRate: 0, forecast: 0, budget: 0, resources: 0 };
    row.runRate += r.monthlyCost;
    row.forecast += r.monthlyCost * (subForecastRatio.get(r.subscriptionId) ?? 1);
    row.budget += r.monthlyCost * (subBudgetRatio.get(r.subscriptionId) ?? 1);
    row.resources += 1;
    rows.set(k, row);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, variance: r.forecast - r.budget, variancePct: ((r.forecast - r.budget) / (r.budget || 1)) * 100, opportunity: opp.get(r.key) ?? 0 }))
    .sort((a, b) => b.runRate - a.runRate);
}

export function dailySpend(ds: Dataset) {
  const avgPrior = sum(ds.priorMonthDailyCosts, (d) => d.cost) / ds.priorMonthDailyCosts.length;
  return ds.dailyCosts.map((d, i) => ({ date: d.date, cost: d.cost, priorMonth: ds.priorMonthDailyCosts[i]?.cost ?? avgPrior }));
}

// ---------------------------------------------------------------------------
// Recommendations & savings
// ---------------------------------------------------------------------------
export const annual = (r: Recommendation) => r.estimatedMonthlySavings * 12;
export const isActiveOpportunity = (r: Recommendation) => isOpen(r.stage);

export type SlaStatus = "On track" | "Due soon" | "Breached" | "Met" | "Missed" | "Not applicable";

export function slaStatus(r: Recommendation, asOf = AS_OF): { status: SlaStatus; daysLeft: number } {
  const daysLeft = daysBetween(asOf, r.dueDate);
  if (r.stage === "rejected" || r.stage === "deferred") return { status: "Not applicable", daysLeft };
  if (isRealized(r.stage)) {
    const done = r.realizedDate ?? r.history[r.history.length - 1].at;
    return { status: done <= r.dueDate ? "Met" : "Missed", daysLeft };
  }
  if (daysLeft < 0) return { status: "Breached", daysLeft };
  if (daysLeft <= 7) return { status: "Due soon", daysLeft };
  return { status: "On track", daysLeft };
}

function opportunityBy(ds: Dataset, key: (r: Recommendation) => string) {
  const m = new Map<string, number>();
  for (const r of ds.recommendations) if (isOpen(r.stage)) m.set(key(r), (m.get(key(r)) ?? 0) + annual(r));
  return m;
}

export function savingsSummary(ds: Dataset) {
  const recs = ds.recommendations;
  const open = recs.filter((r) => isOpen(r.stage));
  const realized = recs.filter((r) => isRealized(r.stage));
  const reached = (s: Stage) => recs.filter((r) => stageReached(r.stage, s));
  const atRisk = open.filter((r) => {
    const s = slaStatus(r).status;
    return s === "Breached" || s === "Due soon";
  });
  const unowned = open.filter((r) => !r.ownerId);
  const ytdStart = "2026-01-01";
  const ytdCash = sum(realized, (r) => {
    const from = r.realizedDate! > ytdStart ? r.realizedDate! : ytdStart;
    return (r.realizedMonthlySavings * Math.max(0, daysBetween(from, AS_OF))) / 30.4;
  });
  const identifiedAll = recs.filter((r) => r.stage !== "rejected");
  return {
    openCount: open.length,
    openAnnual: sum(open, annual),
    totalCount: recs.length,
    identifiedAnnual: sum(identifiedAll, annual),
    validatedAnnual: sum(reached("validated"), annual),
    approvedAnnual: sum(reached("approved"), annual),
    inProgressAnnual: sum(recs.filter((r) => ["assigned", "in_progress", "submitted"].includes(r.stage)), annual),
    implementedAnnual: sum(reached("implemented"), annual),
    realizedAnnual: sum(realized, (r) => r.realizedMonthlySavings * 12),
    realizedCount: realized.length,
    realizedYtdCash: ytdCash,
    atRiskAnnual: sum(atRisk, annual),
    atRiskCount: atRisk.length,
    deferredAnnual: sum(recs.filter((r) => r.stage === "deferred"), annual),
    deferredCount: recs.filter((r) => r.stage === "deferred").length,
    rejectedAnnual: sum(recs.filter((r) => r.stage === "rejected"), annual),
    rejectedCount: recs.filter((r) => r.stage === "rejected").length,
    unownedAnnual: sum(unowned, annual),
    unownedCount: unowned.length,
    ownedSharePct: open.length ? (sum(open.filter((r) => r.ownerId), annual) / sum(open, annual)) * 100 : 0,
    criticalOpen: open.filter((r) => r.priority === "Critical").length,
    overdueCount: open.filter((r) => slaStatus(r).status === "Breached").length,
    pendingApproval: open.filter((r) => r.stage === "submitted"),
    pendingValidation: open.filter((r) => r.stage === "identified"),
    pendingVerification: open.filter((r) => r.stage === "implemented"),
  };
}

/** Funnel stages — each bar includes everything that progressed beyond it (cumulative). */
export function savingsFunnel(ds: Dataset) {
  const s = savingsSummary(ds);
  return [
    { stage: "Identified", value: s.identifiedAnnual, hint: "All opportunities except rejected" },
    { stage: "Validated", value: s.validatedAnnual, hint: "Confirmed by FinOps" },
    { stage: "Approved", value: s.approvedAnnual, hint: "Change approved" },
    { stage: "Implemented", value: s.implementedAnnual, hint: "Change in place" },
    { stage: "Realized", value: s.realizedAnnual, hint: "Verified against billing" },
  ];
}

/** Waterfall from identified to realized, showing where value leaves the pipeline. */
export function savingsWaterfall(ds: Dataset) {
  const s = savingsSummary(ds);
  const recs = ds.recommendations;
  const notValidated = sum(recs.filter((r) => r.stage === "identified"), annual);
  const deferred = s.deferredAnnual;
  const awaitingApproval = sum(recs.filter((r) => ["validated", "assigned", "in_progress", "submitted"].includes(r.stage)), annual);
  const awaitingImpl = sum(recs.filter((r) => r.stage === "approved"), annual);
  const awaitingVerify = sum(recs.filter((r) => r.stage === "implemented"), annual);
  const variance = sum(recs.filter((r) => isRealized(r.stage)), (r) => annual(r) - r.realizedMonthlySavings * 12);
  const steps = [
    { name: "Identified", kind: "total" as const, value: s.identifiedAnnual },
    { name: "Awaiting validation", kind: "delta" as const, value: -notValidated },
    { name: "Deferred", kind: "delta" as const, value: -deferred },
    { name: "In delivery", kind: "delta" as const, value: -awaitingApproval },
    { name: "Awaiting build", kind: "delta" as const, value: -awaitingImpl },
    { name: "Awaiting verification", kind: "delta" as const, value: -awaitingVerify },
    { name: "Estimate variance", kind: "delta" as const, value: -variance },
    { name: "Realized", kind: "total" as const, value: s.realizedAnnual },
  ];
  let running = 0;
  return steps.map((st) => {
    if (st.kind === "total") {
      running = st.value;
      return { ...st, base: 0, bar: st.value };
    }
    const top = running;
    running += st.value;
    return { ...st, base: Math.min(top, running), bar: Math.abs(st.value) };
  });
}

export function opportunityByCategory(ds: Dataset) {
  const open = ds.recommendations.filter((r) => isOpen(r.stage));
  return REC_CATEGORIES.map((c) => {
    const rs = open.filter((r) => r.category === c);
    return { category: c, annual: sum(rs, annual), count: rs.length, unowned: sum(rs.filter((r) => !r.ownerId), annual) };
  }).sort((a, b) => b.annual - a.annual);
}

export function topOpportunities(ds: Dataset, n = 10) {
  return ds.recommendations
    .filter((r) => isOpen(r.stage))
    .sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings)
    .slice(0, n);
}

export function agingBuckets(ds: Dataset) {
  const buckets = [
    { label: "0–30 days", min: 0, max: 30 },
    { label: "31–60 days", min: 31, max: 60 },
    { label: "61–90 days", min: 61, max: 90 },
    { label: "90+ days", min: 91, max: 100000 },
  ];
  const open = ds.recommendations.filter((r) => isOpen(r.stage));
  return buckets.map((b) => {
    const rs = open.filter((r) => {
      const age = daysBetween(r.createdDate, AS_OF);
      return age >= b.min && age <= b.max;
    });
    const by = (s: SlaStatus) => rs.filter((r) => slaStatus(r).status === s).length;
    return { bucket: b.label, onTrack: by("On track"), dueSoon: by("Due soon"), breached: by("Breached"), total: rs.length, annual: sum(rs, annual) };
  });
}

export function stageDistribution(ds: Dataset) {
  return [...LIFECYCLE, "rejected", "deferred"].map((s) => {
    const rs = ds.recommendations.filter((r) => r.stage === s);
    return { stage: s as Stage, label: STAGE_META[s as Stage].label, count: rs.length, annual: sum(rs, annual) };
  });
}

/** Realized savings run-rate by month of verification (cumulative), for the savings trend. */
export function realizedTrend(ds: Dataset) {
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
  const realized = ds.recommendations.filter((r) => r.realizedDate);
  let cumulative = 0;
  return months.map((m) => {
    const inMonth = realized.filter((r) => r.realizedDate!.slice(0, 7) === m);
    const added = sum(inMonth, (r) => r.realizedMonthlySavings * 12);
    cumulative += added;
    return { month: m, added, cumulative, count: inMonth.length };
  });
}

export function ownerAccountability(ds: Dataset) {
  const L = lookup(ds);
  const open = ds.recommendations.filter((r) => isOpen(r.stage));
  const teams = new Map<string, { teamId: string; team: string; open: number; annual: number; overdue: number; unowned: number; realized: number }>();
  for (const r of ds.recommendations) {
    const t = teams.get(r.teamId) ?? { teamId: r.teamId, team: L.teamName(r.teamId), open: 0, annual: 0, overdue: 0, unowned: 0, realized: 0 };
    if (isOpen(r.stage)) {
      t.open += 1;
      t.annual += annual(r);
      if (slaStatus(r).status === "Breached") t.overdue += 1;
      if (!r.ownerId) t.unowned += annual(r);
    }
    if (isRealized(r.stage)) t.realized += r.realizedMonthlySavings * 12;
    teams.set(r.teamId, t);
  }
  void open;
  return [...teams.values()].sort((a, b) => b.annual - a.annual);
}

// ---------------------------------------------------------------------------
// Governance
// ---------------------------------------------------------------------------
export const GOVERNANCE_META: Record<GovernanceIssue, { label: string; description: string; weight: number }> = {
  missing_cost_center: { label: "Unallocated spend", description: "Resources without a cost-center tag cannot be charged back", weight: 0.22 },
  missing_owner: { label: "Missing ownership", description: "Resources without an accountable owner tag", weight: 0.2 },
  idle: { label: "Idle resources", description: "Running resources with < 4% average utilization over 30 days", weight: 0.14 },
  orphaned: { label: "Orphaned resources", description: "Unattached disks, unused IPs, deallocated VMs and idle gateways", weight: 0.12 },
  aged_snapshot: { label: "Aging snapshots", description: "Snapshots older than the 180-day retention standard", weight: 0.06 },
  legacy_sku: { label: "Inconsistent SKUs", description: "VMs on v3-generation SKUs outside the approved catalog", weight: 0.08 },
  nonprod_geo_redundancy: { label: "Storage replication", description: "Geo-redundant storage in non-production environments", weight: 0.08 },
  policy_exception: { label: "Policy exceptions", description: "Approved exceptions to Azure Policy guardrails", weight: 0.1 },
};

export const governanceSummary = memo((ds: Pick<Dataset, "resources" | "policyExceptions">) => {
  const total = sum(ds.resources, (r) => r.monthlyCost);
  const active = ds.resources.filter((r) => r.state !== "Decommissioned");
  const issues = (Object.keys(GOVERNANCE_META) as GovernanceIssue[]).map((key) => {
    if (key === "policy_exception") {
      const ex = ds.policyExceptions.filter((e) => e.status !== "Expired");
      return { key, ...GOVERNANCE_META[key], count: ex.length, cost: 0, compliancePct: Math.max(0, 100 - ex.filter((e) => e.status === "Expiring").length * 8 - ds.policyExceptions.filter((e) => e.status === "Expired").length * 10) };
    }
    const affected = active.filter((r) => r.governanceIssues.includes(key));
    const cost = sum(affected, (r) => r.monthlyCost);
    const countShare = affected.length / active.length;
    const costShare = cost / total;
    // Compliance blends resource-count and spend exposure so small-but-numerous issues still register.
    const compliancePct = Math.max(0, 100 - (countShare * 0.5 + costShare * 0.5) * 100 * 4);
    return { key, ...GOVERNANCE_META[key], count: affected.length, cost, compliancePct };
  });
  const score = sum(issues, (i) => i.compliancePct * i.weight) / sum(issues, (i) => i.weight);
  const unallocated = issues.find((i) => i.key === "missing_cost_center")!.cost;
  const tagged = active.filter((r) => r.ownerId && r.costCenter).length;
  return {
    score,
    grade: score >= 85 ? "Strong" : score >= 70 ? "Fair" : "Needs attention",
    issues,
    unallocatedSpend: unallocated,
    unallocatedPct: (unallocated / total) * 100,
    taggingCompliancePct: (tagged / active.length) * 100,
    resourcesWithIssues: active.filter((r) => r.governanceIssues.length > 0).length,
    activeResources: active.length,
  };
});

// ---------------------------------------------------------------------------
// Commitments
// ---------------------------------------------------------------------------
export function commitmentSummary(ds: Dataset) {
  const eligible = sum(
    ds.resources.filter((r) => r.environment === "Production" && r.state === "Running" && ["Virtual Machine", "AKS Node Pool", "SQL Database", "VM Scale Set"].includes(r.type)),
    (r) => r.monthlyCost,
  );
  const covered = sum(ds.reservations, (r) => (r.monthlyOnDemandEquivalent * r.utilization) / 100);
  const commitmentCost = sum(ds.reservations, (r) => r.monthlyCommitment);
  const wasted = sum(ds.reservations, (r) => (r.monthlyCommitment * (100 - r.utilization)) / 100);
  const weightedUtil = sum(ds.reservations, (r) => r.utilization * r.monthlyCommitment) / commitmentCost;
  const opportunities = ds.recommendations.filter((r) => r.category === "Commitments");
  const benefit = sum(ds.reservations, (r) => (r.monthlyOnDemandEquivalent * r.utilization) / 100 - r.monthlyCommitment);
  return {
    eligible,
    covered,
    coveragePct: (covered / eligible) * 100,
    onDemandExposure: eligible - covered,
    commitmentCost,
    utilizationPct: weightedUtil,
    wastedMonthly: wasted,
    monthlyBenefit: benefit,
    underutilized: ds.reservations.filter((r) => r.utilization < 80),
    expiringSoon: ds.reservations.filter((r) => daysBetween(AS_OF, r.expiryDate) <= 90),
    opportunities,
    openOpportunityAnnual: sum(opportunities.filter((r) => isOpen(r.stage)), annual),
  };
}

// ---------------------------------------------------------------------------
// Anomalies
// ---------------------------------------------------------------------------
export function anomalyImpact(a: Anomaly) {
  const delta = a.observedDaily - a.baselineDaily;
  return { delta, deviationPct: (delta / a.baselineDaily) * 100, estimatedImpact: delta * (a.status === "Resolved" ? 3 : 30) };
}

export function anomalySummary(ds: Dataset) {
  const open = ds.anomalies.filter((a) => a.status !== "Resolved");
  return {
    open: open.length,
    new: ds.anomalies.filter((a) => a.status === "New").length,
    openImpact: sum(open, (a) => anomalyImpact(a).estimatedImpact),
    resolved: ds.anomalies.filter((a) => a.status === "Resolved").length,
  };
}

// ---------------------------------------------------------------------------
// Resource optimization status (derived from live recommendation state)
// ---------------------------------------------------------------------------
export function resourceOptimizationStatus(ds: Dataset) {
  const m = new Map<string, "Opportunity" | "In delivery" | "Optimized" | "Deferred" | "None">();
  for (const r of ds.recommendations) {
    const cur = m.get(r.resourceId);
    const s = isRealized(r.stage)
      ? "Optimized"
      : r.stage === "identified" || r.stage === "validated"
        ? "Opportunity"
        : r.stage === "deferred"
          ? "Deferred"
          : r.stage === "rejected"
            ? "None"
            : "In delivery";
    if (!cur || cur === "None" || (cur === "Optimized" && s !== "None")) m.set(r.resourceId, s);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Persona work queues
// ---------------------------------------------------------------------------
export function engineeringQueue(ds: Dataset, user: User) {
  // Owner-scoped: an engineering owner works only items where ownerId equals their id.
  const mine = ds.recommendations.filter((r) => r.ownerId === user.id && isOpen(r.stage));
  return {
    mine,
    decision: mine.filter((r) => r.stage === "assigned"),
    overdue: mine.filter((r) => slaStatus(r).status === "Breached"),
    highPriority: mine.filter((r) => r.priority === "Critical" || r.priority === "High"),
    highSavings: [...mine].sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings).slice(0, 15),
    awaitingAction: mine.filter((r) => ["assigned", "in_progress", "submitted", "approved"].includes(r.stage)),
  };
}

export interface AttentionItem {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
  roles: Role[];
}

export function attentionItems(ds: Dataset): AttentionItem[] {
  const L = lookup(ds);
  const s = savingsSummary(ds);
  const items: AttentionItem[] = [];
  const all: Role[] = ["executive", "finops", "engineering", "admin"];
  const top = topOpportunities(ds, 1)[0];
  if (top && !top.ownerId)
    items.push({ id: `unowned-${top.id}`, severity: "critical", title: `${money0(annual(top))}/yr opportunity has no owner`, detail: top.title, href: `/recommendations/${top.id}`, roles: ["executive", "finops"] });
  for (const r of s.pendingApproval.sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings).slice(0, 3))
    items.push({ id: `approve-${r.id}`, severity: "warning", title: "Approval pending", detail: `${r.id} · ${money0(annual(r))}/yr · ${L.teamName(r.teamId)}`, href: `/recommendations/${r.id}`, roles: ["executive", "finops"] });
  const breached = ds.recommendations.filter((r) => isOpen(r.stage) && slaStatus(r).status === "Breached").sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings);
  if (breached.length)
    items.push({ id: "breached", severity: "critical", title: `${breached.length} recommendations past SLA`, detail: `${money0(breached.reduce((a, r) => a + annual(r), 0))}/yr at risk — largest ${breached[0].id}`, href: "/recommendations?sla=Breached", roles: all });
  const dueSoon = ds.recommendations.filter((r) => isOpen(r.stage) && slaStatus(r).status === "Due soon");
  if (dueSoon.length) items.push({ id: "due-soon", severity: "warning", title: `${dueSoon.length} SLAs due within 7 days`, detail: "Escalate blockers before breach", href: "/recommendations?sla=Due%20soon", roles: all });
  for (const a of ds.anomalies.filter((x) => x.status === "New"))
    items.push({ id: `anomaly-${a.id}`, severity: "warning", title: `Spend anomaly: ${a.service}`, detail: `${L.subName(a.subscriptionId)} · +${Math.round(anomalyImpact(a).deviationPct)}% vs baseline`, href: "/anomalies", roles: all });
  if (s.pendingVerification.length)
    items.push({ id: "verify", severity: "info", title: `${s.pendingVerification.length} implementations awaiting savings verification`, detail: `${money0(s.pendingVerification.reduce((a, r) => a + annual(r), 0))}/yr ready to verify`, href: "/recommendations?stage=implemented", roles: ["finops"] });
  if (s.pendingValidation.length)
    items.push({ id: "validate", severity: "info", title: `${s.pendingValidation.length} new opportunities awaiting validation`, detail: `${money0(s.pendingValidation.reduce((a, r) => a + annual(r), 0))}/yr identified by FCC rules`, href: "/recommendations?stage=identified", roles: ["finops"] });
  const exp = ds.reservations.filter((r) => daysBetween(AS_OF, r.expiryDate) <= 60);
  if (exp.length) items.push({ id: "ri-expiry", severity: "info", title: `${exp.length} commitments expire within 60 days`, detail: exp.map((r) => r.name).join(", "), href: "/optimization?tab=commitments", roles: ["finops", "executive"] });
  return items;
}

function money0(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

export { daysBetween };
