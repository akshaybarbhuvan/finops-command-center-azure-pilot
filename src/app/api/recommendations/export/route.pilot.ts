import { handleApi } from "@/pilot/http/api";
import { exportRecommendations } from "@/pilot/queries/recommendations";
import { microsToDecimal } from "@/pilot/money";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "id",
  "source",
  "source_id",
  "subscription_id",
  "resource_id",
  "category",
  "impact",
  "priority",
  "stage",
  "owner_name",
  "due_date",
  "problem",
  "solution",
  "est_currency",
  "est_monthly",
  "est_annual",
  "est_annual_is_derived",
  "source_status",
  "source_last_updated",
  "last_seen_at",
  "ticket_reference",
  "change_reference",
  "updated_at",
] as const;

export async function GET(req: Request) {
  return handleApi(req, { limit: { bucket: "export", capacity: 10, perMinute: 2 } }, async ({ actor, db, config, requestId }) => {
    const sp = new URL(req.url).searchParams;
    const rows = await exportRecommendations(db, actor, {
      stage: sp.get("stage") ?? undefined,
      category: sp.get("category") ?? undefined,
      impact: sp.get("impact") ?? undefined,
      priority: sp.get("priority") ?? undefined,
      subscription: sp.get("subscription") ?? undefined,
      owner: sp.get("owner") ?? undefined,
      sourceStatus: sp.get("sourceStatus") ?? undefined,
      q: sp.get("q") ?? undefined,
      approvedSubscriptions: config.subscriptionIds,
    });
    const shaped = rows.map((r) => ({
      ...r,
      est_monthly: r.est_monthly_micros === null || r.est_monthly_micros === undefined ? "" : microsToDecimal(BigInt(r.est_monthly_micros)),
      est_annual: r.est_annual_micros === null || r.est_annual_micros === undefined ? "" : microsToDecimal(BigInt(r.est_annual_micros)),
      est_annual_is_derived: Number(r.est_annual_is_derived) === 1 ? "yes (monthly x 12)" : r.est_annual_micros === null ? "" : "no (source value)",
    }));
    const csv = toCsv(
      shaped,
      COLUMNS.map((c) => ({ header: c, value: (r: (typeof shaped)[number]) => (r as Record<string, string | number | bigint | null>)[c] as string | number | null })),
    );
    return new Response("﻿" + csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="fcc-recommendations-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
        "x-request-id": requestId,
      },
    });
  });
}
