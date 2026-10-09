import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/primitives";
import { PageHeader } from "@/components/data/blocks";
import { pageSession } from "@/components/pilot/guard";
import { PilotShell } from "@/components/pilot/Shell";
import { CurrencyAmounts, Note, SimpleTable, Timestamp, td } from "@/components/pilot/ui";
import { verificationLedger, verifiedSavings } from "@/pilot/queries/portfolio";
import { formatMoney } from "@/pilot/money";

export const metadata = { title: "Verified Savings" };

export default async function Savings() {
  const s = await pageSession(["portfolio.read"]);
  if (!s.ok) return s.view;
  const [totals, ledger] = await Promise.all([verifiedSavings(s.db, s.config.subscriptionIds), verificationLedger(s.db, s.config.subscriptionIds)]);
  return (
    <PilotShell actor={s.actor} config={s.config} active="/savings">
      <PageHeader title="Verified Savings" subtitle="FinOps-attested savings: an independent FinOps reviewer enters before/after cost figures from Cost Management or invoices, with a source reference. FCC does not automatically reconcile them with billing. Estimates are not included here." />
      <Card>
        <CardHeader title="Total verified (monthly-normalized)" subtitle={`${totals.count} recommendation(s); latest decision ${totals.latestDecisionAt ? totals.latestDecisionAt.slice(0, 10) : "—"}`} />
        <div className="px-5 pb-5 text-xl font-semibold text-slate-900">
          <CurrencyAmounts totals={totals.monthly} empty="None verified yet" />
        </div>
      </Card>
      <Card className="p-4">
        <SimpleTable caption="Verification decisions" head={["Recommendation", "Decision", "Monthly savings", "Measurement windows", "Method / evidence", "Reviewer"]} empty={!ledger.length ? <p className="py-6 text-center text-sm text-slate-500">No verification decisions yet.</p> : null}>
          {ledger.map((v, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              <td className={td}>
                <Link href={`/recommendations/${String(v.rec_id)}`} className="text-brand-700 hover:underline">
                  {String(v.problem)}
                </Link>
                <div className="text-xs text-slate-500">{v.impacted_name ? String(v.impacted_name) : ""}</div>
              </td>
              <td className={td}>{v.decision === "verified" ? "Verified" : `Not verified: ${String(v.reason ?? "")}`}</td>
              <td className={`${td} num`}>{v.decision === "verified" ? formatMoney(BigInt(v.monthly_savings_micros as string | number | bigint), String(v.currency)) : "—"}</td>
              <td className={`${td} text-xs`}>{v.decision === "verified" ? `${String(v.baseline_from)}–${String(v.baseline_to)} vs ${String(v.post_from)}–${String(v.post_to)}` : "—"}</td>
              <td className={`${td} text-xs`}>{v.decision === "verified" ? `${String(v.method)} · ${String(v.source_reference)}` : "—"}</td>
              <td className={`${td} text-xs`}>
                {String(v.decided_by_name)}
                <div>
                  <Timestamp iso={String(v.decided_at)} />
                </div>
              </td>
            </tr>
          ))}
        </SimpleTable>
      </Card>
      <Note>Policy: a FinOps reviewer who is neither the owner nor the implementer compares a baseline window before implementation with a post-change window after it (each at least 7 days), using Azure Cost Management or invoice figures. Savings = (baseline ÷ baseline days − post ÷ post days) × 30.4375. See docs/DATA_DICTIONARY.md.</Note>
    </PilotShell>
  );
}
