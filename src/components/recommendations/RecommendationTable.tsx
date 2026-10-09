"use client";
import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { DataTable, type Column } from "@/components/data/DataTable";
import { PriorityBadge, SlaIndicator, StageBadge } from "@/components/data/badges";
import { Drawer } from "@/components/ui/overlay";
import { Avatar, Badge, ButtonLink, KeyValue } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { annual, lookup, slaStatus } from "@/lib/demo/selectors";
import { STAGE_META } from "@/lib/demo/workflow";
import { date, money, moneyExact, pct } from "@/lib/format";
import type { Recommendation } from "@/lib/demo/types";
import { RecommendationActions } from "./RecommendationActions";
import { BulkActionBar } from "./BulkActionBar";
import type { ReactNode } from "react";

export function useRecColumns(opts: { showTeam?: boolean } = {}): Column<Recommendation>[] {
  const { ds } = useDemo();
  return useMemo(() => {
    const L = lookup(ds);
    const cols: Column<Recommendation>[] = [
      {
        id: "title",
        header: "Recommendation",
        minWidth: 320,
        sortValue: (r) => r.title,
        cell: (r) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-slate-400">{r.id}</span>
              <Badge tone="neutral" className="!px-1.5 !py-0 text-[10.5px]">
                {r.category}
              </Badge>
            </div>
            <div className="mt-0.5 line-clamp-1 font-medium text-slate-900">{r.title}</div>
            <div className="truncate text-xs text-slate-500">
              {L.resource(r.resourceId)?.name} · {L.subName(r.subscriptionId)}
            </div>
          </div>
        ),
      },
      {
        id: "owner",
        header: "Owner",
        sortValue: (r) => L.userName(r.ownerId),
        cell: (r) =>
          r.ownerId ? (
            <div className="flex items-center gap-2">
              <Avatar initials={L.user(r.ownerId)!.initials} size="sm" tone="slate" />
              <div className="leading-tight">
                <div className="whitespace-nowrap text-[13px] text-slate-800">{L.userName(r.ownerId)}</div>
                {opts.showTeam !== false && <div className="whitespace-nowrap text-[11px] text-slate-500">{L.teamName(r.teamId)}</div>}
              </div>
            </div>
          ) : (
            <div className="leading-tight">
              <Badge tone="warning">Unassigned</Badge>
              <div className="mt-0.5 whitespace-nowrap text-[11px] text-slate-500">{L.teamName(r.teamId)}</div>
            </div>
          ),
      },
      { id: "stage", header: "Stage", sortValue: (r) => STAGE_META[r.stage].order, cell: (r) => <StageBadge stage={r.stage} /> },
      { id: "priority", header: "Priority", sortValue: (r) => ["Low", "Medium", "High", "Critical"].indexOf(r.priority), cell: (r) => <PriorityBadge priority={r.priority} /> },
      { id: "sla", header: "SLA", sortValue: (r) => slaStatus(r).daysLeft, cell: (r) => <SlaIndicator rec={r} compact /> },
      {
        id: "savings",
        header: "Est. annual savings",
        align: "right",
        sortValue: (r) => r.estimatedMonthlySavings,
        cell: (r) => (
          <div className="leading-tight">
            <div className="font-semibold text-slate-900">{money(annual(r))}</div>
            <div className="text-[11px] text-slate-500">{money(r.estimatedMonthlySavings)}/mo</div>
          </div>
        ),
      },
      { id: "confidence", header: "Confidence", align: "right", hideable: true, sortValue: (r) => r.confidence, cell: (r) => pct(r.confidence, 0) },
      { id: "ticket", header: "Ticket", hideable: true, defaultHidden: true, sortValue: (r) => r.ticketId ?? "", cell: (r) => (r.ticketId ? <span className="font-mono text-xs">{r.ticketId}</span> : <span className="text-slate-400">—</span>) },
      { id: "created", header: "Created", hideable: true, defaultHidden: true, sortValue: (r) => r.createdDate, cell: (r) => <span className="whitespace-nowrap">{date(r.createdDate)}</span> },
      { id: "subscription", header: "Subscription", hideable: true, defaultHidden: true, sortValue: (r) => L.subName(r.subscriptionId), cell: (r) => L.subName(r.subscriptionId) },
    ];
    return cols;
  }, [ds, opts.showTeam]);
}

