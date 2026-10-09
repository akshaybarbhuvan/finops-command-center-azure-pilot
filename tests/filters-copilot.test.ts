import { describe, expect, it } from "vitest";
import { getSeedDataset } from "@/lib/demo/seed";
import { applyRecFilters, EMPTY_FILTERS, filtersFromParams, filtersToQuery } from "@/lib/demo/filters";
import { annual, savingsSummary } from "@/lib/demo/selectors";
import { askCopilot, SUGGESTED_QUESTIONS } from "@/lib/demo/copilot";
import { money } from "@/lib/format";

const ds = getSeedDataset();

describe("recommendation filters", () => {
  it("filters by stage, category, owner and savings", () => {
    const open = applyRecFilters(ds, ds.recommendations, { ...EMPTY_FILTERS, stage: "open" });
    expect(open.length).toBe(savingsSummary(ds).openCount);
    const compute = applyRecFilters(ds, ds.recommendations, { ...EMPTY_FILTERS, category: "Compute" });
    expect(compute.every((r) => r.category === "Compute")).toBe(true);
    const unassigned = applyRecFilters(ds, ds.recommendations, { ...EMPTY_FILTERS, owner: "unassigned", stage: "open" });
    expect(unassigned.every((r) => r.ownerId === null)).toBe(true);
    const big = applyRecFilters(ds, ds.recommendations, { ...EMPTY_FILTERS, minSavings: "250000" });
    expect(big.every((r) => annual(r) >= 250000)).toBe(true);
    expect(big.some((r) => r.id === "REC-2041")).toBe(true);
  });

  it("searches by ID and resource", () => {
    expect(applyRecFilters(ds, ds.recommendations, { ...EMPTY_FILTERS, q: "rec-2041" }).map((r) => r.id)).toEqual(["REC-2041"]);
    expect(applyRecFilters(ds, ds.recommendations, { ...EMPTY_FILTERS, q: "hana" }).length).toBeGreaterThan(0);
  });

  it("round-trips through the URL", () => {
    const f = { ...EMPTY_FILTERS, stage: "submitted", category: "Storage" };
    expect(filtersFromParams(new URLSearchParams(filtersToQuery(f).slice(1)))).toEqual(f);
  });
});

describe("copilot", () => {
  it("answers every suggested question from the dataset", () => {
    for (const q of SUGGESTED_QUESTIONS) {
      const a = askCopilot(ds, q);
      expect(a.title).not.toBe("Try one of these questions");
      expect(a.summary).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("quotes the same open opportunity the dashboard shows", () => {
    const a = askCopilot(ds, "Where can we save the most?");
    expect(a.summary).toContain(money(savingsSummary(ds).openAnnual));
  });
});

import { filterChips, filterOptions, removeChip, splitValues } from "@/lib/demo/filters";

describe("multi-select filters", () => {
  it("ORs values within a dimension and ANDs across dimensions", () => {
    const a = applyRecFilters(ds, ds.recommendations, { ...EMPTY_FILTERS, category: "Compute" }).length;
    const b = applyRecFilters(ds, ds.recommendations, { ...EMPTY_FILTERS, category: "Storage" }).length;
    const both = applyRecFilters(ds, ds.recommendations, { ...EMPTY_FILTERS, category: "Compute,Storage" });
    expect(both.length).toBe(a + b);
    const and = applyRecFilters(ds, ds.recommendations, { ...EMPTY_FILTERS, category: "Compute,Storage", stage: "open" });
    expect(and.length).toBeLessThanOrEqual(both.length);
    expect(and.every((r) => r.category === "Compute" || r.category === "Storage")).toBe(true);
  });

  it("applies monthly savings ranges", () => {
    const r = applyRecFilters(ds, ds.recommendations, { ...EMPTY_FILTERS, minMonthly: "1000", maxMonthly: "5000" });
    expect(r.every((x) => x.estimatedMonthlySavings >= 1000 && x.estimatedMonthlySavings <= 5000)).toBe(true);
  });

  it("builds options from the dataset it is given (authorization before filters)", () => {
    const priyaRecs = ds.recommendations.filter((r) => r.ownerId === "u-priya");
    const owners = filterOptions(ds, priyaRecs).owner.map((o) => o.value);
    expect(owners.every((v) => v === "u-priya")).toBe(true);
    expect(filterOptions(ds).category.length).toBeGreaterThan(1);
  });

  it("creates one chip per value and removes a single value", () => {
    const f = { ...EMPTY_FILTERS, category: "Compute,Storage", minSavings: "1000" };
    const chips = filterChips(ds, f);
    expect(chips.filter((c) => c.key === "category")).toHaveLength(2);
    const next = removeChip(f, chips.find((c) => c.value === "Compute")!);
    expect(splitValues(next.category)).toEqual(["Storage"]);
    expect(removeChip(f, chips.find((c) => c.key === "minSavings")!).minSavings).toBe("");
  });
});
