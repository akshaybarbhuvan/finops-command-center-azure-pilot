"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AlarmClock, ArrowRight, CircleDollarSign, ClipboardList, Flame, Inbox } from "lucide-react";
import { KpiGrid, MetricCard, PageHeader } from "@/components/data/blocks";
import { PriorityBadge, SlaIndicator, StageBadge, TicketStatusBadge } from "@/components/data/badges";
import { RecommendationGrid } from "@/components/recommendations/RecommendationTable";
import { Avatar, Badge, ButtonLink, Card, CardHeader, Tabs } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { annual, engineeringQueue, lookup } from "@/lib/demo/selectors";
import { money, num } from "@/lib/format";

type T = "mine" | "decision" | "overdue" | "highPriority" | "highSavings";

export function EngineeringQueue() {
  const { ds, user, persona } = useDemo();
  const L = lookup(ds);
  // FinOps/Admin viewing this page see the ERP Platform principal's queue as a reference.
  const subject = persona === "engineering" ? user : ds.users.find((u) => u.id === "u-priya")!;
  const q = useMemo(() => engineeringQueue(ds, subject), [ds, subject]);
  const [tab, setTab] = useState<T>("mine");
  const team = L.team(subject.teamId)!;
  const myTickets = ds.tickets.filter((t) => t.assigneeId === subject.id && !["Closed", "Cancelled"].includes(t.status));
  const actionable = [...q.awaitingAction].sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings);
  const sum = (xs: typeof q.mine) => xs.reduce((a, r) => a + annual(r), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "Command" }, { label: "Engineering Work Queue" }]}
        eyebrow={
          <div className="flex items-center gap-2">
            <Avatar initials={subject.initials} size="sm" />
            <span className="text-sm text-slate-600">
              {subject.name} · {team.name}
            </span>
            {persona !== "engineering" && <Badge tone="neutral">Viewing as reference</Badge>}
          </div>
        }
        title="Engineering Work Queue"
        subtitle="Items you own — accept or reject, ticket, plan, change approval reference and implementation evidence in one place."
        actions={<ButtonLink href="/tickets?mine=1">My tickets ({myTickets.length})</ButtonLink>}
      />

      <KpiGrid cols={5}>
        <MetricCard label="My open work" value={q.mine.length} format={num} context={`${money(sum(q.mine))}/yr in my queue`} icon={<ClipboardList className="h-4 w-4" aria-hidden />} />
        <MetricCard label="Awaiting my decision" value={q.decision.length} format={num} context={q.decision.length ? "Accept, reject or defer" : "No new assignments"} icon={<Inbox className="h-4 w-4" aria-hidden />} accent="violet" />
        <MetricCard label="Past SLA" value={q.overdue.length} format={num} context={q.overdue.length ? `${money(sum(q.overdue))}/yr at risk` : "Nothing overdue"} icon={<AlarmClock className="h-4 w-4" aria-hidden />} accent="rose" />
        <MetricCard label="High priority" value={q.highPriority.length} format={num} context="Critical and High" icon={<Flame className="h-4 w-4" aria-hidden />} accent="amber" />
        <MetricCard label="Largest item" value={q.highSavings[0] ? annual(q.highSavings[0]) : 0} format={money} context={q.highSavings[0]?.id ?? "—"} href={q.highSavings[0] ? `/recommendations/${q.highSavings[0].id}` : undefined} icon={<CircleDollarSign className="h-4 w-4" aria-hidden />} accent="teal" />
      </KpiGrid>

      {actionable.length > 0 && (
        <Card>
          <CardHeader title="Ready for you" subtitle="Your items where the next step is yours" />
          <ul className="mt-3 grid gap-3 px-5 pb-5 md:grid-cols-2 xl:grid-cols-3">
            {actionable.slice(0, 6).map((r) => (
              <li key={r.id}>
                <Link href={`/recommendations/${r.id}`} className="group flex h-full flex-col rounded-xl border border-line p-4 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-slate-400">{r.id}</span>
                    <StageBadge stage={r.stage} />
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900 group-hover:text-brand-700">{r.title}</div>
                  <div className="mt-1 truncate text-xs text-slate-500">{L.resource(r.resourceId)?.name}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={r.priority} />
                    <SlaIndicator rec={r} compact />
                    <span className="ml-auto text-sm font-semibold text-slate-900 num">{money(annual(r))}/yr</span>
                  </div>
                  <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2.5 text-xs font-medium text-brand-600">
                    {r.stage === "assigned" ? "Accept or reject" : r.stage === "in_progress" ? (r.ticketId ? "Submit plan" : "Create ticket") : r.stage === "submitted" ? "Record change approval" : "Implement with evidence"}
                    <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" aria-hidden />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <Tabs<T>
          className="px-3"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "mine", label: "My work", count: q.mine.length },
            { id: "decision", label: "Awaiting my decision", count: q.decision.length },
            { id: "overdue", label: "Overdue", count: q.overdue.length },
            { id: "highPriority", label: "High priority", count: q.highPriority.length },
            { id: "highSavings", label: "High savings", count: q.highSavings.length },
          ]}
        />
        <RecommendationGrid rows={q[tab]} caption={`Engineering queue — ${tab}`} pageSize={12} selectable exportName="my-queue-selected" emptyTitle="Nothing here" emptyBody="No recommendations in this view." />
      </Card>

      <Card>
        <CardHeader title="My open tickets" subtitle="Local Demo Ticketing — linked to recommendations" action={<ButtonLink href="/tickets?mine=1" size="sm" variant="ghost">All tickets</ButtonLink>} />
        {myTickets.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No open tickets assigned to {subject.name}.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 border-t border-line">
            {myTickets.slice(0, 8).map((t) => (
              <li key={t.id}>
                <Link href={`/recommendations/${t.recommendationId}`} className="flex items-center gap-4 px-5 py-2.5 text-sm hover:bg-slate-50">
                  <span className="w-20 shrink-0 font-mono text-xs text-slate-500">{t.id}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-800">{t.title.replace("[FinOps] ", "")}</span>
                  <TicketStatusBadge status={t.status} />
                  <span className="hidden w-24 shrink-0 text-right text-xs text-slate-500 sm:block">due {t.dueDate.slice(5)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