export function RecommendationGrid({
  rows,
  caption,
  toolbar,
  pageSize = 20,
  initialSort = { id: "savings", dir: "desc" as const },
  emptyTitle,
  emptyBody,
  maxHeight,
  selectable,
  exportName = "recommendations-selected",
}: {
  rows: Recommendation[];
  caption: string;
  toolbar?: ReactNode;
  pageSize?: number;
  initialSort?: { id: string; dir: "asc" | "desc" };
  emptyTitle?: string;
  emptyBody?: ReactNode;
  maxHeight?: number;
  /** Enables row checkboxes and the role-aware bulk action toolbar. */
  selectable?: boolean;
  exportName?: string;
}) {
  const columns = useRecColumns();
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const { ds } = useDemo();
  const rec = selected ? ds.recommendations.find((r) => r.id === selected) ?? null : null;
  // Selection never outlives the filtered result: rows that drop out of the result are deselected.
  const rowIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const liveChecked = useMemo(() => new Set([...checked].filter((id) => rowIds.has(id))), [checked, rowIds]);
  const selectedRows = useMemo(() => rows.filter((r) => liveChecked.has(r.id)), [rows, liveChecked]);
  return (
    <>
      {selectable && liveChecked.size > 0 && (
        <div className="px-3 pt-3">
          <BulkActionBar selected={selectedRows} allRows={rows} onSelectAll={() => setChecked(new Set(rowIds))} onClear={() => setChecked(new Set())} exportName={exportName} />
        </div>
      )}
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={(r) => setSelected(r.id)}
        caption={caption}
        toolbar={toolbar}
        pageSize={pageSize}
        initialSort={initialSort}
        emptyTitle={emptyTitle}
        emptyBody={emptyBody}
        maxHeight={maxHeight}
        selection={selectable ? { selected: liveChecked, onChange: setChecked, label: (r) => `${r.id} ${r.title}` } : undefined}
      />
      {rec && <RecommendationDrawer rec={rec} onClose={() => setSelected(null)} />}
    </>
  );
}

export function RecommendationDrawer({ rec, onClose }: { rec: Recommendation; onClose: () => void }) {
  const { ds } = useDemo();
  const L = lookup(ds);
  const res = L.resource(rec.resourceId);
  return (
    <Drawer
      open
      onClose={onClose}
      title={rec.title}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs">{rec.id}</span>
          <StageBadge stage={rec.stage} />
          <PriorityBadge priority={rec.priority} />
          <SlaIndicator rec={rec} />
        </span>
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <RecommendationActions rec={rec} />
          <ButtonLink href={`/recommendations/${rec.id}`} variant="secondary" icon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
            Open full detail
          </ButtonLink>
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-brand-50/70 p-3">
          <div className="text-[11px] text-brand-700">Annual savings (est.)</div>
          <div className="mt-0.5 text-xl font-semibold text-slate-900 num">{money(annual(rec))}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-[11px] text-slate-500">Monthly savings</div>
          <div className="mt-0.5 text-xl font-semibold text-slate-900 num">{money(rec.estimatedMonthlySavings)}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-[11px] text-slate-500">Confidence</div>
          <div className="mt-0.5 text-xl font-semibold text-slate-900 num">{pct(rec.confidence, 0)}</div>
        </div>
      </div>
      <section className="mt-5">
        <h3 className="eyebrow">Why</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{rec.rationale}</p>
      </section>
      <section className="mt-5">
        <h3 className="eyebrow mb-2">Details</h3>
        <KeyValue
          items={[
            { label: "Resource", value: res?.name ?? rec.resourceId },
            { label: "Type", value: res?.type ?? "—" },
            { label: "Subscription", value: L.subName(rec.subscriptionId) },
            { label: "Resource group", value: rec.resourceGroup },
            { label: "Owner", value: L.userName(rec.ownerId) },
            { label: "Team", value: L.teamName(rec.teamId) },
            { label: "Current monthly cost", value: moneyExact(rec.currentMonthlyCost) },
            { label: "Risk / effort", value: `${rec.risk} / ${rec.effort}` },
            { label: "Created", value: date(rec.createdDate) },
            { label: "Due", value: date(rec.dueDate) },
            { label: "Ticket", value: rec.ticketId ?? "None" },
            { label: "Stage", value: STAGE_META[rec.stage].label },
          ]}
        />
      </section>
      <section className="mt-5">
        <h3 className="eyebrow mb-2">Remediation</h3>
        <ol className="space-y-1.5">
          {rec.remediation.map((s, i) => (
            <li key={s} className="flex gap-2.5 text-sm text-slate-700">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </section>
    </Drawer>
  );
}
