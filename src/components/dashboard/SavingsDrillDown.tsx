"use client";
// Read-only leadership drill-down: portfolio → product → owner → recommendation (detail page shows status, ticket and outcome).
// Estimated (pipeline, not yet realized) and verified (realized after billing verification) savings are always shown separately.
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ExportButton } from "@/components/data/blocks";
import { StageBadge } from "@/components/data/badges";
import { Card, CardHeader } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { annual, lookup } from "@/lib/demo/selectors";
import { isOpen, isRealized } from "@/lib/demo/workflow";
import { money, num } from "@/lib/format";
import type { CsvColumn } from "@/lib/csv";
import type { Dataset, Recommendation } from "@/lib/demo/types";

export interface DrillRow {
  key: string;
  label: string;
  count: number;
  openCount: number;
  estimatedAnnual: number; // open pipeline, not yet realized
  verifiedAnnual: number; // realized after verification
}

export const verifiedAnnual = (r: Recommendation) => (isRealized(r.stage) ? r.realizedMonthlySavings * 12 : 0);

/** Groups recommendations and splits estimated (open) from verified (realized) annual savings. */
export function rollUp(recs: Recommendation[], keyOf: (r: Recommendation) => string, labelOf: (key: string) => string): DrillRow[] {
  const map = new Map<string, DrillRow>();
  for (const r of recs) {
    const key = keyOf(r);
    const row = map.get(key) ?? { key, label: labelOf(key), count: 0, openCount: 0, estimatedAnnual: 0, verifiedAnnual: 0 };
    row.count += 1;
    if (isOpen(r.stage)) {
      row.openCount += 1;
      row.estimatedAnnual += annual(r);
    }
    row.verifiedAnnual += verifiedAnnual(r);
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.estimatedAnnual + b.verifiedAnnual - (a.estimatedAnnual + a.verifiedAnnual));
}

function productOf(ds: Dataset) {
  const L = lookup(ds);
  return (r: Recommendation) => L.resource(r.resourceId)?.applicationId ?? "unmapped";
}

const ROW_COLUMNS: CsvColumn<DrillRow>[] = [
  { header: "Name", value: (r) => r.label },
  { header: "Recommendations", value: (r) => r.count },
  { header: "Open", value: (r) => r.openCount },
  { header: "Estimated annual savings — open (USD)", value: (r) => Math.round(r.estimatedAnnual) },
  { header: "Verified annual savings — realized (USD)", value: (r) => Math.round(r.verifiedAnnual) },
];

