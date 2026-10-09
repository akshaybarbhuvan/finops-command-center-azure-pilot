import { Card, CardHeader } from "@/components/ui/primitives";
import { PageHeader } from "@/components/data/blocks";
import { pageSession } from "@/components/pilot/guard";
import { PilotShell } from "@/components/pilot/Shell";
import { CostChart } from "@/components/pilot/CostChart";
import { CurrencyAmounts, Note, SourceTag, Timestamp, shortSub } from "@/components/pilot/ui";
import { costDaily, costSummary } from "@/pilot/queries/portfolio";

export const metadata = { title: "Cost" };
type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Cost({ searchParams }: { searchParams: SP }) {
  const s = await pageSession(["portfolio.read"]);
  if (!s.ok) return s.view;
  const sp = await searchParams;
  const subscription = one(sp.subscription);
  const [summary, series] = await Promise.all([costSummary(s.db, s.config), costDaily(s.db, s.config, { subscription, currency: one(sp.currency) })]);
  return (
    <PilotShell actor={s.actor} config={s.config} active="/cost">
      <PageHeader title="Cost" subtitle="Daily actual and amortized cost from Azure Cost Management for the approved subscriptions." actions={<SourceTag kind="cost" />} />
      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Cost filters">
          <label className="text-xs font-medium text-slate-600">
            Subscription
            <select name="subscription" defaultValue={subscription ?? ""} className="input mt-1 w-56">
              <option value="">All approved ({s.config.subscriptionIds.length})</option>
              {s.config.subscriptionIds.map((id) => (
                <option key={id} value={id}>
                  {shortSub(id)}
                </option>
              ))}
            </select>
          </label>
          {series.currencies.length > 1 && (
            <label className="text-xs font-medium text-slate-600">
              Currency
              <select name="currency" defaultValue={series.currency ?? ""} className="input mt-1 w-32">
                {series.currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className="h-9 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
            Apply
          </button>
        </form>
      </Card>
      <Card>
        <CardHeader title={series.currency ? `Daily cost (${series.currency})` : "Daily cost"} subtitle={series.from ? `${series.from} → ${series.to} (UTC days). Gaps mean no data (not retrieved, or after the latest day Azure has reported — cost data lags); zero means Azure reported no cost for a day before that.` : undefined} />
        <div className="px-5 pb-5">
          {series.points.length && series.currency ? <CostChart points={series.points} currency={series.currency} /> : <Note tone="warning">No cost data has been retrieved for this selection.</Note>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Period totals (all approved subscriptions)" subtitle={`Last retrieved ${summary.lastRetrievedAt ? summary.lastRetrievedAt.slice(0, 16).replace("T", " ") + " UTC" : "never"}`} />
        <div className="grid gap-4 px-5 pb-5 md:grid-cols-2">
          {summary.periods.map((p) => (
            <div key={p.label} className="rounded-lg border border-line p-3 text-sm">
              <div className="font-medium text-slate-900">{p.label}</div>
              <div className="text-xs text-slate-500">
                {p.from} → {p.to} {p.label.startsWith("Current") ? "· incomplete period" : p.complete ? "· complete" : "· coverage incomplete"}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] text-slate-500">Actual</div>
                  <CurrencyAmounts totals={p.totals.ActualCost} />
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Amortized</div>
                  <CurrencyAmounts totals={p.totals.AmortizedCost} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <Note>
            Actual cost = charges as billed; amortized cost spreads reservation and savings-plan purchases over their term. Amounts in different currencies are never added together. Only subscription-scope charges are included; billing-account charges not attributed to an approved subscription are outside this view. Last retrieved: <Timestamp iso={summary.lastRetrievedAt} />.
          </Note>
        </div>
      </Card>
    </PilotShell>
  );
}
