// Standard financial, percentage and date formatting used across the application.

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Dashboard notation: $12.4M · $845K · $42.3K · $2,450 */
export function money(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 100_000_000 ? 0 : abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 100_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${usd0.format(abs)}`;
}

/** Exact dollars for detail views: $214,800 */
export function moneyExact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return usd0.format(Math.round(value));
}

/** Signed variance: +$124K / -$82K */
export function moneySigned(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.round(value) === 0) return "$0";
  return `${value > 0 ? "+" : "-"}${money(Math.abs(value)).replace("-", "")}`;
}

/** 12.4% */
export function pct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/** +3.2% / -1.4% */
export function pctSigned(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const v = Number(value.toFixed(digits));
  if (v === 0) return `0.${"0".repeat(digits)}%`;
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function num(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Oct 7, 2026 */
export function date(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** Oct 7 */
export function dateShort(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "2026-10" -> "Oct '26" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} '${String(y).slice(2)}`;
}

/** "2026-10" -> "October 2026" */
export function monthLong(month: string): string {
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const [y, m] = month.split("-").map(Number);
  return `${names[m - 1]} ${y}`;
}

export function plural(n: number, word: string, pluralWord?: string) {
  return `${num(n)} ${n === 1 ? word : pluralWord ?? `${word}s`}`;
}
