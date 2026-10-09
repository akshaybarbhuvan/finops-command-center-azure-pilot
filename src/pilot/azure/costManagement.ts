// Azure Cost Management query connector (read-only).
// API: POST https://management.azure.com/subscriptions/{id}/providers/Microsoft.CostManagement/query?api-version=2023-11-01
// One query per subscription and cost type (ActualCost, AmortizedCost) for a bounded window
// (first day of the previous month → today, UTC), Daily granularity, summed cost column.
// The response is a column/row table; columns are located by name, never by position.
import { isCurrency, toMicros } from "../money";
import { ConnectorError, type ArmClient } from "./arm";

export const COST_MANAGEMENT_API = "2023-11-01";
export type CostType = "ActualCost" | "AmortizedCost";
export const COST_TYPES: CostType[] = ["ActualCost", "AmortizedCost"];

export interface CostWindow {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
}

/** First day of the previous calendar month (UTC) to the given day. Bounded: at most ~62 days. */
export function defaultCostWindow(now: Date): CostWindow {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const from = new Date(Date.UTC(y, m - 1, 1));
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

export interface DailyCost {
  date: string; // YYYY-MM-DD
  currency: string;
  micros: bigint;
}

interface QueryResult {
  properties?: { columns?: { name?: string; type?: string }[]; rows?: unknown[][]; nextLink?: string | null };
}

function toIsoDate(v: unknown): string | null {
  if (typeof v === "number" && Number.isInteger(v)) v = String(v);
  if (typeof v !== "string") return null;
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m ? m[1] : null;
}

/** Pure: converts one Cost Management result page into daily amounts. Throws if the shape is not understood. */
export function parseCostPage(result: QueryResult, aggregationColumn: string, window: CostWindow): DailyCost[] {
  const cols = result.properties?.columns;
  const rows = result.properties?.rows;
  if (!Array.isArray(cols) || !Array.isArray(rows)) throw new ConnectorError("invalid_response", "Cost Management response is missing columns or rows");
  const idx = (names: string[]) => cols.findIndex((c) => typeof c.name === "string" && names.some((n) => n.toLowerCase() === c.name!.toLowerCase()));
  const costIx = idx(["totalCost", aggregationColumn]);
  const dateIx = idx(["UsageDate"]);
  const curIx = idx(["Currency", "BillingCurrency", "BillingCurrencyCode"]);
  if (costIx < 0) throw new ConnectorError("invalid_response", `Cost Management response has no '${aggregationColumn}' column`);
  if (dateIx < 0) throw new ConnectorError("invalid_response", "Cost Management response has no UsageDate column");
  if (curIx < 0) throw new ConnectorError("invalid_response", "Cost Management response has no currency column; refusing to assume a currency");
  const out: DailyCost[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) throw new ConnectorError("invalid_response", "Cost Management row is not an array");
    const date = toIsoDate(row[dateIx]);
    const currency = typeof row[curIx] === "string" ? (row[curIx] as string).toUpperCase() : "";
    const amount = row[costIx];
    if (!date || date < window.from || date > window.to) throw new ConnectorError("invalid_response", "Cost Management returned a date outside the requested window");
    if (!isCurrency(currency)) throw new ConnectorError("invalid_response", "Cost Management returned an invalid currency code");
    if (typeof amount !== "number" && typeof amount !== "string") throw new ConnectorError("invalid_response", "Cost Management returned a non-numeric cost");
    let micros: bigint;
    try {
      micros = toMicros(amount);
    } catch {
      throw new ConnectorError("invalid_response", "Cost Management returned a non-numeric cost");
    }
    out.push({ date, currency, micros });
  }
  return out;
}

/** Sums rows by (date, currency) — pages and duplicate rows for the same day are combined, never overwritten. */
export function combineDaily(rows: DailyCost[]): DailyCost[] {
  const map = new Map<string, DailyCost>();
  for (const r of rows) {
    const k = `${r.date}|${r.currency}`;
    const prev = map.get(k);
    map.set(k, prev ? { ...prev, micros: prev.micros + r.micros } : { ...r });
  }
  return [...map.values()].sort((a, b) => (a.date + a.currency).localeCompare(b.date + b.currency));
}

export function costQueryBody(type: CostType, window: CostWindow, aggregationColumn: string) {
  return {
    type,
    timeframe: "Custom",
    timePeriod: { from: `${window.from}T00:00:00Z`, to: `${window.to}T23:59:59Z` },
    dataset: { granularity: "Daily", aggregation: { totalCost: { name: aggregationColumn, function: "Sum" } } },
  };
}

export async function queryDailyCost(
  client: ArmClient,
  subscriptionId: string,
  type: CostType,
  window: CostWindow,
  aggregationColumn: string,
  signal?: AbortSignal,
): Promise<DailyCost[]> {
  const body = costQueryBody(type, window, aggregationColumn);
  let url: string | null = `/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=${COST_MANAGEMENT_API}`;
  const all: DailyCost[] = [];
  for (let page = 0; url && page < 200; page++) {
    const r: QueryResult = await client.request<QueryResult>("POST", url, body, signal);
    all.push(...parseCostPage(r, aggregationColumn, window));
    url = r.properties?.nextLink || null;
  }
  if (url) throw new ConnectorError("limit_exceeded", "Cost Management pagination did not terminate");
  return combineDaily(all);
}
