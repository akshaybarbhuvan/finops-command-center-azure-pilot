// Monetary values are stored and summed as integer micro-units (1 unit = 1,000,000 micros) per ISO currency.
// This avoids binary floating-point drift in totals. Amounts in different currencies are never added together.
export const MICROS = 1_000_000n;

/** Converts a source amount (number or numeric string) to micros, rounding half away from zero. */
export function toMicros(value: number | string): bigint {
  const s = typeof value === "number" ? numberToPlain(value) : value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new RangeError("Not a finite decimal amount");
  const neg = s.startsWith("-");
  const [int, frac = ""] = s.replace("-", "").split(".");
  const padded = (frac + "0000000").slice(0, 7); // 6 kept digits + 1 rounding digit
  let micros = BigInt(int) * MICROS + BigInt(padded.slice(0, 6));
  if (Number(padded[6]) >= 5) micros += 1n;
  return neg ? -micros : micros;
}

function numberToPlain(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError("Not a finite amount");
  // toFixed(9) avoids exponent notation and keeps enough digits to round to micros correctly.
  return n.toFixed(9);
}

/** Micros → decimal string with 2 dp by default (for display / CSV). */
export function microsToDecimal(m: bigint, dp = 2): string {
  const neg = m < 0n;
  const abs = neg ? -m : m;
  const scale = 10n ** BigInt(6 - dp);
  let q = abs / scale;
  if ((abs % scale) * 2n >= scale) q += 1n; // round half up on the dropped digits
  const s = q.toString().padStart(dp + 1, "0");
  const out = dp ? `${s.slice(0, -dp)}.${s.slice(-dp)}` : s;
  return neg && q !== 0n ? `-${out}` : out;
}

export function microsToNumber(m: bigint): number {
  return Number(microsToDecimal(m, 6));
}

export const isCurrency = (c: string) => /^[A-Z]{3}$/.test(c);

export type CurrencyTotals = Record<string, bigint>;
export function addTo(totals: CurrencyTotals, currency: string, micros: bigint) {
  totals[currency] = (totals[currency] ?? 0n) + micros;
  return totals;
}

/** Display formatting with an explicit ISO currency code; never assumes USD. */
export function formatMoney(micros: bigint | null | undefined, currency: string | null | undefined, opts: { compact?: boolean } = {}): string {
  if (micros === null || micros === undefined || !currency) return "—";
  const n = microsToNumber(micros);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      notation: opts.compact && Math.abs(n) >= 100_000 ? "compact" : "standard",
      maximumFractionDigits: opts.compact ? 1 : 2,
      minimumFractionDigits: opts.compact ? 0 : 2,
    }).format(n);
  } catch {
    return `${microsToDecimal(micros)} ${currency}`;
  }
}

/** Serializable money (bigint is not JSON-serializable and must not cross to client components as bigint). */
export interface Money {
  micros: string;
  currency: string;
}
export const money = (micros: bigint, currency: string): Money => ({ micros: micros.toString(), currency });
export const fromMoney = (m: Money) => BigInt(m.micros);