export function SavingsDrillDown() {
  const { ds } = useDemo();
  const L = lookup(ds);
  const [product, setProduct] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const prodOf = useMemo(() => productOf(ds), [ds]);
  const productName = (k: string) => (k === "unmapped" ? "Unmapped" : (L.application(k)?.name ?? k));
  const ownerName = (k: string) => (k === "unassigned" ? "Unassigned" : L.userName(k));

  const inProduct = useMemo(() => (product ? ds.recommendations.filter((r) => prodOf(r) === product) : []), [ds, product, prodOf]);
  const inOwner = useMemo(() => (owner ? inProduct.filter((r) => (r.ownerId ?? "unassigned") === owner) : []), [inProduct, owner]);

  const level = owner ? "rec" : product ? "owner" : "product";
  const rows = useMemo(() => {
    if (level === "product") return rollUp(ds.recommendations, prodOf, productName);
    if (level === "owner") return rollUp(inProduct, (r) => r.ownerId ?? "unassigned", ownerName);
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, ds, inProduct, prodOf]);
  const recs = useMemo(() => [...inOwner].sort((a, b) => annual(b) - annual(a)), [inOwner]);

  const crumbs: { label: string; onClick?: () => void }[] = [
    { label: "All products", onClick: product ? () => (setProduct(null), setOwner(null)) : undefined },
    ...(product ? [{ label: productName(product), onClick: owner ? () => setOwner(null) : undefined }] : []),
    ...(owner ? [{ label: ownerName(owner) }] : []),
  ];

  const totals = (level === "rec" ? rollUp(inOwner, () => "all", () => "all") : rows).reduce(
    (t, r) => ({ est: t.est + r.estimatedAnnual, ver: t.ver + r.verifiedAnnual }),
    { est: 0, ver: 0 },
  );

  return (
    <Card>
      <CardHeader
        title="Savings drill-down"
        subtitle="Product → owner → recommendation. Estimated savings are open pipeline; verified savings are confirmed against billing."
        action={
          level === "rec" ? (
            <ExportButton
              rows={recs}
              columns={[
                { header: "ID", value: (r) => r.id },
                { header: "Title", value: (r) => r.title },
                { header: "Status", value: (r) => r.stage },
                { header: "Ticket", value: (r) => r.ticketId ?? "" },
                { header: "Estimated annual (USD)", value: (r) => (isOpen(r.stage) ? annual(r) : 0) },
                { header: "Verified annual (USD)", value: (r) => verifiedAnnual(r) },
              ]}
              filename="drilldown-recommendations"
              label="Export"
              size="sm"
            />
          ) : (
            <ExportButton rows={rows} columns={ROW_COLUMNS} filename={`drilldown-${level}s`} label="Export" size="sm" />
          )
        }
      />
      <div className="mt-3">
        <nav aria-label="Drill-down path" className="mb-3 flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />}
              {c.onClick ? (
                <button type="button" onClick={c.onClick} className="rounded font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                  {c.label}
                </button>
              ) : (
                <span className="font-semibold text-slate-900" aria-current="page">
                  {c.label}
                </span>
              )}
            </span>
          ))}
        </nav>
        <dl className="mb-3 grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-lg bg-brand-50/70 px-3 py-2">
            <dt className="text-[11px] text-brand-700">Estimated (open pipeline)</dt>
            <dd className="num text-lg font-semibold text-slate-900">{money(totals.est)}/yr</dd>
          </div>
          <div className="rounded-lg bg-emerald-50 px-3 py-2">
            <dt className="text-[11px] text-emerald-700">Verified (realized)</dt>
            <dd className="num text-lg font-semibold text-slate-900">{money(totals.ver)}/yr</dd>
          </div>
        </dl>
        <div className="overflow-x-auto">
          {level !== "rec" ? (
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">{level === "product" ? "Savings by product" : "Savings by owner"}</caption>
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th scope="col" className="py-2 pr-3 font-semibold">{level === "product" ? "Product" : "Owner"}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Open / total</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Estimated /yr</th>
                  <th scope="col" className="py-2 text-right font-semibold">Verified /yr</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      <button
                        type="button"
                        onClick={() => (level === "product" ? setProduct(r.key) : setOwner(r.key))}
                        className="flex items-center gap-1 rounded font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        aria-label={`Drill into ${r.label}`}
                      >
                        {r.label}
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </th>
                    <td className="num py-2 pr-3 text-right text-slate-600">
                      {num(r.openCount)} / {num(r.count)}
                    </td>
                    <td className="num py-2 pr-3 text-right text-slate-900">{money(r.estimatedAnnual)}</td>
                    <td className="num py-2 text-right font-medium text-emerald-700">{money(r.verifiedAnnual)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500">
                      No recommendations in this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recs.map((r) => (
                <li key={r.id}>
                  <Link href={`/recommendations/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded px-1 py-2 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    <span className="font-mono text-xs text-slate-500">{r.id}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{r.title}</span>
                    <StageBadge stage={r.stage} />
                    <span className="text-xs text-slate-500">{r.ticketId ? `Ticket ${r.ticketId}` : "No ticket"}</span>
                    <span className="num w-28 text-right text-sm">{isRealized(r.stage) ? <span className="font-medium text-emerald-700">{money(verifiedAnnual(r))} verified</span> : isOpen(r.stage) ? `${money(annual(r))} est.` : "—"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
