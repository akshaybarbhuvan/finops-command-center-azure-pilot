"use client";
import { CheckCircle2, CircleDashed, Compass } from "lucide-react";
import { PageHeader } from "@/components/data/blocks";
import { Badge, Card } from "@/components/ui/primitives";

const COLUMNS = [
  {
    id: "now",
    title: "Now",
    badge: { tone: "success" as const, label: "In this demo" },
    icon: CheckCircle2,
    color: "text-emerald-600",
    blurb: "Capabilities you can click through today with illustrative data.",
    items: [
      { t: "Azure FinOps visibility", d: "Spend, run-rate, forecast, budgets, anomalies and showback." },
      { t: "Cost governance", d: "Allocation, ownership, hygiene findings and policy exceptions." },
      { t: "Recommendations", d: "Rule-based opportunities with evidence, confidence and risk." },
      { t: "Accountability", d: "Owners, SLA tracking, tickets and an auditable lifecycle." },
      { t: "Savings workflow", d: "Potential → validated → approved → implemented → realized." },
      { t: "Role-based experiences", d: "Executive, FinOps, Engineering and Administrator views." },
    ],
  },
  {
    id: "next",
    title: "Next",
    badge: { tone: "brand" as const, label: "Planned" },
    icon: CircleDashed,
    color: "text-brand-500",
    blurb: "Directional next steps, subject to pilot outcomes and prioritization.",
    items: [
      { t: "Persistent data store", d: "Durable workflow state, history and reporting." },
      { t: "Live Azure ingestion", d: "Cost Management exports and Resource Graph inventory." },
      { t: "Deeper commitments", d: "Reservation and savings plan purchase modeling." },
      { t: "Advanced analytics", d: "Unit economics and forecast models by business driver." },
      { t: "Enterprise integrations", d: "ServiceNow / Jira / Azure DevOps ticketing adapters and SSO." },
    ],
  },
  {
    id: "future",
    title: "Future",
    badge: { tone: "neutral" as const, label: "Exploratory" },
    icon: Compass,
    color: "text-slate-400",
    blurb: "Areas under evaluation — not product commitments.",
    items: [
      { t: "Broader cloud coverage", d: "Additional cloud providers and SaaS spend." },
      { t: "Policy-as-code guardrails", d: "Budget and SKU guardrails enforced at deployment time." },
      { t: "Automated remediation", d: "Approval-gated execution of low-risk recommendations." },
      { t: "Natural-language analytics", d: "Conversational access to FinOps data with cited answers." },
    ],
  },
];

export function Roadmap() {
  return (
    <div className="space-y-5">
      <PageHeader crumbs={[{ label: "Platform" }, { label: "Roadmap" }]} title="Roadmap" subtitle="What the platform demonstrates today and where it is heading. Items under Next and Future are directional and not delivery commitments." />
      <div className="grid gap-5 lg:grid-cols-3">
        {COLUMNS.map((c) => (
          <Card key={c.id} className="flex flex-col">
            <div className="border-b border-line px-5 py-4">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <c.icon className={`h-4 w-4 ${c.color}`} aria-hidden />
                  {c.title}
                </h2>
                <Badge tone={c.badge.tone}>{c.badge.label}</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">{c.blurb}</p>
            </div>
            <ul className="flex-1 space-y-2 p-4">
              {c.items.map((i) => (
                <li key={i.t} className="rounded-lg border border-line bg-white p-3">
                  <div className="text-[13.5px] font-medium text-slate-900">{i.t}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{i.d}</div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
