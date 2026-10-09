// Portfolio read models: cost, pipeline, verified savings, inventory, connector health, audit.
// Callers must have checked `portfolio.read` (or `admin.read` for audit/diagnostics) before calling.
import type { PilotConfig } from "../config";
import type { Db } from "../db/types";
import { addTo, type CurrencyTotals } from "../money";
import { OPEN_STAGES, STAGES, type PilotStage } from "../workflow/rules";
import type { SyncSource } from "../sync/service";
import { approvedClause } from "./scope";

const big = (v: unknown) => (v === null || v === undefined ? 0n : BigInt(v as string | number | bigint));
const num = (v: unknown) => Number(v ?? 0);

// ---------------------------------------------------------------------------------------------------------------
// Connector health
// ---------------------------------------------------------------------------------------------------------------

export type ConnectorStatus = "connected" | "stale" | "partial" | "unauthorized" | "failed_using_cached" | "unavailable" | "running" | "not_run";

export interface ScopeHealth {
  source: SyncSource;
  scope: string;
  status: ConnectorStatus;
  lastAttemptAt: string | null;
  lastAttemptStatus: string | null;
  lastSuccessAt: string | null;
  lastDurationMs: number | null;
  lastRecords: number | null;
  errorClass: string | null;
  errorDetail: string | null;
}

export function statusFor(
  latest: { status: string; finished_at: string | null; started_at: string } | undefined,
  lastSuccessAt: string | null,
  staleHours: number,
  now: Date,
): ConnectorStatus {
  if (!latest) return "not_run";
  if (latest.status === "running") return "running";
  if (latest.status === "unauthorized") return "unauthorized";
  if (latest.status === "failed") return lastSuccessAt ? "failed_using_cached" : "unavailable";
  if (latest.status === "partial") return "partial";
  const age = now.getTime() - Date.parse(latest.finished_at ?? latest.started_at);
  return age > staleHours * 3_600_000 ? "stale" : "connected";
}

const STALE_KEY: Record<SyncSource, keyof PilotConfig["staleAfterHours"]> = { inventory: "inventory", cost: "cost", advisor: "advisor" };

export async function connectorHealth(db: Db, cfg: PilotConfig, now = new Date()): Promise<ScopeHealth[]> {
  const out: ScopeHealth[] = [];
  for (const source of ["inventory", "cost", "advisor"] as SyncSource[]) {
    for (const scope of cfg.subscriptionIds) {
      const latest = await db.get<Record<string, string | number | null>>(
        `SELECT status, started_at, finished_at, records_written, error_class, error_detail FROM sync_runs WHERE source=@s AND scope=@sc ORDER BY started_at DESC ${db.paginate("one", "zero")}`,
        { s: source, sc: scope, one: 1, zero: 0 },
      );
      const ok = await db.get<{ finished_at: string }>(
        `SELECT finished_at FROM sync_runs WHERE source=@s AND scope=@sc AND status IN ('success','partial') ORDER BY started_at DESC ${db.paginate("one", "zero")}`,
        { s: source, sc: scope, one: 1, zero: 0 },
      );
      const lastSuccessAt = ok?.finished_at ?? null;
      out.push({
        source,
        scope,
        status: statusFor(latest as never, lastSuccessAt, cfg.staleAfterHours[STALE_KEY[source]], now),
        lastAttemptAt: (latest?.started_at as string) ?? null,
        lastAttemptStatus: (latest?.status as string) ?? null,
        lastSuccessAt,
        lastDurationMs: latest?.finished_at ? Date.parse(latest.finished_at as string) - Date.parse(latest.started_at as string) : null,
        lastRecords: latest ? num(latest.records_written) : null,
        errorClass: (latest?.error_class as string) ?? null,
        errorDetail: (latest?.error_detail as string) ?? null,
      });
    }
  }
  return out;
}

const SEVERITY: ConnectorStatus[] = ["unavailable", "unauthorized", "failed_using_cached", "not_run", "partial", "stale", "running", "connected"];
/** Worst status across the approved subscriptions for one source. */
export function worstStatus(rows: ScopeHealth[], source: SyncSource): ConnectorStatus {
  const statuses = rows.filter((r) => r.source === source).map((r) => r.status);
  if (!statuses.length) return "not_run";
  return [...statuses].sort((a, b) => SEVERITY.indexOf(a) - SEVERITY.indexOf(b))[0];
}

