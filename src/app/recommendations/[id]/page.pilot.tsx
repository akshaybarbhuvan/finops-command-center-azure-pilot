import { notFound } from "next/navigation";
import { Card, CardHeader, KeyValue } from "@/components/ui/primitives";
import { PageHeader } from "@/components/data/blocks";
import { pageSession } from "@/components/pilot/guard";
import { PilotShell } from "@/components/pilot/Shell";
import { ActionPanel, type OfferedAction } from "@/components/pilot/ActionPanel";
import { Note, SourceTag, StageBadge, Timestamp } from "@/components/pilot/ui";
import { assignableOwners, getRecommendationDetail } from "@/pilot/queries/recommendations";
import { formatMoney } from "@/pilot/money";
import { ACTIONS, availability, STAGE_LABEL, VERIFICATION_METHODS, type PilotAction, type PilotStage } from "@/pilot/workflow/rules";

export const metadata = { title: "Recommendation" };

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const big = (v: unknown) => (v === null || v === undefined ? null : BigInt(v as string | number | bigint));

export default async function RecommendationPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await pageSession(["portfolio.read", "recs.read.owned"]);
  if (!s.ok) return s.view;
  const { id } = await params;
  const d = await getRecommendationDetail(s.db, s.actor, id, s.config.subscriptionIds);
  if (!d) notFound(); // identical for missing and out-of-scope records
  const r = d.rec;
  const stage = r.stage as PilotStage;
  const currency = str(r.est_currency);
  const rules = { stage, ownerId: str(r.owner_id), ticketReference: str(r.ticket_reference), implementedBy: str(r.implemented_by) };
  const offered: OfferedAction[] = (Object.keys(ACTIONS) as PilotAction[]).map((a) => {
    const av = availability(a, rules, s.actor);
    return av.allowed ? { action: a, allowed: true } : { action: a, allowed: false, reason: av.code === "conflict" ? av.reason : undefined };
  });
  const owners = s.actor.roles.includes("finops") ? await assignableOwners(s.db) : [];
  const monthly = big(r.est_monthly_micros);
  const annual = big(r.est_annual_micros);

  return (
    <PilotShell actor={s.actor} config={s.config} active="/recommendations">
      <PageHeader crumbs={[{ label: "Recommendations", href: "/recommendations" }, { label: "Detail" }]} title={String(r.problem)} subtitle={str(r.solution) ?? undefined} />
      <div className="flex flex-wrap items-center gap-2">
        <StageBadge stage={stage} />
        <span className="text-xs text-slate-500">Priority {String(r.priority)}</span>
        <SourceTag kind="advisor" />
        {r.source_status === "not_returned" && <span className="text-xs text-amber-800">Not returned by Advisor at the last complete refresh</span>}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title="Workflow" subtitle={`Stage: ${STAGE_LABEL[stage]}`} />
            <div className="space-y-4 px-5 pb-5">
              <ActionPanel recId={String(r.id)} version={Number(r.version)} offered={offered} owners={owners} currency={currency} />
              <KeyValue
                items={[
                  { label: "Owner", value: str(r.owner_name) ?? "Unassigned" },
                  { label: "Due date", value: str(r.due_date) ?? "—" },
                  {
                    label: "Ticket reference",
                    value: r.ticket_reference ? (
                      <span>
                        {String(r.ticket_reference)}
                        {r.ticket_url ? (
                          <>
                            {" · "}
                            <a href={String(r.ticket_url)} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-700 underline">
                              link
                            </a>
                          </>
                        ) : null}
                        <span className="block text-[11px] text-slate-500">Manually recorded in FCC — not verified with an external ticketing system</span>
                      </span>
                    ) : (
                      "—"
                    ),
                  },
                  {
                    label: "Change approval reference",
                    value: r.change_reference ? (
                      <span>
                        {String(r.change_reference)}
                        <span className="block text-[11px] text-slate-500">Recorded by the engineering owner from their change process — not verified externally</span>
                      </span>
                    ) : (
                      "—"
                    ),
                  },
                ]}
              />
              {r.remediation_plan ? (
                <div>
                  <h3 className="eyebrow mb-1">Remediation plan</h3>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{String(r.remediation_plan)}</p>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Implementation evidence" />
            <div className="px-5 pb-5">
              {d.evidence.length ? (
                <ul className="space-y-3">
                  {d.evidence.map((e, i) => (
                    <li key={i} className="rounded-lg border border-line p-3 text-sm">
                      <div className="text-xs text-slate-500">
                        Implemented on {e.implementedOn} · submitted by {e.submittedBy} · <Timestamp iso={e.submittedAt} />
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-slate-700">{e.summary}</p>
                      {e.url && (
                        <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-brand-700 underline">
                          Evidence link
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No evidence submitted.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Savings verification" subtitle="Decisions by FinOps reviewers. The owner and implementer cannot verify their own change." />
            <div className="space-y-3 px-5 pb-5">
              {d.verifications.length ? (
                d.verifications.map((v, i) => (
                  <div key={i} className={`rounded-lg p-3 text-sm ${v.decision === "verified" ? "bg-emerald-50" : "bg-slate-50"}`}>
                    <div className="font-medium text-slate-900">
                      {v.decision === "verified" ? `Verified: ${formatMoney(big(v.monthly_savings_micros), str(v.currency))} per month (monthly-normalized)` : "Savings not verified"}
                    </div>
                    <div className="text-xs text-slate-600">
                      By {String(v.decided_by_name)} · <Timestamp iso={str(v.decided_at)} />
                    </div>
                    {v.decision === "verified" ? (
                      <ul className="mt-2 space-y-0.5 text-xs text-slate-700">
                        <li>
                          Baseline {String(v.baseline_from)} → {String(v.baseline_to)}: {formatMoney(big(v.baseline_cost_micros), str(v.currency))}
                        </li>
                        <li>
                          Post-change {String(v.post_from)} → {String(v.post_to)}: {formatMoney(big(v.post_cost_micros), str(v.currency))}
                        </li>
                        <li>Method: {VERIFICATION_METHODS[String(v.method) as keyof typeof VERIFICATION_METHODS] ?? String(v.method)}</li>
                        <li>Source evidence: {String(v.source_reference)}</li>
                        {v.notes ? <li>Notes: {String(v.notes)}</li> : null}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-slate-700">Reason: {String(v.reason)}</p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No verification decision yet. Until one is recorded, any savings remain an estimate.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="History" subtitle="Every change, with who made it and when" />
            <ol className="space-y-2 px-5 pb-5 text-sm">
              {d.events.map((e, i) => (
                <li key={i} className="border-l-2 border-slate-200 pl-3">
                  <div className="text-xs text-slate-500">
                    <Timestamp iso={e.at} /> · {e.actorName ?? "System (Azure sync)"}
                  </div>
                  <div className="text-slate-800">
                    {e.action === "ingested" ? "Imported from Azure Advisor" : (ACTIONS[e.action as PilotAction]?.label ?? e.action)}
                    {e.fromStage && e.toStage && e.fromStage !== e.toStage ? ` · ${STAGE_LABEL[e.fromStage as PilotStage]} → ${STAGE_LABEL[e.toStage as PilotStage]}` : ""}
                  </div>
                  {e.note ? <p className="whitespace-pre-wrap text-xs text-slate-600">{e.note}</p> : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Advisor estimate" subtitle="Reported by Azure Advisor. An estimate, not achieved savings." />
            <div className="space-y-2 px-5 pb-5 text-sm">
              {monthly !== null || annual !== null ? (
                <KeyValue
                  cols={1}
                  items={[
                    { label: "Monthly estimate", value: formatMoney(monthly, currency) },
                    { label: "Annual estimate", value: `${formatMoney(annual, currency)}${Number(r.est_annual_is_derived) === 1 ? " (derived: monthly × 12)" : " (as reported by Advisor)"}` },
                  ]}
                />
              ) : (
                <p className="text-slate-500">Advisor did not provide a savings estimate for this recommendation. FCC does not create one.</p>
              )}
              <Note>Advisor estimates can overlap with other recommendations for the same resource (for example rightsizing and reservations).</Note>
            </div>
          </Card>
          <Card>
            <CardHeader title="Source" />
            <div className="px-5 pb-5">
              <KeyValue
                cols={1}
                items={[
                  { label: "Category / impact", value: `${String(r.category)} · ${str(r.impact) ?? "—"}` },
                  { label: "Impacted resource", value: `${str(r.impacted_name) ?? "—"}${r.impacted_type ? ` (${String(r.impacted_type)})` : ""}` },
                  { label: "Resource ID", value: <span className="break-all font-mono text-[11px]">{str(r.resource_id) ?? "—"}</span> },
                  {
                    label: "Inventory",
                    value: d.resource ? `${d.resource.isPresent ? "Present" : "No longer present"} · ${d.resource.location ?? "—"} · last seen ${d.resource.lastSeenAt.slice(0, 10)}` : "Not in synchronized inventory",
                  },
                  { label: "Advisor recommendation ID", value: <span className="break-all font-mono text-[11px]">{String(r.source_id)}</span> },
                  { label: "Advisor last updated", value: <Timestamp iso={str(r.source_last_updated)} empty="Not provided" /> },
                  { label: "Last seen in refresh", value: <Timestamp iso={str(r.last_seen_at)} /> },
                  {
                    label: "Learn more",
                    value: r.learn_more_url ? (
                      <a href={String(r.learn_more_url)} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-700 underline">
                        Microsoft documentation
                      </a>
                    ) : (
                      "—"
                    ),
                  },
                ]}
              />
            </div>
          </Card>
        </div>
      </div>
    </PilotShell>
  );
}
