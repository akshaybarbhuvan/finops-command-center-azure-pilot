"use client";
import { AlertOctagon, CheckCircle2, Clock, MinusCircle, XCircle } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/primitives";
import { slaStatus, type SlaStatus } from "@/lib/demo/selectors";
import { STAGE_META } from "@/lib/demo/workflow";
import { money } from "@/lib/format";
import type { AnomalyStatus, Priority, Recommendation, Risk, Stage, TicketStatus } from "@/lib/demo/types";

// Status colors carry meaning consistently across the product:
// slate = not started · blue = in delivery · violet = awaiting decision · teal/green = value realized · amber = paused · red = stopped/breached
export const STAGE_TONE: Record<Stage, Tone> = {
  identified: "neutral",
  validated: "info",
  assigned: "brand",
  in_progress: "brand",
  submitted: "violet",
  approved: "violet",
  implemented: "info",
  verified: "success",
  closed: "success",
  rejected: "danger",
  deferred: "warning",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <Badge tone={STAGE_TONE[stage]} dot title={STAGE_META[stage].description}>
      {STAGE_META[stage].label}
    </Badge>
  );
}

const PRIORITY_STYLE: Record<Priority, { tone: Tone; bars: number }> = {
  Critical: { tone: "danger", bars: 4 },
  High: { tone: "warning", bars: 3 },
  Medium: { tone: "info", bars: 2 },
  Low: { tone: "neutral", bars: 1 },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const s = PRIORITY_STYLE[priority];
  return (
    <Badge tone={s.tone}>
      <span aria-hidden className="flex items-end gap-[2px]">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={i <= s.bars ? "bg-current" : "bg-current opacity-20"} style={{ width: 2, height: 3 + i * 2, borderRadius: 1 }} />
        ))}
      </span>
      {priority}
    </Badge>
  );
}

export function RiskBadge({ risk }: { risk: Risk }) {
  return <Badge tone={risk === "High" ? "danger" : risk === "Medium" ? "warning" : "success"}>{risk} risk</Badge>;
}

const SLA_STYLE: Record<SlaStatus, { tone: Tone; Icon: typeof Clock }> = {
  "On track": { tone: "success", Icon: Clock },
  "Due soon": { tone: "warning", Icon: Clock },
  Breached: { tone: "danger", Icon: AlertOctagon },
  Met: { tone: "success", Icon: CheckCircle2 },
  Missed: { tone: "warning", Icon: XCircle },
  "Not applicable": { tone: "neutral", Icon: MinusCircle },
};

export function SlaIndicator({ rec, compact }: { rec: Recommendation; compact?: boolean }) {
  const { status, daysLeft } = slaStatus(rec);
  const { tone, Icon } = SLA_STYLE[status];
  const text =
    status === "On track" || status === "Due soon"
      ? compact
        ? `${daysLeft}d left`
        : `${status} · ${daysLeft}d left`
      : status === "Breached"
        ? compact
          ? `${Math.abs(daysLeft)}d overdue`
          : `Breached · ${Math.abs(daysLeft)}d overdue`
        : status === "Not applicable"
          ? "—"
          : `SLA ${status.toLowerCase()}`;
  return (
    <Badge tone={tone} title={`SLA ${rec.slaDays} days · due ${rec.dueDate}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {text}
    </Badge>
  );
}

export function SavingsBadge({ annual, realized }: { annual: number; realized?: boolean }) {
  return (
    <Badge tone={realized ? "success" : "brand"} title={realized ? "Verified savings (annualized)" : "Estimated savings (annualized) — not yet realized"}>
      {money(annual)}/yr {realized ? "realized" : "est."}
    </Badge>
  );
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const tone: Record<TicketStatus, Tone> = { Open: "neutral", "In Progress": "brand", "Pending Approval": "violet", Approved: "violet", Resolved: "info", Closed: "success", Cancelled: "warning" };
  return (
    <Badge tone={tone[status]} dot>
      {status}
    </Badge>
  );
}

export function AnomalyStatusBadge({ status }: { status: AnomalyStatus }) {
  const tone: Record<AnomalyStatus, Tone> = { New: "danger", Investigating: "warning", Acknowledged: "info", Resolved: "success" };
  return (
    <Badge tone={tone[status]} dot>
      {status}
    </Badge>
  );
}

export function EnvBadge({ env }: { env: string }) {
  return <Badge tone={env === "Production" ? "dark" : env === "Shared" ? "violet" : "neutral"}>{env}</Badge>;
}
