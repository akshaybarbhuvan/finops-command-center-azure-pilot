"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { ScoreRing } from "@/components/charts/charts";
import { ExportButton, PageHeader } from "@/components/data/blocks";
import { DataTable } from "@/components/data/DataTable";
import { Drawer } from "@/components/ui/overlay";
import { Badge, ButtonLink, Card, CardHeader, Progress, cx } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { commitmentSummary, GOVERNANCE_META, governanceSummary, lookup } from "@/lib/demo/selectors";
import { date, money, num, pct } from "@/lib/format";
import type { GovernanceIssue } from "@/lib/demo/types";

export function Governance() {
  const { ds } = useDemo();
  const params = useSearchParams();
  const L = lookup(ds);
  const g = useMemo(() => governanceSummary(ds), [ds]);
  const cm = useMemo(() => commitmentSummary(ds), [ds]);
  const initial = params.get("issue") as GovernanceIssue | null;
  const [issue, setIssue] = useState<GovernanceIssue | null>(initial && initial in GOVERNANCE_META ? initial : null);

  const bySub = useMemo(
    () =>
      ds.subscriptions
        .map((s) => {
          const rs = ds.resources.filter((r) => r.subscriptionId === s.id && r.state !== "Decommissioned");
          const tagged = rs.filter((r) => r.ownerId && r.costCenter).length;
          const issues = rs.filter((r) => r.governanceIssues.length).length;
          const unalloc = rs.filter((r) => !r.costCenter).reduce((a, r) => a + r.monthlyCost, 0);
          return { id: s.id, name: s.name, bu: L.buName(s.businessUnitId), resources: rs.length, taggingPct: (tagged / Math.max(1, rs.length)) * 100, issues, unalloc };
        })
        .sort((a, b) => a.taggingPct - b.taggingPct),
    [ds, L],
  );

  return (
    <div className="space-y-5">
      <PageHeader crumbs={[{ label: "Operate" }, { label: "Governance" }]} title="Cost Governance" subtitle="Allocation, ownership and hygiene controls that turn cloud spend into accountable spend. Select any metric to see the affected resources." />

      <div className="grid gap-5 xl:grid-cols-4">
        <Card className="flex flex-col items-center justify-center p-6 text-center">
          <ScoreRing value={g.score} size={156} label="Governance score" />
          <div className="mt-3 text-sm font-semibold text-slate-900">Governance score · {g.grade}</div>
          <p className="mt-1 text-xs text-slate-500">Weighted compliance across allocation, ownership, hygiene and policy controls.</p>
          <div className="mt-4 grid w-full grid-cols-2 gap-3 text-left">
            <div className="rounded-lg bg-slate-50 p-2.5">
              <div className="text-[11px] text-slate-500">Tagging compliance</div>
              <div className="font-semibold num">{pct(g.taggingCompliancePct)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <div className="text-[11px] text-slate-500">Commitment coverage</div>
              <div className="font-semibold num">{pct(cm.coveragePct)}</div>
            </div>
          </div>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2 xl:col-span-3 xl:grid-cols-4">
          {g.issues.map((i) => (
            <button
              key={i.key}
              type="button"
              onClick={() => (i.key === "policy_exception" ? document.getElementById("exceptions")?.scrollIntoView({ behavior: "smooth" }) : setIssue(i.key))}
              className="card group flex flex-col p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift"
            >
              <div className="flex items-center justify-between">
                <span className="eyebrow">{i.label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-brand-500" aria-hidden />
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 num">{num(i.count)}</div>
              <div className="text-xs text-slate-500">{i.key === "policy_exception" ? "active exceptions" : i.cost > 0 ? `${money(i.cost)}/mo exposure` : "resources"}</div>
              <div className="mt-auto pt-3">
                <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                  <span>Compliance</span>
                  <span className="num">{pct(i.compliancePct, 0)}</span>
                </div>
                <Progress value={i.compliancePct} tone={i.compliancePct >= 85 ? "success" : i.compliancePct >= 70 ? "warning" : "danger"} label={`${i.label} compliance`} />
              </div>
              <p className="mt-2 text-[11px] leading-snug text-slate-500">{i.description}</p>
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader
          title="Tagging & allocation by subscription"
          subtitle="Resources carrying both owner and cost-center tags"
          action={
            <ExportButton
              size="sm"
              rows={bySub}
              filename="fcc-tagging-compliance.csv"
              columns={[
                { header: "Subscription", value: (s) => s.name },
                { header: "Business unit", value: (s) => s.bu },
                { header: "Resources", value: (s) => s.resources },
                { header: "Tagging compliance %", value: (s) => s.taggingPct.toFixed(1) },
                { header: "Resources with findings", value: (s) => s.issues },
                { header: "Unallocated spend (USD/mo)", value: (s) => Math.round(s.unalloc) },
              ]}
            />
          }
        />
        <div className="mt-2">
          <DataTable
            dense
            caption="Tagging compliance by subscription"
            rows={bySub}
            rowKey={(s) => s.id}
            pageSize={14}
            columns={[
              { id: "name", header: "Subscription", sortValue: (s) => s.name, cell: (s) => <div><div className="font-medium text-slate-900">{s.name}</div><div className="text-[11px] text-slate-500">{s.bu}</div></div> },
              { id: "res", header: "Resources", align: "right", sortValue: (s) => s.resources, cell: (s) => num(s.resources) },
              {
                id: "tag",
                header: "Tagging compliance",
                sortValue: (s) => s.taggingPct,
                cell: (s) => (
                  <div className="flex items-center gap-2">
                    <Progress value={s.taggingPct} tone={s.taggingPct >= 95 ? "success" : s.taggingPct >= 85 ? "warning" : "danger"} className="w-28" label={`${s.name} tagging`} />
                    <span className="text-xs num">{pct(s.taggingPct)}</span>
                  </div>
                ),
              },
              { id: "issues", header: "With findings", align: "right", sortValue: (s) => s.issues, cell: (s) => num(s.issues) },
              { id: "un", header: "Unallocated", align: "right", sortValue: (s) => s.unalloc, cell: (s) => (s.unalloc > 0 ? <span className="text-amber-700">{money(s.unalloc)}/mo</span> : "—") },
              { id: "go", header: "", cell: (s) => <Link href={`/resources?sub=${s.id}`} className="text-xs font-medium text-brand-600 hover:underline">Resources</Link> },
            ]}
          />
        </div>
      </Card>

      <Card>
        <div id="exceptions" />
        <CardHeader title="Policy exceptions" subtitle="Approved exceptions to Azure Policy guardrails, with expiry tracking" />
        <div className="mt-2">
          <DataTable
            dense
            caption="Policy exceptions"
            rows={ds.policyExceptions}
            rowKey={(e) => e.id}
            initialSort={{ id: "exp", dir: "asc" }}
            columns={[
              { id: "id", header: "ID", cell: (e) => <span className="font-mono text-xs">{e.id}</span> },
              { id: "policy", header: "Policy", sortValue: (e) => e.policy, cell: (e) => <span className="font-medium text-slate-900">{e.policy}</span> },
              { id: "sub", header: "Subscription", cell: (e) => L.subName(e.subscriptionId) },
              { id: "reason", header: "Justification", cell: (e) => <span className="text-xs text-slate-600">{e.reason}</span> },
              { id: "by", header: "Requested by", cell: (e) => L.userName(e.requestedById) },
              { id: "exp", header: "Expires", sortValue: (e) => e.expires, cell: (e) => <span className="whitespace-nowrap">{date(e.expires)}</span> },
              { id: "status", header: "Status", cell: (e) => <Badge tone={e.status === "Active" ? "success" : e.status === "Expiring" ? "warning" : "danger"}>{e.status}</Badge> },
            ]}
          />
        </div>
      </Card>

      {issue && <IssueDrawer issue={issue} onClose={() => setIssue(null)} />}
    </div>
  );
}

function IssueDrawer({ issue, onClose }: { issue: GovernanceIssue; onClose: () => void }) {
  const { ds } = useDemo();
  const L = lookup(ds);
  const rows = useMemo(() => ds.resources.filter((r) => r.governanceIssues.includes(issue)).sort((a, b) => b.monthlyCost - a.monthlyCost), [ds.resources, issue]);
  const total = rows.reduce((a, r) => a + r.monthlyCost, 0);
  return (
    <Drawer
      open
      onClose={onClose}
      width="xl"
      title={GOVERNANCE_META[issue].label}
      subtitle={`${GOVERNANCE_META[issue].description} · ${num(rows.length)} resources · ${money(total)}/mo`}
      footer={
        <ButtonLink href={`/resources?issue=${issue}`} variant="primary">
          Open in resource inventory
        </ButtonLink>
      }
    >
      <ul className="divide-y divide-slate-100">
        {rows.slice(0, 60).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium text-slate-900">{r.name}</div>
              <div className="truncate text-xs text-slate-500">
                {r.type} · {L.subName(r.subscriptionId)} · {r.ownerId ? L.userName(r.ownerId) : <span className="text-amber-700">no owner tag</span>}
              </div>
            </div>
            <span className={cx("shrink-0 font-medium num", r.monthlyCost > 5000 ? "text-slate-900" : "text-slate-600")}>{money(r.monthlyCost)}/mo</span>
          </li>
        ))}
      </ul>
      {rows.length > 60 && <p className="pt-3 text-xs text-slate-500">Showing the 60 highest-cost resources. Open the inventory for the full list.</p>}
    </Drawer>
  );
}
