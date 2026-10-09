// Demo data quality gate. Runs in tests, in `npm run validate:demo`, and at app start in development.
import { AS_OF } from "./org";
import { addDays, daysBetween, HISTORY_MONTHS } from "./seed";
import { savingsSummary, spendSummary, staticRunRate } from "./selectors";
import { canTransition, isRealized, LIFECYCLE } from "./workflow";
import type { Dataset } from "./types";

export interface ValidationResult {
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
}

export function validateDataset(ds: Dataset): ValidationResult {
  const checks: ValidationResult["checks"] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const users = new Set(ds.users.map((u) => u.id));
  const subs = new Set(ds.subscriptions.map((s) => s.id));
  const resources = new Map(ds.resources.map((r) => [r.id, r]));
  const teams = new Set(ds.teams.map((t) => t.id));

  // Totals reconcile: category and subscription views both sum to the run-rate.
  const rr = staticRunRate(ds.resources);
  const bySub = ds.subscriptions.reduce((s, sub) => s + ds.resources.filter((r) => r.subscriptionId === sub.id).reduce((a, r) => a + r.monthlyCost, 0), 0);
  add("Run-rate reconciles across subscriptions", Math.abs(bySub - rr) < 1, `run-rate ${rr.toFixed(0)} vs Σsubscriptions ${bySub.toFixed(0)}`);
  const monthRows = ds.monthlyCosts.filter((r) => r.month === HISTORY_MONTHS[HISTORY_MONTHS.length - 1]);
  const lastMonth = monthRows.reduce((s, r) => s + r.cost, 0);
  add("Prior-month daily costs reconcile to monthly total", Math.abs(ds.priorMonthDailyCosts.reduce((s, r) => s + r.cost, 0) - lastMonth) < 5, `Σdaily vs monthly within $5`);
  const sp = spendSummary(ds);
  add("Forecast ≥ month-to-date", sp.forecast >= sp.mtd, `forecast ${sp.forecast.toFixed(0)} / MTD ${sp.mtd.toFixed(0)}`);

  // Savings reconcile & pipeline monotonic.
  const sv = savingsSummary(ds);
  add("Savings pipeline is monotonic (Identified ≥ Validated ≥ Approved ≥ Implemented)", sv.identifiedAnnual >= sv.validatedAnnual && sv.validatedAnnual >= sv.approvedAnnual && sv.approvedAnnual >= sv.implementedAnnual, "cumulative funnel");
  add("Realized savings do not exceed implemented estimate by more than 5%", sv.realizedAnnual <= sv.implementedAnnual * 1.05, `${sv.realizedAnnual.toFixed(0)} ≤ ${(sv.implementedAnnual * 1.05).toFixed(0)}`);
  const overSaved = ds.recommendations.filter((r) => r.estimatedMonthlySavings > r.currentMonthlyCost + 0.5);
  add("No recommendation saves more than its current cost", overSaved.length === 0, overSaved.slice(0, 3).map((r) => r.id).join(", ") || "all within cost");

  // Lifecycle integrity.
  const badTransitions = ds.recommendations.filter((r) => {
    if (r.history[0]?.stage !== "identified") return true;
    for (let i = 1; i < r.history.length; i++) {
      if (!canTransition(r.history[i - 1].stage, r.history[i].stage)) return true;
      if (r.history[i].at < r.history[i - 1].at) return true;
    }
    return r.history[r.history.length - 1].stage !== r.stage;
  });
  add("No invalid lifecycle transitions", badTransitions.length === 0, badTransitions.slice(0, 3).map((r) => r.id).join(", ") || `${ds.recommendations.length} histories valid`);
  const futureEvents = ds.recommendations.filter((r) => r.history.some((h) => h.at > AS_OF));
  add("No lifecycle events dated in the future", futureEvents.length === 0, futureEvents.slice(0, 3).map((r) => r.id).join(", ") || "ok");
  const realizedWithoutDate = ds.recommendations.filter((r) => isRealized(r.stage) !== Boolean(r.realizedDate));
  add("Realized stage ⇔ realized date", realizedWithoutDate.length === 0, realizedWithoutDate.slice(0, 3).map((r) => r.id).join(", ") || "ok");
  const assignedWithoutOwner = ds.recommendations.filter((r) => LIFECYCLE.indexOf(r.stage) >= LIFECYCLE.indexOf("assigned") && !r.ownerId);
  add("Assigned and later stages have an owner", assignedWithoutOwner.length === 0, assignedWithoutOwner.slice(0, 3).map((r) => r.id).join(", ") || "ok");

  // Referential integrity.
  const ticketIds = new Set(ds.tickets.map((t) => t.id));
  const recIds = new Set(ds.recommendations.map((r) => r.id));
  const orphanTickets = ds.tickets.filter((t) => !recIds.has(t.recommendationId));
  const danglingRefs = ds.recommendations.filter((r) => r.ticketId && !ticketIds.has(r.ticketId));
  add("No orphan ticket references", orphanTickets.length === 0 && danglingRefs.length === 0, `${ds.tickets.length} tickets linked`);
  const badOwners = [
    ...ds.recommendations.filter((r) => r.ownerId && !users.has(r.ownerId)).map((r) => r.id),
    ...ds.resources.filter((r) => r.ownerId && !users.has(r.ownerId)).map((r) => r.id),
    ...ds.tickets.filter((t) => !users.has(t.assigneeId)).map((t) => t.id),
    ...ds.anomalies.filter((a) => !users.has(a.ownerId)).map((a) => a.id),
    ...ds.subscriptions.filter((s) => !users.has(s.ownerId)).map((s) => s.id),
  ];
  add("Valid owner IDs", badOwners.length === 0, badOwners.slice(0, 3).join(", ") || "ok");
  const badSubs = [
    ...ds.resources.filter((r) => !subs.has(r.subscriptionId)).map((r) => r.id),
    ...ds.recommendations.filter((r) => !subs.has(r.subscriptionId)).map((r) => r.id),
    ...ds.anomalies.filter((a) => !subs.has(a.subscriptionId)).map((a) => a.id),
  ];
  add("Valid subscription references", badSubs.length === 0, badSubs.slice(0, 3).join(", ") || "ok");
  const badRes = ds.recommendations.filter((r) => !resources.has(r.resourceId) || resources.get(r.resourceId)!.subscriptionId !== r.subscriptionId);
  add("Valid resource references", badRes.length === 0, badRes.slice(0, 3).map((r) => r.id).join(", ") || "ok");
  const badTeams = ds.recommendations.filter((r) => !teams.has(r.teamId));
  add("Valid team references", badTeams.length === 0, "ok");

  // SLA and value ranges.
  const badDue = ds.recommendations.filter((r) => r.dueDate !== addDays(r.createdDate, r.slaDays));
  add("Due dates consistent with SLA", badDue.length === 0, badDue.slice(0, 3).map((r) => r.id).join(", ") || "ok");
  const badPct = [
    ...ds.resources.filter((r) => r.utilization < 0 || r.utilization > 100 || r.utilizationP95 < 0 || r.utilizationP95 > 100).map((r) => r.id),
    ...ds.recommendations.filter((r) => r.confidence < 0 || r.confidence > 100).map((r) => r.id),
    ...ds.reservations.filter((r) => r.utilization < 0 || r.utilization > 100).map((r) => r.id),
  ];
  add("Percentages within 0–100", badPct.length === 0, badPct.slice(0, 3).join(", ") || "ok");
  const negatives = [
    ...ds.resources.filter((r) => r.monthlyCost < 0).map((r) => r.id),
    ...ds.recommendations.filter((r) => r.estimatedMonthlySavings <= 0 || r.currentMonthlyCost <= 0).map((r) => r.id),
    ...ds.monthlyCosts.filter((r) => r.cost < 0).map((r) => `${r.month}/${r.subscriptionId}`),
    ...ds.anomalies.filter((a) => a.observedDaily <= a.baselineDaily).map((a) => a.id),
  ];
  add("No negative or impossible values", negatives.length === 0, negatives.slice(0, 3).join(", ") || "ok");
  const nan = [rr, sp.forecast, sp.mtd, sv.openAnnual, sv.realizedAnnual].some((v) => !Number.isFinite(v));
  add("Headline metrics are finite numbers", !nan, "no NaN / Infinity");
  const hero = ds.recommendations.find((r) => r.isHero);
  add("Hero recommendation present", Boolean(hero), hero ? `${hero.id} (${hero.stage})` : "missing");
  const ageOk = ds.recommendations.every((r) => daysBetween(r.createdDate, AS_OF) >= 0);
  add("Created dates not in the future", ageOk, "ok");

  return { ok: checks.every((c) => c.ok), checks };
}

export function assertValidDataset(ds: Dataset) {
  const res = validateDataset(ds);
  if (!res.ok) {
    const failed = res.checks.filter((c) => !c.ok).map((c) => `✗ ${c.name}: ${c.detail}`);
    throw new Error(`Demo dataset failed validation:\n${failed.join("\n")}`);
  }
  return res;
}
