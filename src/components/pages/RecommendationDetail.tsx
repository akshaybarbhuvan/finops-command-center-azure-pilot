"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Building2, CalendarClock, Check, FlaskConical, MessageSquare, Paperclip, Server, ShieldAlert, Ticket as TicketIcon, User as UserIcon, Wrench } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/data/blocks";
import { PriorityBadge, RiskBadge, SlaIndicator, StageBadge, TicketStatusBadge } from "@/components/data/badges";
import { RecommendationActions } from "@/components/recommendations/RecommendationActions";
import { C } from "@/components/charts/charts";
import { Avatar, Badge, Button, ButtonLink, Card, KeyValue, Progress, Tabs, cx } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/overlay";
import { useDemo } from "@/lib/demo/store";
import { useReturnHref } from "@/lib/hooks/filter-memory";
import { annual, lookup, slaStatus } from "@/lib/demo/selectors";
import { LIFECYCLE, STAGE_META, isRealized } from "@/lib/demo/workflow";
import { getTicketingClient } from "@/lib/demo/ticketing";
import { date, money, moneyExact, pct } from "@/lib/format";
import type { Recommendation } from "@/lib/demo/types";

type TabId = "overview" | "financial" | "evidence" | "ownership" | "comments" | "ticket" | "audit";

export function RecommendationDetail({ id }: { id: string }) {
  const { ds } = useDemo();
  const rec = ds.recommendations.find((r) => r.id === id);
  const [tab, setTab] = useState<TabId>("overview");
  if (!rec) {
    return (
      <Card className="mx-auto mt-6 max-w-lg">
        <EmptyState title={`Recommendation ${id} is not available`} body="It does not exist or is outside the records your role can access." action={<ButtonLink href="/recommendations" variant="primary">Back to recommendations</ButtonLink>} />
      </Card>
    );
  }
  return <DetailBody rec={rec} tab={tab} setTab={setTab} />;
}