export async function recentRuns(db: Db, limit = 30) {
  return db.all<Record<string, string | number | null>>(
    `SELECT id, source, scope, trigger_kind, started_at, finished_at, status, records_read, records_written, error_class, error_detail FROM sync_runs ORDER BY started_at DESC ${db.paginate("lim", "off")}`,
    { lim: limit, off: 0 },
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------------------------------------------

export interface CostPeriodTotal {
  label: string;
  from: string;
  to: string;
  complete: boolean; // false for the current (period-to-date) month
  coveredThrough: string | null; // last day included in the stored window
  totals: Record<"ActualCost" | "AmortizedCost", CurrencyTotals>;
  subscriptionsWithData: number;
}

export interface CostSummary {
  available: boolean;
  lastRetrievedAt: string | null;
  periods: CostPeriodTotal[];
  subscriptionsCovered: number;
  subscriptionsApproved: number;
}

function monthBounds(now: Date, offset: number) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + offset;
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { from, to };
}

export async function costSummary(db: Db, cfg: PilotConfig, now = new Date()): Promise<CostSummary> {
  const windows = await db.all<{ subscription_id: string; cost_type: string; from_date: string; to_date: string; retrieved_at: string }>(`SELECT subscription_id, cost_type, from_date, to_date, retrieved_at FROM cost_windows`);
  const approved = new Set(cfg.subscriptionIds);
  const inScope = windows.filter((w) => approved.has(w.subscription_id.trim()));
  const covered = new Set(inScope.map((w) => w.subscription_id.trim()));
  const lastRetrievedAt = inScope.map((w) => w.retrieved_at).sort().at(-1) ?? null;
  const periods: CostPeriodTotal[] = [];
  const today = now.toISOString().slice(0, 10);
  for (const [label, offset] of [
    ["Previous month", -1],
    ["Current month to date", 0],
  ] as const) {
    const b = monthBounds(now, offset);
    const to = offset === 0 ? today : b.to;
    const subParams = Object.fromEntries(cfg.subscriptionIds.map((s, i) => [`s${i}`, s]));
    const rows = await db.all<{ cost_type: string; currency: string; amount: string | number | bigint; subs: number | bigint }>(
      `SELECT cost_type, currency, SUM(amount_micros) AS amount, COUNT(DISTINCT subscription_id) AS subs FROM cost_daily
       WHERE usage_date >= @f AND usage_date <= @t AND subscription_id IN (${cfg.subscriptionIds.map((_, i) => `@s${i}`).join(",")}) GROUP BY cost_type, currency`,
      { f: b.from, t: to, ...subParams },
    );
    const totals: CostPeriodTotal["totals"] = { ActualCost: {}, AmortizedCost: {} };
    let subs = 0;
    for (const r of rows) {
      addTo(totals[r.cost_type as "ActualCost" | "AmortizedCost"], r.currency.trim(), big(r.amount));
      subs = Math.max(subs, num(r.subs));
    }
    const coverEnd = inScope.filter((w) => w.from_date <= b.from).map((w) => w.to_date).sort()[0] ?? null; // weakest coverage across subscriptions
    periods.push({ label, from: b.from, to, complete: offset < 0 && !!coverEnd && coverEnd >= b.to, coveredThrough: coverEnd, totals, subscriptionsWithData: subs });
  }
  return { available: inScope.length > 0, lastRetrievedAt, periods, subscriptionsCovered: covered.size, subscriptionsApproved: cfg.subscriptionIds.length };
}

export interface DailyPoint {
  date: string;
  actual: number | null;
  amortized: number | null;
}

/** Daily series for one currency. Days inside the retrieved window with no rows are 0; outside it they are null (no data). */
export async function costDaily(db: Db, cfg: PilotConfig, opts: { subscription?: string; currency?: string }) {
  const subs = opts.subscription && cfg.subscriptionIds.includes(opts.subscription) ? [opts.subscription] : cfg.subscriptionIds;
  const inList = subs.map((_, i) => `@s${i}`).join(",");
  const subParams = Object.fromEntries(subs.map((s, i) => [`s${i}`, s]));
  const windows = await db.all<{ subscription_id: string; cost_type: string; from_date: string; to_date: string }>(`SELECT subscription_id, cost_type, from_date, to_date FROM cost_windows WHERE subscription_id IN (${inList})`, subParams);
  const currencies = await db.all<{ currency: string }>(`SELECT DISTINCT currency FROM cost_daily WHERE subscription_id IN (${inList}) ORDER BY currency`, subParams);
  const currencyList = currencies.map((c) => c.currency.trim());
  const currency = opts.currency && currencyList.includes(opts.currency) ? opts.currency : (currencyList[0] ?? null);
  if (!currency || !windows.length) return { currency, currencies: currencyList, points: [] as DailyPoint[], from: null, to: null };
  const rows = await db.all<{ usage_date: string; cost_type: string; amount: string | number | bigint }>(
    `SELECT usage_date, cost_type, SUM(amount_micros) AS amount FROM cost_daily WHERE currency = @c AND subscription_id IN (${inList}) GROUP BY usage_date, cost_type ORDER BY usage_date`,
    { c: currency, ...subParams },
  );
  const from = windows.map((w) => w.from_date).sort()[0];
  const to = windows.map((w) => w.to_date).sort().at(-1)!;
  // Azure cost data lags: days after the last date Azure returned any row for a cost type are "no data", not zero.
  const lastWithData = Object.fromEntries(
    (await db.all<{ cost_type: string; d: string }>(`SELECT cost_type, MAX(usage_date) AS d FROM cost_daily WHERE subscription_id IN (${inList}) GROUP BY cost_type`, subParams)).map((r) => [r.cost_type, r.d.trim()]),
  );
  const inWindow = (type: string, d: string) => !!lastWithData[type] && d <= lastWithData[type] && windows.some((w) => w.cost_type === type && w.from_date <= d && w.to_date >= d);
  const byKey = new Map(rows.map((r) => [`${r.usage_date.trim()}|${r.cost_type}`, Number(big(r.amount)) / 1e6]));
  const points: DailyPoint[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    points.push({
      date: d,
      actual: inWindow("ActualCost", d) ? (byKey.get(`${d}|ActualCost`) ?? 0) : null,
      amortized: inWindow("AmortizedCost", d) ? (byKey.get(`${d}|AmortizedCost`) ?? 0) : null,
    });
  }
  return { currency, currencies: currencyList, points, from, to };
}

// ---------------------------------------------------------------------------------------------------------------
// Recommendation pipeline and savings
// ---------------------------------------------------------------------------------------------------------------

export interface Pipeline {
  byStage: Record<PilotStage, number>;
  /** Advisor-estimated monthly savings, open recommendations only, one value per recommendation, per currency. */
  estimatedOpenMonthly: CurrencyTotals;
  estimatedUnassignedMonthly: CurrencyTotals;
  estimatedAssignedMonthly: CurrencyTotals;
  estimatedAwaitingVerificationMonthly: CurrencyTotals;
  openWithoutEstimate: number;
  /** Resources with more than one open recommendation (estimates may overlap). */
  overlappingResources: number;
  notReturnedOpen: number;
}

export async function pipeline(db: Db, approved?: string[]): Promise<Pipeline> {
  const ap = approvedClause("subscription_id", approved);
  const and = ap.sql ? ` AND ${ap.sql}` : "";
  const P = ap.params;
  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<PilotStage, number>;
  for (const r of await db.all<{ stage: PilotStage; c: number | bigint }>(`SELECT stage, COUNT(*) AS c FROM recommendations WHERE 1 = 1${and} GROUP BY stage`, P)) byStage[r.stage] = num(r.c);
  const open = OPEN_STAGES.map((s) => `'${s}'`).join(",");
  const sums = await db.all<{ bucket: string; est_currency: string; amount: string | number | bigint }>(
    `SELECT CASE WHEN stage IN ('identified','validated') THEN 'unassigned' WHEN stage = 'implemented' THEN 'awaiting' ELSE 'assigned' END AS bucket, est_currency, SUM(est_monthly_micros) AS amount
     FROM recommendations WHERE stage IN (${open}) AND est_monthly_micros IS NOT NULL AND est_currency IS NOT NULL AND source_status = 'active'${and}
     GROUP BY CASE WHEN stage IN ('identified','validated') THEN 'unassigned' WHEN stage = 'implemented' THEN 'awaiting' ELSE 'assigned' END, est_currency`,
    P,
  );
  const p: Pipeline = {
    byStage,
    estimatedOpenMonthly: {},
    estimatedUnassignedMonthly: {},
    estimatedAssignedMonthly: {},
    estimatedAwaitingVerificationMonthly: {},
    openWithoutEstimate: 0,
    overlappingResources: 0,
    notReturnedOpen: 0,
  };
  for (const r of sums) {
    const c = r.est_currency.trim();
    const v = big(r.amount);
    addTo(p.estimatedOpenMonthly, c, v);
    addTo(r.bucket === "unassigned" ? p.estimatedUnassignedMonthly : r.bucket === "awaiting" ? p.estimatedAwaitingVerificationMonthly : p.estimatedAssignedMonthly, c, v);
  }
  p.openWithoutEstimate = num((await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM recommendations WHERE stage IN (${open}) AND est_monthly_micros IS NULL${and}`, P))?.c);
  p.overlappingResources = num(
    (await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM (SELECT resource_key FROM recommendations WHERE stage IN (${open}) AND resource_key IS NOT NULL AND source_status = 'active'${and} GROUP BY resource_key HAVING COUNT(*) > 1) x`, P))?.c,
  );
  p.notReturnedOpen = num((await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM recommendations WHERE stage IN (${open}) AND source_status = 'not_returned'${and}`, P))?.c);
  return p;
}

export interface VerifiedSavings {
  monthly: CurrencyTotals;
  count: number;
  latestDecisionAt: string | null;
}

/**
 * Verified savings = the monthly-normalized measurement of the LATEST 'verified' decision for each recommendation that
 * is currently verified or closed. One value per recommendation; estimates are never included.
 */
export async function verifiedSavings(db: Db, approved?: string[]): Promise<VerifiedSavings> {
  const ap = approvedClause("r.subscription_id", approved);
  const rows = await db.all<{ rec_id: string; currency: string; monthly_savings_micros: string | number | bigint; decided_at: string }>(
    `SELECT v.rec_id, v.currency, v.monthly_savings_micros, v.decided_at FROM verifications v JOIN recommendations r ON r.id = v.rec_id
     WHERE v.decision = 'verified' AND r.stage IN ('verified','closed')${ap.sql ? ` AND ${ap.sql}` : ""}
       AND v.decided_at = (SELECT MAX(v2.decided_at) FROM verifications v2 WHERE v2.rec_id = v.rec_id AND v2.decision = 'verified')`,
    ap.params,
  );
  const seen = new Set<string>();
  const out: VerifiedSavings = { monthly: {}, count: 0, latestDecisionAt: null };
  for (const r of rows) {
    if (seen.has(r.rec_id)) continue; // two decisions in the same instant: count once
    seen.add(r.rec_id);
    addTo(out.monthly, r.currency.trim(), big(r.monthly_savings_micros));
    out.count++;
    if (!out.latestDecisionAt || r.decided_at > out.latestDecisionAt) out.latestDecisionAt = r.decided_at;
  }
  return out;
}

export async function verificationLedger(db: Db, approved?: string[], limit = 200) {
  const ap = approvedClause("r.subscription_id", approved);
  return db.all<Record<string, string | number | bigint | null>>(
    `SELECT v.rec_id, r.problem, r.impacted_name, v.decision, v.currency, v.monthly_savings_micros, v.baseline_from, v.baseline_to, v.post_from, v.post_to, v.method, v.source_reference, v.reason, v.decided_at, u.display_name AS decided_by_name, r.stage
     FROM verifications v JOIN recommendations r ON r.id = v.rec_id JOIN users u ON u.id = v.decided_by ${ap.sql ? `WHERE ${ap.sql}` : ""} ORDER BY v.decided_at DESC ${db.paginate("lim", "off")}`,
    { ...ap.params, lim: limit, off: 0 },
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------------------------------------------

export async function inventorySummary(db: Db, approved?: string[]) {
  const ap = approvedClause("subscription_id", approved);
  const t = await db.get<{ present: number | bigint; absent: number | bigint; last: string | null }>(
    `SELECT SUM(CASE WHEN is_present = 1 THEN 1 ELSE 0 END) AS present, SUM(CASE WHEN is_present = 0 THEN 1 ELSE 0 END) AS absent, MAX(last_seen_at) AS last FROM resources${ap.sql ? ` WHERE ${ap.sql}` : ""}`,
    ap.params,
  );
  const types = await db.all<{ type: string; c: number | bigint }>(
    `SELECT type, COUNT(*) AS c FROM resources WHERE is_present = 1${ap.sql ? ` AND ${ap.sql}` : ""} GROUP BY type ORDER BY COUNT(*) DESC, type ${db.paginate("lim", "off")}`,
    { ...ap.params, lim: 8, off: 0 },
  );
  return { present: num(t?.present), absent: num(t?.absent), lastSeenAt: t?.last ?? null, topTypes: types.map((x) => ({ type: x.type, count: num(x.c) })) };
}

export async function listResources(db: Db, cfg: PilotConfig, f: { q?: string; subscription?: string; type?: string; present?: string; page?: number; pageSize?: number }) {
  const pageSize = [25, 50, 100].includes(f.pageSize ?? 0) ? f.pageSize! : 50;
  const page = Math.max(1, Math.min(10_000, Math.floor(f.page ?? 1)));
  const clauses: string[] = [];
  const ap = approvedClause("subscription_id", cfg.subscriptionIds);
  clauses.push(ap.sql);
  const params: Record<string, string | number> = { ...(ap.params as Record<string, string>) };
  if (f.present !== "all") clauses.push(f.present === "absent" ? "is_present = 0" : "is_present = 1");
  if (f.subscription && cfg.subscriptionIds.includes(f.subscription)) {
    clauses.push("subscription_id = @sub");
    params.sub = f.subscription;
  }
  if (f.type && /^[a-z0-9./-]{3,200}$/i.test(f.type)) {
    clauses.push("type = @type");
    params.type = f.type.toLowerCase();
  }
  const q = (f.q ?? "").trim().slice(0, 100).toLowerCase().replace(/[%_[\]]/g, "");
  if (q) {
    clauses.push("(LOWER(name) LIKE @q OR LOWER(resource_group) LIKE @q OR LOWER(resource_id) LIKE @q)");
    params.q = `%${q}%`;
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = await db.get<{ c: number | bigint }>(`SELECT COUNT(*) AS c FROM resources ${where}`, params);
  const rows = await db.all<Record<string, string | number | bigint | null>>(
    `SELECT resource_id, name, type, resource_group, location, subscription_id, sku_name, tags_json, is_present, last_seen_at FROM resources ${where} ORDER BY name, resource_key ${db.paginate("lim", "off")}`,
    { ...params, lim: pageSize, off: (page - 1) * pageSize },
  );
  return { rows, total: num(total?.c), page, pageSize };
}

// ---------------------------------------------------------------------------------------------------------------
// Audit & users (administrators)
// ---------------------------------------------------------------------------------------------------------------

export async function listAudit(db: Db, f: { page?: number; action?: string }) {
  const pageSize = 50;
  const page = Math.max(1, Math.min(10_000, Math.floor(f.page ?? 1)));
  const where = f.action && /^[a-z_.]{3,64}$/.test(f.action) ? "WHERE a.action = @act" : "";
  const params: Record<string, string | number> = where ? { act: f.action! } : {};
  const total = await db.get<{ c: number | bigint }>(`SELECT COUNT(*) AS c FROM audit_events a ${where}`, params);
  const rows = await db.all<Record<string, string | null>>(
    `SELECT a.at, a.action, a.target_type, a.target_id, a.detail_json, u.display_name AS actor_name FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id ${where} ORDER BY a.at DESC, a.id ${db.paginate("lim", "off")}`,
    { ...params, lim: pageSize, off: (page - 1) * pageSize },
  );
  return { rows, total: num(total?.c), page, pageSize };
}

export async function listUsers(db: Db) {
  return db.all<{ id: string; display_name: string; email: string | null; roles: string; first_seen_at: string; last_seen_at: string }>(
    `SELECT id, display_name, email, roles, first_seen_at, last_seen_at FROM users ORDER BY display_name`,
  );
}
