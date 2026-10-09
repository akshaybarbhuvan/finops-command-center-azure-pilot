// Presentation helpers for the pilot. Server-safe (no hooks). Never imports demo data modules.
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Database, Info } from "lucide-react";
import { Badge, ButtonLink, type Tone } from "@/components/ui/primitives";
import { cx } from "@/components/ui/primitives";
import { formatMoney, type CurrencyTotals } from "@/pilot/money";
import { STAGE_LABEL, type PilotStage } from "@/pilot/workflow/rules";
import type { ConnectorStatus } from "@/pilot/queries/portfolio";

const STAGE_TONE: Record<PilotStage, Tone> = {
  identified: "neutral",
  validated: "info",
  assigned: "info",
  in_progress: "brand",
  submitted: "warning",
  approved: "brand",
  implemented: "warning",
  verified: "success",
  closed: "success",
  rejected: "danger",
  deferred: "neutral",
};
export function StageBadge({ stage }: { stage: PilotStage }) {
  return <Badge tone={STAGE_TONE[stage] ?? "neutral"}>{STAGE_LABEL[stage] ?? stage}</Badge>;
}

const STATUS: Record<ConnectorStatus, { label: string; tone: Tone; help: string }> = {
  connected: { label: "Connected", tone: "success", help: "Last refresh succeeded and is within the freshness threshold." },
  stale: { label: "Stale", tone: "warning", help: "Last successful refresh is older than the freshness threshold." },
  partial: { label: "Partial", tone: "warning", help: "Last refresh stored some data but not all of it." },
  unauthorized: { label: "Unauthorized", tone: "danger", help: "The application identity lacks access to this scope." },
  failed_using_cached: { label: "Failed — showing cached data", tone: "danger", help: "Last refresh failed; previously stored data is shown with its original timestamp." },
  unavailable: { label: "Unavailable", tone: "danger", help: "No successful refresh has ever completed." },
  running: { label: "Refreshing", tone: "info", help: "A refresh is in progress." },
  not_run: { label: "Not yet refreshed", tone: "neutral", help: "No refresh has been run for this scope." },
};
export function ConnectorBadge({ status }: { status: ConnectorStatus }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} dot title={s.help}>
      {s.label}
    </Badge>
  );
}
export const connectorHelp = (s: ConnectorStatus) => STATUS[s].help;

export function Timestamp({ iso, empty = "Never" }: { iso: string | null | undefined; empty?: string }) {
  if (!iso) return <span className="text-slate-400">{empty}</span>;
  const d = new Date(iso);
  return (
    <time dateTime={iso} title={iso}>
      {d.toISOString().replace("T", " ").slice(0, 16)} UTC
    </time>
  );
}

/** One line per currency; never sums across currencies. Shows a dash (not zero) when there is no data. */
export function CurrencyAmounts({ totals, compact, empty = "No data" }: { totals: CurrencyTotals | null | undefined; compact?: boolean; empty?: string }) {
  const entries = Object.entries(totals ?? {}).sort();
  if (!entries.length) return <span className="text-slate-400">{empty}</span>;
  return (
    <span className="flex flex-col">
      {entries.map(([c, v]) => (
        <span key={c} className="num">
          {formatMoney(v, c, { compact })}
        </span>
      ))}
    </span>
  );
}

export function SourceTag({ kind }: { kind: "advisor" | "cost" | "graph" | "manual" | "fcc" }) {
  const map = {
    advisor: { label: "Azure Advisor", tone: "brand" as Tone },
    cost: { label: "Azure Cost Management", tone: "brand" as Tone },
    graph: { label: "Azure Resource Graph", tone: "brand" as Tone },
    manual: { label: "Manually recorded in FCC — not verified with an external system", tone: "neutral" as Tone },
    fcc: { label: "FCC record", tone: "neutral" as Tone },
  }[kind];
  return (
    <Badge tone={map.tone}>
      <Database className="h-3 w-3" aria-hidden /> {map.label}
    </Badge>
  );
}

export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  return (
    <p className={cx("flex gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed", tone === "warning" ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600")}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function Pager({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 px-1 pt-3 text-xs text-slate-500">
      <span role="status">
        {from.toLocaleString("en-US")}–{to.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
      </span>
      <span className="flex items-center gap-1">
        {page > 1 ? (
          <ButtonLink size="sm" href={hrefFor(page - 1)} icon={<ChevronLeft className="h-4 w-4" aria-hidden />}>
            Previous
          </ButtonLink>
        ) : null}
        <span>
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <ButtonLink size="sm" href={hrefFor(page + 1)} icon={<ChevronRight className="h-4 w-4" aria-hidden />}>
            Next
          </ButtonLink>
        ) : null}
      </span>
    </nav>
  );
}

export function SimpleTable({ head, children, caption, empty }: { head: string[]; children: ReactNode; caption: string; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
            {head.map((h) => (
              <th key={h} scope="col" className="py-2 pr-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export const shortSub = (s: string) => `…${s.slice(-6)}`;
export const td = "py-2 pr-3 align-top";
