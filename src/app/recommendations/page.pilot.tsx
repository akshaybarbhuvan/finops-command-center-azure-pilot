import Link from "next/link";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { PageHeader } from "@/components/data/blocks";
import { pageSession } from "@/components/pilot/guard";
import { PilotShell } from "@/components/pilot/Shell";
import { RecTable } from "@/components/pilot/RecTable";
import { Pager, Note } from "@/components/pilot/ui";
import { can } from "@/pilot/auth/permissions";
import { listRecommendations, type RecFilters } from "@/pilot/queries/recommendations";
import { PRIORITIES, STAGE_LABEL, STAGES } from "@/pilot/workflow/rules";

export const metadata = { title: "Recommendations" };
type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Recommendations({ searchParams }: { searchParams: SP }) {
  const s = await pageSession(["portfolio.read", "recs.read.owned"]);
  if (!s.ok) return s.view;
  const sp = await searchParams;
  const f: RecFilters = {
    stage: one(sp.stage) ?? "open",
    category: one(sp.category),
    impact: one(sp.impact),
    priority: one(sp.priority),
    subscription: one(sp.subscription),
    owner: one(sp.owner),
    sourceStatus: one(sp.sourceStatus),
    q: one(sp.q),
    page: Number(one(sp.page) ?? 1) || 1,
    pageSize: Number(one(sp.pageSize) ?? 25) || 25,
  };
  const result = await listRecommendations(s.db, s.actor, { ...f, approvedSubscriptions: s.config.subscriptionIds });
  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, ...over })) if (v !== undefined && v !== "" && k !== "pageSize") p.set(k, String(v));
    return p.toString();
  };
  const portfolio = can(s.actor, "portfolio.read");
  return (
    <PilotShell actor={s.actor} config={s.config} active="/recommendations">
      <PageHeader
        title="Recommendations"
        subtitle={portfolio ? "All recommendations in the approved scope." : "Recommendations assigned to you. Other owners' records are not visible to your role."}
        actions={
          <a href={`/api/recommendations/export?${qs({ page: undefined })}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4" aria-hidden /> Export CSV (with estimates)
          </a>
        }
      />
      <Card className="p-4">
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6" aria-label="Filter recommendations">
          <label className="text-xs font-medium text-slate-600 lg:col-span-2">
            Search
            <input name="q" defaultValue={f.q} className="input mt-1" placeholder="Problem, resource, ticket" maxLength={100} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Stage
            <select name="stage" defaultValue={f.stage} className="input mt-1">
              <option value="open">All open</option>
              <option value="">Any</option>
              {STAGES.map((st) => (
                <option key={st} value={st}>
                  {STAGE_LABEL[st]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Priority
            <select name="priority" defaultValue={f.priority ?? ""} className="input mt-1">
              <option value="">Any</option>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Impact (Advisor)
            <select name="impact" defaultValue={f.impact ?? ""} className="input mt-1">
              <option value="">Any</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </label>
          {portfolio ? (
            <label className="text-xs font-medium text-slate-600">
              Owner
              <select name="owner" defaultValue={f.owner ?? ""} className="input mt-1">
                <option value="">Any</option>
                <option value="me">Me</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </label>
          ) : null}
          <label className="text-xs font-medium text-slate-600">
            Source status
            <select name="sourceStatus" defaultValue={f.sourceStatus ?? ""} className="input mt-1">
              <option value="">Any</option>
              <option value="active">Returned by Advisor</option>
              <option value="not_returned">No longer returned</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="h-9 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
              Apply
            </button>
            <Link href="/recommendations" className="h-9 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
              Clear
            </Link>
          </div>
        </form>
      </Card>
      <Card className="p-4">
        <RecTable rows={result.rows} caption="Recommendations" showOwner={portfolio} />
        <Pager page={result.page} pageSize={result.pageSize} total={result.total} hrefFor={(p) => `/recommendations?${qs({ page: p })}`} />
      </Card>
      <Note>Source: Azure Advisor ({s.config.advisorCategories.join(", ")} category). Savings estimates are shown on each recommendation and in the export, labelled as estimates. Advisor does not cover every optimization category.</Note>
    </PilotShell>
  );
}
