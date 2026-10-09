import { describe, expect, it } from "vitest";
import { generateDataset, getSeedDataset } from "@/lib/demo/seed";
import { validateDataset } from "@/lib/demo/validation";
import { annual, governanceSummary, savingsSummary, spendBySubscription, spendSummary, staticRunRate, categoryRunRate } from "@/lib/demo/selectors";
import { isOpen, isRealized } from "@/lib/demo/workflow";

describe("demo dataset", () => {
  const ds = getSeedDataset();

  it("passes every integrity check", () => {
    const res = validateDataset(ds);
    const failed = res.checks.filter((c) => !c.ok);
    expect(failed, failed.map((f) => `${f.name}: ${f.detail}`).join("\n")).toEqual([]);
    expect(res.checks.length).toBeGreaterThanOrEqual(20);
  });

  it("is deterministic across generations", () => {
    const a = generateDataset();
    const b = generateDataset();
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("has enterprise-scale, realistic volumes", () => {
    expect(ds.resources.length).toBeGreaterThan(2000);
    expect(ds.recommendations.length).toBeGreaterThan(300);
    const rr = staticRunRate(ds.resources);
    expect(rr).toBeGreaterThan(8_000_000);
    expect(rr).toBeLessThan(20_000_000);
  });

  it("reconciles run-rate across category and subscription views", () => {
    const rr = staticRunRate(ds.resources);
    const byCat = [...categoryRunRate(ds.resources).values()].reduce((s, v) => s + v, 0);
    const bySub = spendBySubscription(ds).reduce((s, r) => s + r.runRate, 0);
    expect(byCat).toBeCloseTo(rr, 0);
    expect(bySub).toBeCloseTo(rr, 0);
  });

  it("derives savings metrics from recommendation records", () => {
    const s = savingsSummary(ds);
    const open = ds.recommendations.filter((r) => isOpen(r.stage));
    expect(s.openAnnual).toBeCloseTo(open.reduce((a, r) => a + annual(r), 0), 2);
    expect(s.openCount).toBe(open.length);
    expect(s.realizedAnnual).toBeCloseTo(ds.recommendations.filter((r) => isRealized(r.stage)).reduce((a, r) => a + r.realizedMonthlySavings * 12, 0), 2);
    expect(s.identifiedAnnual).toBeGreaterThanOrEqual(s.validatedAnnual);
    expect(s.validatedAnnual).toBeGreaterThanOrEqual(s.approvedAnnual);
    expect(s.approvedAnnual).toBeGreaterThanOrEqual(s.implementedAnnual);
  });

  it("produces finite headline numbers and a sane forecast", () => {
    const sp = spendSummary(ds);
    for (const v of Object.values(sp)) expect(Number.isFinite(v)).toBe(true);
    expect(sp.forecast).toBeGreaterThan(sp.mtd);
    expect(Math.abs(sp.variancePct)).toBeLessThan(15);
    const g = governanceSummary(ds);
    expect(g.score).toBeGreaterThan(0);
    expect(g.score).toBeLessThanOrEqual(100);
  });

  it("keeps the hero recommendation as the largest open opportunity", () => {
    const top = ds.recommendations.filter((r) => isOpen(r.stage)).sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings)[0];
    expect(top.id).toBe("REC-2041");
    expect(top.stage).toBe("validated");
    expect(top.ownerId).toBeNull();
  });
});
