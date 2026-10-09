import type { DbValue } from "../db/types";
/** SQL fragment restricting a subscription column to the currently approved subscriptions (bound parameters). */
export function approvedClause(column: string, approved: string[] | undefined, prefix = "ap"): { sql: string; params: Record<string, DbValue> } {
  if (!approved) return { sql: "", params: {} };
  if (!approved.length) return { sql: "1 = 0", params: {} };
  const params = Object.fromEntries(approved.map((s, i) => [`${prefix}${i}`, s]));
  return { sql: `${column} IN (${approved.map((_, i) => `@${prefix}${i}`).join(",")})`, params };
}