function DetailBody({ rec, tab, setTab }: { rec: Recommendation; tab: TabId; setTab: (t: TabId) => void }) {
  const { ds } = useDemo();
  const L = lookup(ds);
  const res = L.resource(rec.resourceId)!;
  const sub = L.subscription(rec.subscriptionId)!;
  const ticket = rec.ticketId ? ds.tickets.find((t) => t.id === rec.ticketId) : undefined;
  const realized = isRealized(rec.stage);
  const sla = slaStatus(rec);
  const owner = L.user(rec.ownerId);
  const after = rec.currentMonthlyCost - rec.estimatedMonthlySavings;
  const isCommitment = rec.category === "Commitments";
  const backHref = useReturnHref("/recommendations");

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "Recommendations", href: backHref }, { label: rec.id }]}
        eyebrow={
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-500">{rec.id}</span>
            <StageBadge stage={rec.stage} />
            <PriorityBadge priority={rec.priority} />
            <SlaIndicator rec={rec} />
            <Badge tone="neutral">{rec.category}</Badge>
          </div>
        }
        title={rec.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5" aria-hidden /> {res.name}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" aria-hidden /> {sub.name} · {L.buName(sub.businessUnitId)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UserIcon className="h-3.5 w-3.5" aria-hidden /> {owner ? `${owner.name} · ${L.teamName(rec.teamId)}` : `Unassigned · ${L.teamName(rec.teamId)}`}
            </span>
          </span>
        }
        actions={<RecommendationActions rec={rec} />}
      />

      {/* Savings summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryTile label={realized ? "Verified monthly savings" : "Est. monthly savings"} value={moneyExact(realized ? rec.realizedMonthlySavings : rec.estimatedMonthlySavings)} accent />
        <SummaryTile label={realized ? "Realized annual savings" : "Est. annual savings"} value={moneyExact((realized ? rec.realizedMonthlySavings : rec.estimatedMonthlySavings) * 12)} accent sub={realized ? "Verified against billing" : "Potential — not yet realized"} />
        <SummaryTile label="Confidence" value={pct(rec.confidence, 0)} sub={<Progress value={rec.confidence} tone={rec.confidence >= 85 ? "success" : "brand"} label="Confidence" className="mt-1.5" />} />
        <SummaryTile label="Cost before → after" value={`${money(rec.currentMonthlyCost)} → ${money(after)}`} sub={`per month · −${pct((rec.estimatedMonthlySavings / rec.currentMonthlyCost) * 100, 0)}`} />
        <SummaryTile label="Payback" value={isCommitment ? "Billing-only" : "Immediate"} sub={isCommitment ? "No upfront cost; term commitment" : "No upfront cost or license spend"} />
        <SummaryTile
          label="Owner & SLA"
          value={owner ? owner.name : "Unassigned"}
          sub={sla.status === "Not applicable" ? "SLA not applicable" : `${sla.status} · due ${date(rec.dueDate)}`}
          warn={!owner || sla.status === "Breached"}
        />
      </div>

      <LifecycleStepper rec={rec} />

      <Card>
        <Tabs<TabId>
          className="px-3"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "financial", label: "Financial impact" },
            { id: "evidence", label: "Technical evidence" },
            { id: "ownership", label: "Ownership" },
            { id: "comments", label: "Comments", count: rec.comments.length },
            { id: "ticket", label: "Ticket" },
            { id: "audit", label: "Audit", count: rec.history.length },
          ]}
        />
        <div className="p-5">
          {tab === "overview" && <OverviewTab rec={rec} />}
          {tab === "financial" && <FinancialTab rec={rec} />}
          {tab === "evidence" && <EvidenceTab rec={rec} />}
          {tab === "ownership" && <OwnershipTab rec={rec} />}
          {tab === "comments" && <CommentsTab rec={rec} />}
          {tab === "ticket" && <TicketTab rec={rec} ticket={ticket} />}
          {tab === "audit" && <AuditTab rec={rec} />}
        </div>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, sub, accent, warn }: { label: string; value: string; sub?: React.ReactNode; accent?: boolean; warn?: boolean }) {
  return (
    <div className={cx("rounded-xl border p-3.5", accent ? "border-brand-100 bg-gradient-to-br from-brand-50 to-white" : warn ? "border-amber-200 bg-amber-50/60" : "border-line bg-white")}>
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold tracking-tight text-slate-900 num">{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-slate-500">{sub}</div>}
    </div>
  );
}

function LifecycleStepper({ rec }: { rec: Recommendation }) {
  const reachedAt = new Map(rec.history.map((h) => [h.stage, h.at]));
  const offPath = rec.stage === "rejected" || rec.stage === "deferred";
  const currentIdx = offPath ? LIFECYCLE.indexOf(rec.history[rec.history.length - 2]?.stage ?? "identified") : LIFECYCLE.indexOf(rec.stage);
  return (
    <Card className="overflow-x-auto px-5 py-4 scrollbar-thin" aria-label="Lifecycle progress">
      <ol className="flex min-w-[760px] items-start">
        {LIFECYCLE.map((s, i) => {
          const done = i < currentIdx || (i === currentIdx && (isRealized(rec.stage) || offPath));
          const current = i === currentIdx && !offPath;
          return (
            <li key={s} className="relative flex flex-1 flex-col items-center text-center">
              {i > 0 && <span aria-hidden className={cx("absolute right-1/2 top-3.5 h-0.5 w-full -translate-x-3.5", i <= currentIdx ? "bg-brand-400" : "bg-slate-200")} />}
              <span
                className={cx(
                  "relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-semibold",
                  current ? "border-brand-500 bg-brand-500 text-white ring-4 ring-brand-100" : done ? "border-brand-400 bg-white text-brand-600" : "border-slate-200 bg-white text-slate-400",
                )}
              >
                {done && !current ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cx("mt-1.5 text-[11.5px] font-medium", current ? "text-slate-900" : done ? "text-slate-700" : "text-slate-400")}>{STAGE_META[s].label}</span>
              <span className="text-[10.5px] text-slate-400 num">{reachedAt.get(s) ? date(reachedAt.get(s)).replace(", 2026", "") : ""}</span>
              {current && <span className="sr-only">(current stage)</span>}
            </li>
          );
        })}
      </ol>
      {offPath && (
        <p className={cx("mt-3 rounded-lg px-3 py-2 text-xs", rec.stage === "rejected" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800")}>
          {STAGE_META[rec.stage].label} on {date(rec.approval?.at ?? rec.history[rec.history.length - 1].at)}
          {rec.approval?.note ? ` — ${rec.approval.note}` : ""}
        </p>
      )}
    </Card>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-slate-900">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function nextActionText(rec: Recommendation) {
  switch (rec.stage) {
    case "identified":
      return "FinOps validates the estimate against billing data.";
    case "validated":
      return "FinOps routes the item to the accountable engineering owner.";
    case "assigned":
      return "The engineering owner accepts, or rejects / defers with a reason.";
    case "in_progress":
      return rec.ticketId ? "The owner submits the remediation plan to the change process." : "The owner creates or links a ticket, then submits a remediation plan.";
    case "submitted":
      return "The owner records the change approval reference from the organization's change process.";
    case "approved":
      return "The owner implements the change and attaches evidence.";
    case "implemented":
      return "FinOps verifies savings against billing (simulated in this demo).";
    case "verified":
      return "FinOps closes the recommendation.";
    case "deferred":
      return "FinOps revisits after the deferral reason is resolved.";
    default:
      return "No further action.";
  }
}

function WorkflowRecord({ rec }: { rec: Recommendation }) {
  const { ds } = useDemo();
  const L = lookup(ds);
  const ticket = rec.ticketId ? ds.tickets.find((t) => t.id === rec.ticketId) : undefined;
  const d = rec.ownerDecision;
  const ca = rec.changeApproval;
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="eyebrow mb-2">Workflow record</div>
      <KeyValue
        cols={1}
        items={[
          { label: "Owner", value: L.userName(rec.ownerId) },
          { label: "Owner decision", value: d ? `${d.decision[0].toUpperCase()}${d.decision.slice(1)} · ${date(d.at)}${d.reason ? ` — ${d.reason}` : ""}` : "Pending" },
          { label: "Ticket", value: ticket ? `${ticket.id}${ticket.externalRef ? ` · ${ticket.externalRef}` : ""} (${ticket.status})` : "Not linked" },
          { label: "Remediation plan", value: rec.remediationPlan ?? "Not submitted" },
          { label: "Change approval", value: ca ? `${ca.reference} · recorded ${date(ca.at)} by ${L.userName(ca.recordedBy)} (simulated reference)` : "Not recorded" },
        ]}
      />
      <p className="mt-2 text-[11px] text-slate-500">FinOps routes and verifies; change approval comes from the organization&apos;s change process, not FinOps.</p>
    </div>
  );
}

function OverviewTab({ rec }: { rec: Recommendation }) {
  const { ds } = useDemo();
  const L = lookup(ds);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Section title="What" icon={<Wrench className="h-4 w-4 text-slate-400" aria-hidden />}>
          <p className="text-sm leading-relaxed text-slate-700">{rec.title}. Detected by the “{rec.type}” rule on {L.resource(rec.resourceId)?.name}.</p>
        </Section>
        <Section title="Why" icon={<FlaskConical className="h-4 w-4 text-slate-400" aria-hidden />}>
          <p className="text-sm leading-relaxed text-slate-700">{rec.rationale}</p>
        </Section>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="eyebrow">Business impact</div>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{rec.businessImpact}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="eyebrow">Technical impact</div>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{rec.technicalImpact}</p>
          </div>
        </div>
        <Section title="How — remediation plan">
          <ol className="space-y-2">
            {rec.remediation.map((s, i) => (
              <li key={s} className="flex gap-3 text-sm text-slate-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </Section>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
          <div className="eyebrow text-brand-700">Next action</div>
          <p className="mt-1.5 text-sm font-medium text-slate-900">{nextActionText(rec)}</p>
        </div>
        <WorkflowRecord rec={rec} />
        <div className="rounded-xl border border-line p-4">
          <div className="eyebrow mb-2">Risk assessment</div>
          <div className="flex flex-wrap gap-2">
            <RiskBadge risk={rec.risk} />
            <Badge tone="neutral">Effort: {rec.effort}</Badge>
            <Badge tone="neutral">{L.application(L.resource(rec.resourceId)!.applicationId)?.criticality}</Badge>
          </div>
          <p className="mt-2 text-xs text-slate-500">{rec.risk === "Low" ? "Low blast radius; reversible change." : rec.risk === "Medium" ? "Requires a maintenance window and rollback plan." : "Requires architecture review before change."}</p>
        </div>
        <div className="rounded-xl border border-line p-4">
          <div className="eyebrow mb-2">Timeline</div>
          <KeyValue cols={1} items={[{ label: "Identified", value: date(rec.createdDate) }, { label: "SLA", value: `${rec.slaDays} days (${rec.priority})` }, { label: "Due", value: date(rec.dueDate) }]} />
        </div>
      </div>
    </div>
  );
}

function FinancialTab({ rec }: { rec: Recommendation }) {
  const realized = isRealized(rec.stage);
  const monthly = realized ? rec.realizedMonthlySavings : rec.estimatedMonthlySavings;
  const data = useMemo(() => Array.from({ length: 13 }, (_, m) => ({ m: m === 0 ? "Start" : `M${m}`, cumulative: monthly * m })), [monthly]);
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-2">
        <div className="rounded-xl border border-line p-4">
          <div className="eyebrow">Monthly cost</div>
          <div className="mt-3 space-y-3">
            <div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Current</span>
                <span className="font-semibold text-slate-900 num">{moneyExact(rec.currentMonthlyCost)}</span>
              </div>
              <div className="mt-1 h-3 rounded-full bg-slate-300" />
            </div>
            <div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>After change</span>
                <span className="font-semibold text-slate-900 num">{moneyExact(rec.currentMonthlyCost - rec.estimatedMonthlySavings)}</span>
              </div>
              <div className="mt-1 h-3 rounded-full bg-slate-100">
                <div className="h-3 rounded-full bg-brand-500" style={{ width: `${((rec.currentMonthlyCost - rec.estimatedMonthlySavings) / rec.currentMonthlyCost) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
        <table className="w-full text-sm">
          <caption className="sr-only">Financial summary</caption>
          <tbody className="divide-y divide-slate-100">
            {[
              ["Current monthly cost", moneyExact(rec.currentMonthlyCost)],
              ["Current annualized cost", moneyExact(rec.currentMonthlyCost * 12)],
              ["Estimated monthly savings", moneyExact(rec.estimatedMonthlySavings)],
              ["Estimated annual savings", moneyExact(annual(rec))],
              ["Savings rate", pct((rec.estimatedMonthlySavings / rec.currentMonthlyCost) * 100)],
              ["Confidence", pct(rec.confidence, 0)],
              ["Confidence-weighted annual value", moneyExact((annual(rec) * rec.confidence) / 100)],
              ...(realized ? [["Verified monthly savings", moneyExact(rec.realizedMonthlySavings)], ["Verified on", date(rec.realizedDate)]] : []),
            ].map(([k, v]) => (
              <tr key={k}>
                <th scope="row" className="py-2 text-left font-normal text-slate-500">
                  {k}
                </th>
                <td className="py-2 text-right font-medium text-slate-900 num">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lg:col-span-3">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[13px] font-semibold text-slate-900">Cumulative savings — first 12 months</div>
          <Badge tone={realized ? "success" : "brand"}>{realized ? "Based on verified savings" : "Projection — not yet realized"}</Badge>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.teal} stopOpacity={0.25} />
                <stop offset="100%" stopColor={C.teal} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="m" tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => money(v)} />
            <Tooltip formatter={(v: number) => [moneyExact(v), "Cumulative savings"]} contentStyle={{ borderRadius: 8, border: "1px solid #E4E8F0", fontSize: 12 }} />
            <Area dataKey="cumulative" stroke={C.teal} strokeWidth={2} fill="url(#cumFill)" />
          </AreaChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-slate-500">Cost basis: trailing run-rate of the resource at current pricing. Savings exclude one-time migration effort. All figures are illustrative demo data.</p>
      </div>
    </div>
  );
}

function EvidenceTab({ rec }: { rec: Recommendation }) {
  const { ds } = useDemo();
  const L = lookup(ds);
  const res = L.resource(rec.resourceId)!;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Badge tone="info">Illustrative evidence</Badge>
        <span className="text-xs text-slate-500">Synthetic telemetry for demonstration — not collected from a live Azure tenant.</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Resource metadata">
          <KeyValue
            items={[
              { label: "Name", value: res.name },
              { label: "Type", value: res.type },
              { label: "SKU", value: res.sku },
              { label: "Region", value: res.region },
              { label: "Resource group", value: res.resourceGroup },
              { label: "Subscription", value: L.subName(res.subscriptionId) },
              { label: "Environment", value: res.environment },
              { label: "Application", value: L.application(res.applicationId)?.name ?? "—" },
              { label: "Instances", value: String(res.instanceCount) },
              { label: "Created", value: date(res.createdDate) },
              { label: "Owner tag", value: res.ownerId ? L.userName(res.ownerId) : "Missing" },
              { label: "Cost-center tag", value: res.costCenter ?? "Missing" },
            ]}
          />
        </Section>
        <Section title="Observed signals">
          <ul className="space-y-3">
            {rec.evidence.map((e) => (
              <li key={e.label} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 text-sm last:border-0">
                <span className="text-slate-500">{e.label}</span>
                <span className="text-right font-medium text-slate-900">{e.value}</span>
              </li>
            ))}
          </ul>
          {res.utilization > 0 && (
            <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
              <UtilBar label="Average utilization (30d)" value={res.utilization} />
              <UtilBar label="p95 utilization (30d)" value={res.utilizationP95} />
            </div>
          )}
        </Section>
      </div>
      <Section title="Configuration — current vs proposed">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <caption className="sr-only">Current and proposed configuration</caption>
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-2">Attribute</th>
                <th scope="col" className="px-4 py-2">Current</th>
                <th scope="col" className="px-4 py-2">Proposed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...new Set([...rec.current.map((c) => c.label), ...rec.proposed.map((p) => p.label)])].map((label) => (
                <tr key={label}>
                  <th scope="row" className="px-4 py-2 text-left font-normal text-slate-500">
                    {label}
                  </th>
                  <td className="px-4 py-2 text-slate-800">{rec.current.find((c) => c.label === label)?.value ?? "—"}</td>
                  <td className="px-4 py-2 font-medium text-brand-700">{rec.proposed.find((p) => p.label === label)?.value ?? "Unchanged"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function UtilBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold text-slate-900 num">{pct(value)}</span>
      </div>
      <Progress value={value} tone={value < 30 ? "warning" : "brand"} className="mt-1 h-2" label={label} />
    </div>
  );
}

function OwnershipTab({ rec }: { rec: Recommendation }) {
  const { ds } = useDemo();
  const L = lookup(ds);
  const owner = L.user(rec.ownerId);
  const sub = L.subscription(rec.subscriptionId)!;
  const team = L.team(rec.teamId)!;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Accountability">
        <div className="flex items-center gap-3 rounded-xl border border-line p-4">
          {owner ? <Avatar initials={owner.initials} size="lg" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700"><ShieldAlert className="h-5 w-5" aria-hidden /></span>}
          <div>
            <div className="text-sm font-semibold text-slate-900">{owner?.name ?? "No accountable owner yet"}</div>
            <div className="text-xs text-slate-500">{owner ? `${owner.title} · ${owner.email}` : `Expected owning team: ${team.name}`}</div>
          </div>
        </div>
        <div className="mt-4">
          <KeyValue
            items={[
              { label: "Owning team", value: team.name },
              { label: "Team lead", value: L.userName(team.leadId) },
              { label: "Business unit", value: L.buName(sub.businessUnitId) },
              { label: "Cost center", value: sub.costCenter },
              { label: "Subscription owner", value: L.userName(sub.ownerId) },
              { label: "Application", value: L.application(L.resource(rec.resourceId)!.applicationId)?.name ?? "—" },
            ]}
          />
        </div>
      </Section>
      <Section title="Approval">
        {rec.approval ? (
          <div className="rounded-xl border border-line p-4">
            <div className="flex items-center gap-2">
              <Badge tone={rec.approval.decision === "approved" ? "success" : rec.approval.decision === "rejected" ? "danger" : "warning"}>{rec.approval.decision[0].toUpperCase() + rec.approval.decision.slice(1)}</Badge>
              <span className="text-xs text-slate-500">
                by {L.userName(rec.approval.approverId)} on {date(rec.approval.at)}
              </span>
            </div>
            {rec.approval.note && <p className="mt-2 text-sm text-slate-700">{rec.approval.note}</p>}
          </div>
        ) : (
          <EmptyState title="No approval decision yet" body={rec.stage === "submitted" ? "The owner records the change approval reference once the change board approves the plan." : "The owner records a change approval reference after submitting a remediation plan."} icon={<CalendarClock className="h-5 w-5" aria-hidden />} />
        )}
      </Section>
    </div>
  );
}

function CommentsTab({ rec }: { rec: Recommendation }) {
  const { ds, dispatch, user } = useDemo();
  const toast = useToast();
  const L = lookup(ds);
  const [body, setBody] = useState("");
  const [evidence, setEvidence] = useState(false);
  const submit = () => {
    const r = dispatch({ kind: "comment", recId: rec.id, body, evidence });
    if (r.ok) {
      setBody("");
      setEvidence(false);
      toast({ kind: "success", title: evidence ? "Evidence added" : "Comment added", body: `Posted to ${rec.id} as ${user.name}` });
    } else toast({ kind: "error", title: "Could not post", body: r.error });
  };
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3">
        {rec.comments.length === 0 ? (
          <EmptyState title="No comments yet" body="Start the conversation or attach evidence for reviewers." icon={<MessageSquare className="h-5 w-5" aria-hidden />} />
        ) : (
          <ul className="space-y-4">
            {rec.comments.map((c) => {
              const a = L.user(c.authorId);
              return (
                <li key={c.id} className="flex gap-3">
                  <Avatar initials={a?.initials ?? "?"} size="sm" tone={c.kind === "system" ? "dark" : "slate"} />
                  <div className={cx("min-w-0 flex-1 rounded-xl border px-3.5 py-2.5", c.kind === "evidence" ? "border-sky-100 bg-sky-50/60" : c.kind === "system" ? "border-dashed border-slate-200 bg-slate-50" : "border-line bg-white")}>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-900">{a?.name ?? "Unknown"}</span>
                      <span className="text-slate-400">{date(c.at)}</span>
                      {c.kind === "evidence" && (
                        <Badge tone="info">
                          <Paperclip className="h-3 w-3" aria-hidden /> Evidence
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{c.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <form
        className="space-y-3 lg:col-span-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) submit();
        }}
      >
        <label htmlFor="comment" className="text-xs font-medium text-slate-600">
          Add a comment as {user.name}
        </label>
        <textarea id="comment" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share context, decisions or validation results…" className="input h-auto py-2" />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={evidence} onChange={(e) => setEvidence(e.target.checked)} className="h-4 w-4 accent-brand-500" />
          Mark as evidence (e.g. test results, change record)
        </label>
        <Button type="submit" variant="primary" disabled={!body.trim()}>
          Post {evidence ? "evidence" : "comment"}
        </Button>
      </form>
    </div>
  );
}

function TicketTab({ rec, ticket }: { rec: Recommendation; ticket?: (ReturnType<typeof useDemo>)["ds"]["tickets"][number] }) {
  const { ds } = useDemo();
  const L = lookup(ds);
  const client = getTicketingClient();
  if (!ticket) {
    return (
      <div className="mx-auto max-w-lg">
        <EmptyState
          title="No ticket linked"
          body={rec.stage === "identified" || rec.stage === "validated" ? "A ticket can be created when the recommendation is assigned to an owner." : "Use More → Create ticket to open one in Local Demo Ticketing."}
          icon={<TicketIcon className="h-5 w-5" aria-hidden />}
          action={<RecommendationActions rec={rec} />}
        />
        <p className="text-center text-[11.5px] text-slate-500">{client.describe()}</p>
      </div>
    );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-slate-900">{ticket.id}</span>
          <TicketStatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>
        <p className="mt-2 text-sm font-medium text-slate-900">{ticket.title}</p>
        <div className="mt-4">
          <KeyValue
            items={[
              { label: "Assignee", value: L.userName(ticket.assigneeId) },
              { label: "System", value: ticket.system },
              { label: "Created", value: date(ticket.createdAt) },
              { label: "Last updated", value: date(ticket.updatedAt) },
              { label: "Due date (SLA)", value: date(ticket.dueDate) },
              { label: "Linked recommendation", value: rec.id },
              { label: "External reference", value: ticket.externalRef ?? "—" },
            ]}
          />
        </div>
      </div>
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
        <div className="mb-1 font-semibold text-slate-800">Swappable ticketing</div>
        {client.describe()} The ticket status follows the recommendation lifecycle automatically.
        <Link href={client.link(ticket)} className="mt-3 flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700">
          Open in ticket queue <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function AuditTab({ rec }: { rec: Recommendation }) {
  const { ds } = useDemo();
  const L = lookup(ds);
  const events = [
    ...rec.history.map((h) => ({ at: h.at, who: h.byUserId, what: `Stage → ${STAGE_META[h.stage].label}`, note: h.note })),
    ...ds.audit.filter((a) => a.target === rec.id && !a.action.startsWith("Stage changed") && (a.action.includes("Ticket") || a.action.includes("Comment") || a.action.includes("Evidence"))).map((a) => ({ at: a.at, who: a.actorId, what: a.action, note: a.detail })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  return (
    <ol className="relative ml-2 space-y-5 border-l border-slate-200 pl-6">
      {events.map((e, i) => (
        <li key={i} className="relative">
          <span aria-hidden className="absolute -left-[31px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500 ring-2 ring-brand-100" />
          <div className="text-sm font-medium text-slate-900">{e.what}</div>
          <div className="text-xs text-slate-500">
            {L.userName(e.who)} · {date(e.at)}
          </div>
          {e.note && <div className="mt-1 text-xs text-slate-600">{e.note}</div>}
        </li>
      ))}
    </ol>
  );
}
