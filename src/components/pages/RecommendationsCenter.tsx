"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, ExportButton } from "@/components/data/blocks";
import { RecFilterBar } from "@/components/recommendations/RecFilterBar";
import { RecommendationGrid } from "@/components/recommendations/RecommendationTable";
import { Card, SegmentedControl, cx } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { applyRecFilters, filtersFromParams, filtersToQuery, type RecFilters } from "@/lib/demo/filters";
import { annual, lookup } from "@/lib/demo/selectors";
import { LIFECYCLE, STAGE_META } from "@/lib/demo/workflow";
import { money, num } from "@/lib/format";
import { recallQuery, rememberQuery } from "@/lib/hooks/filter-memory";
import type { Stage } from "@/lib/demo/types";

export function RecommendationsCenter() {
  const { ds, persona } = useDemo();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<RecFilters>(() => {
    if (params.toString()) return filtersFromParams(params);
    // Returning from a detail page without URL params: restore the filters used last in this tab.
    const remembered = recallQuery(pathname);
    if (remembered) return filtersFromParams(new URLSearchParams(remembered));
    return filtersFromParams(null, persona === "engineering" ? { stage: "open" } : {});
  });
  const [view, setView] = useState<"table" | "board">("table");

  // Keep URL in sync so filtered views are shareable and back-navigation works.
  useEffect(() => {
    const next = filtersToQuery(filters);
    rememberQuery(pathname, next);
    if (next !== (params.toString() ? `?${params.toString()}` : "")) router.replace(`${pathname}${next}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);
  useEffect(() => {
    if (params.toString()) setFilters(filtersFromParams(params));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()]);

  const rows = useMemo(() => applyRecFilters(ds, ds.recommendations, filters), [ds, filters]);
  const totals = useMemo(() => ({ annual: rows.reduce((s, r) => s + annual(r), 0), unowned: rows.filter((r) => !r.ownerId && STAGE_META[r.stage].open).length }), [rows]);
  const L = lookup(ds);

  const stageChips: { id: string; label: string; count: number }[] = [
    { id: "", label: "All", count: ds.recommendations.length },
    { id: "open", label: "Open", count: ds.recommendations.filter((r) => STAGE_META[r.stage].open).length },
    ...(["identified", "validated", "assigned", "in_progress", "submitted", "approved", "implemented"] as Stage[]).map((s) => ({ id: s, label: STAGE_META[s].label, count: ds.recommendations.filter((r) => r.stage === s).length })),
    { id: "realized", label: "Realized", count: ds.recommendations.filter((r) => r.stage === "verified" || r.stage === "closed").length },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[{ label: "Optimize" }, { label: "Recommendations" }]}
        title="Recommendation Center"
        subtitle="Every optimization opportunity with its owner, lifecycle stage, SLA and estimated savings. Select a row for a quick view."
        actions={
          <>
            <SegmentedControl label="View" value={view} onChange={setView} options={[{ id: "table", label: "Table" }, { id: "board", label: "Lifecycle board" }]} />
            <ExportButton
              rows={rows}
              filename="fcc-recommendations.csv"
              columns={[
                { header: "ID", value: (r) => r.id },
                { header: "Title", value: (r) => r.title },
                { header: "Category", value: (r) => r.category },
                { header: "Resource", value: (r) => L.resource(r.resourceId)?.name },
                { header: "Subscription", value: (r) => L.subName(r.subscriptionId) },
                { header: "Resource group", value: (r) => r.resourceGroup },
                { header: "Team", value: (r) => L.teamName(r.teamId) },
                { header: "Owner", value: (r) => L.userName(r.ownerId) },
                { header: "Stage", value: (r) => STAGE_META[r.stage].label },
                { header: "Priority", value: (r) => r.priority },
                { header: "Risk", value: (r) => r.risk },
                { header: "Current monthly cost (USD)", value: (r) => r.currentMonthlyCost },
                { header: "Est. monthly savings (USD)", value: (r) => r.estimatedMonthlySavings },
                { header: "Est. annual savings (USD)", value: (r) => annual(r) },
                { header: "Confidence %", value: (r) => r.confidence },
                { header: "Created", value: (r) => r.createdDate },
                { header: "Due", value: (r) => r.dueDate },
                { header: "Ticket", value: (r) => r.ticketId ?? "" },
              ]}
            />
          </>
        }
      />

      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin" role="tablist" aria-label="Lifecycle stage quick filters">
        {stageChips.map((c) => (
          <button
            key={c.id || "all"}
            type="button"
            role="tab"
            aria-selected={filters.stage === c.id}
            onClick={() => setFilters({ ...filters, stage: c.id })}
            className={cx("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition", filters.stage === c.id ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white text-slate-600 hover:border-slate-300")}
          >
            {c.label}
            <span className={cx("num", filters.stage === c.id ? "text-white/80" : "text-slate-400")}>{c.count}</span>
          </button>
        ))}
      </div>

      <Card className="px-4 py-3">
        <RecFilterBar value={filters} onChange={setFilters} compact resultCount={rows.length} totalCount={ds.recommendations.length} />
      </Card>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-1 text-sm text-slate-600">
        <span>
          <strong className="font-semibold text-slate-900 num">{num(rows.length)}</strong> recommendations
        </span>
        <span>
          <strong className="font-semibold text-slate-900 num">{money(totals.annual)}</strong> estimated annual savings
        </span>
        {totals.unowned > 0 && (
          <span>
            <strong className="font-semibold text-amber-700 num">{num(totals.unowned)}</strong> open without an owner
          </span>
        )}
      </div>

      {view === "table" ? (
        <Card>
          <RecommendationGrid rows={rows} caption="Recommendations" selectable exportName="recommendations-selected" />
        </Card>
      ) : (
        <LifecycleBoard rows={rows} />
      )}
    </div>
  );
}

function LifecycleBoard({ rows }: { rows: ReturnType<typeof applyRecFilters> }) {
  const { ds } = useDemo();
  const L = lookup(ds);
  const router = useRouter();
  const stages = LIFECYCLE;
  return (
    <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin">
      {stages.map((s) => {
        const items = rows.filter((r) => r.stage === s).sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings);
        return (
          <section key={s} className="flex w-64 shrink-0 flex-col rounded-xl border border-line bg-slate-50/70" aria-label={STAGE_META[s].label}>
            <header className="flex items-center justify-between px-3 py-2.5">
              <span className="text-xs font-semibold text-slate-700">{STAGE_META[s].label}</span>
              <span className="text-[11px] text-slate-500 num">
                {items.length} · {money(items.reduce((a, r) => a + annual(r), 0))}
              </span>
            </header>
            <ul className="max-h-[560px] space-y-2 overflow-y-auto px-2 pb-2 scrollbar-thin">
              {items.slice(0, 25).map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => router.push(`/recommendations/${r.id}`)} className="w-full rounded-lg border border-line bg-white p-2.5 text-left shadow-sm transition hover:border-brand-200 hover:shadow-lift">
                    <div className="flex items-center justify-between text-[10.5px] text-slate-400">
                      <span className="font-mono">{r.id}</span>
                      <span className="font-semibold text-slate-800 num">{money(annual(r))}/yr</span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-[12.5px] font-medium leading-snug text-slate-800">{r.title}</div>
                    <div className="mt-1.5 truncate text-[11px] text-slate-500">{L.userName(r.ownerId)}</div>
                  </button>
                </li>
              ))}
              {items.length > 25 && <li className="px-1 text-center text-[11px] text-slate-500">+{items.length - 25} more — refine filters or use the table view</li>}
              {items.length === 0 && <li className="px-1 py-6 text-center text-[11px] text-slate-400">No items</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
