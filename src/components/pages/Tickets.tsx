"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { ExportButton, PageHeader } from "@/components/data/blocks";
import { DataTable } from "@/components/data/DataTable";
import { PriorityBadge, TicketStatusBadge } from "@/components/data/badges";
import { Card, SegmentedControl, Select } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { annual, lookup } from "@/lib/demo/selectors";
import { getTicketingClient } from "@/lib/demo/ticketing";
import { date, money } from "@/lib/format";
import { daysBetween } from "@/lib/demo/seed";
import { AS_OF } from "@/lib/demo/org";

export function Tickets() {
  const { ds, user, persona } = useDemo();
  const params = useSearchParams();
  const router = useRouter();
  const L = lookup(ds);
  const client = getTicketingClient();
  const highlight = params.get("id");
  const [scope, setScope] = useState<"all" | "mine" | "open">(params.get("mine") ? "mine" : highlight ? "all" : "open");
  const [status, setStatus] = useState("");
  const recById = useMemo(() => new Map(ds.recommendations.map((r) => [r.id, r])), [ds.recommendations]);

  const rows = useMemo(
    () =>
      ds.tickets.filter((t) => {
        if (highlight && scope === "all" && t.id === highlight) return true;
        if (scope === "mine" && t.assigneeId !== user.id) return false;
        if (scope === "open" && ["Closed", "Cancelled"].includes(t.status)) return false;
        if (status && t.status !== status) return false;
        return true;
      }),
    [ds.tickets, scope, status, user.id, highlight],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "Operate" }, { label: "Tickets" }]}
        title="Ticket Queue"
        subtitle="Accountability tickets linked to recommendations. Status follows the recommendation lifecycle automatically."
        actions={
          <ExportButton
            rows={rows}
            filename="fcc-tickets.csv"
            columns={[
              { header: "Ticket", value: (t) => t.id },
              { header: "Title", value: (t) => t.title },
              { header: "Recommendation", value: (t) => t.recommendationId },
              { header: "Assignee", value: (t) => L.userName(t.assigneeId) },
              { header: "Priority", value: (t) => t.priority },
              { header: "Status", value: (t) => t.status },
              { header: "Created", value: (t) => t.createdAt },
              { header: "Due", value: (t) => t.dueDate },
            ]}
          />
        }
      />
      <div className="flex items-start gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden />
        <p>
          <strong className="font-semibold text-slate-800">{client.name}.</strong> {client.describe()} The ticketing client is swappable: an enterprise adapter (ServiceNow, Jira or Azure DevOps) plugs in behind the same interface outside demo mode.
        </p>
      </div>
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-4">
          <SegmentedControl
            label="Ticket scope"
            value={scope}
            onChange={setScope}
            options={[
              { id: "open", label: "Open" },
              { id: "mine", label: persona === "engineering" ? "Assigned to me" : `Assigned to ${user.name.split(" ")[0]}` },
              { id: "all", label: "All" },
            ]}
          />
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
            <option value="">Any status</option>
            {["Open", "In Progress", "Pending Approval", "Approved", "Resolved", "Closed", "Cancelled"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <div className="mt-3">
          <DataTable
            caption="Tickets"
            rows={rows}
            rowKey={(t) => t.id}
            onRowClick={(t) => router.push(`/recommendations/${t.recommendationId}`)}
            rowClassName={(t) => (t.id === highlight ? "bg-brand-50" : undefined)}
            initialSort={{ id: "created", dir: "desc" }}
            emptyTitle={scope === "mine" ? `No tickets assigned to ${user.name}` : "No tickets match"}
            columns={[
              { id: "id", header: "Ticket", sortValue: (t) => t.id, cell: (t) => <span className="font-mono text-xs font-semibold text-slate-800">{t.id}</span> },
              {
                id: "title",
                header: "Title",
                minWidth: 280,
                sortValue: (t) => t.title,
                cell: (t) => (
                  <div>
                    <div className="line-clamp-1 font-medium text-slate-900">{t.title.replace("[FinOps] ", "")}</div>
                    <Link href={`/recommendations/${t.recommendationId}`} onClick={(e) => e.stopPropagation()} className="text-[11px] font-medium text-brand-600 hover:underline">
                      {t.recommendationId} · {money(annual(recById.get(t.recommendationId)!))}/yr
                    </Link>
                  </div>
                ),
              },
              { id: "assignee", header: "Assignee", sortValue: (t) => L.userName(t.assigneeId), cell: (t) => <span className="whitespace-nowrap">{L.userName(t.assigneeId)}</span> },
              { id: "priority", header: "Priority", sortValue: (t) => ["Low", "Medium", "High", "Critical"].indexOf(t.priority), cell: (t) => <PriorityBadge priority={t.priority} /> },
              { id: "status", header: "Status", sortValue: (t) => t.status, cell: (t) => <TicketStatusBadge status={t.status} /> },
              { id: "created", header: "Created", sortValue: (t) => t.createdAt, cell: (t) => <span className="whitespace-nowrap">{date(t.createdAt)}</span> },
              {
                id: "due",
                header: "Due (SLA)",
                sortValue: (t) => t.dueDate,
                cell: (t) => {
                  const d = daysBetween(AS_OF, t.dueDate);
                  const done = ["Closed", "Cancelled", "Resolved"].includes(t.status);
                  return <span className={!done && d < 0 ? "whitespace-nowrap font-medium text-rose-700" : "whitespace-nowrap"}>{date(t.dueDate)}{!done && d < 0 ? ` · ${Math.abs(d)}d late` : ""}</span>;
                },
              },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}
