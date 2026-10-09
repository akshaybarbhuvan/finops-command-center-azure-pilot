// Azure Advisor recommendations connector (read-only).
// API: GET https://management.azure.com/subscriptions/{id}/providers/Microsoft.Advisor/recommendations?api-version=2025-01-01
// Filtered by the configured categories (default: Cost), paged by nextLink.
// Savings: Advisor cost recommendations carry extendedProperties.savingsAmount (Microsoft's Advisor sample queries
// treat it as monthly) and savingsCurrency; some also carry annualSavingsAmount. FCC records them only when present
// and never invents an estimate. Advisor estimates can overlap (rightsizing vs. reservations vs. savings plans).
import { z } from "zod";
import { sourceKey } from "../ids";
import { isCurrency, toMicros } from "../money";
import { ConnectorError, type ArmClient } from "./arm";

export const ADVISOR_API = "2025-01-01";

const Rec = z.object({
  id: z.string().min(1).max(2048).startsWith("/subscriptions/"),
  name: z.string().max(200).optional(),
  properties: z.object({
    category: z.string().max(64),
    impact: z.string().max(16).nullish(),
    impactedField: z.string().max(260).nullish(),
    impactedValue: z.string().max(400).nullish(),
    lastUpdated: z.string().max(40).nullish(),
    recommendationTypeId: z.string().max(64).nullish(),
    learnMoreLink: z.string().max(1000).nullish(),
    shortDescription: z.object({ problem: z.string().max(2000).nullish(), solution: z.string().max(2000).nullish() }).nullish(),
    resourceMetadata: z.object({ resourceId: z.string().max(2048).nullish() }).nullish(),
    extendedProperties: z.record(z.string(), z.unknown()).nullish(),
  }),
});

export interface AdvisorRecommendation {
  sourceId: string;
  sourceKey: string;
  subscriptionId: string;
  resourceId: string | null;
  resourceKey: string | null;
  impactedType: string | null;
  impactedName: string | null;
  category: string;
  impact: "High" | "Medium" | "Low" | null;
  problem: string;
  solution: string | null;
  recommendationTypeId: string | null;
  learnMoreUrl: string | null;
  sourceLastUpdated: string | null;
  estimate: { monthlyMicros: bigint | null; annualMicros: bigint | null; annualIsDerived: boolean; currency: string } | null;
}

const subFromId = (id: string) => /^\/subscriptions\/([0-9a-f-]{36})\//i.exec(id)?.[1]?.toLowerCase() ?? null;

function amount(v: unknown): bigint | null {
  if (typeof v !== "number" && typeof v !== "string") return null;
  try {
    const m = toMicros(v);
    return m >= 0n ? m : null;
  } catch {
    return null;
  }
}

/** Pure: validates and normalizes one Advisor recommendation; returns null if invalid or outside the subscription. */
export function normalizeAdvisor(item: unknown, expectedSubscriptionId: string): AdvisorRecommendation | null {
  const r = Rec.safeParse(item);
  if (!r.success) return null;
  const { id, properties: p } = r.data;
  const subscriptionId = subFromId(id);
  if (!subscriptionId || subscriptionId !== expectedSubscriptionId.toLowerCase()) return null;
  const resourceId = p.resourceMetadata?.resourceId?.startsWith("/subscriptions/") ? p.resourceMetadata.resourceId : null;
  const ext = p.extendedProperties ?? {};
  const currency = typeof ext.savingsCurrency === "string" ? ext.savingsCurrency.toUpperCase() : null;
  const monthly = amount(ext.savingsAmount);
  const annualSource = amount(ext.annualSavingsAmount);
  let estimate: AdvisorRecommendation["estimate"] = null;
  if (currency && isCurrency(currency) && (monthly !== null || annualSource !== null)) {
    estimate = {
      monthlyMicros: monthly,
      annualMicros: annualSource ?? (monthly !== null ? monthly * 12n : null),
      annualIsDerived: annualSource === null,
      currency,
    };
  }
  const impact = p.impact === "High" || p.impact === "Medium" || p.impact === "Low" ? p.impact : null;
  const learn = p.learnMoreLink && /^https:\/\//.test(p.learnMoreLink) ? p.learnMoreLink : null;
  return {
    sourceId: id,
    sourceKey: sourceKey(id),
    subscriptionId,
    resourceId,
    resourceKey: resourceId ? sourceKey(resourceId) : null,
    impactedType: p.impactedField ?? null,
    impactedName: p.impactedValue ?? null,
    category: p.category,
    impact,
    problem: p.shortDescription?.problem?.trim() || p.shortDescription?.solution?.trim() || "Advisor recommendation (no description provided by source)",
    solution: p.shortDescription?.solution?.trim() || null,
    recommendationTypeId: p.recommendationTypeId ?? null,
    learnMoreUrl: learn,
    sourceLastUpdated: p.lastUpdated ?? null,
    estimate,
  };
}

export function advisorFilter(categories: string[]): string {
  return categories.map((c) => `Category eq '${c.replace(/'/g, "")}'`).join(" or ");
}

interface ListResult {
  value?: unknown[];
  nextLink?: string | null;
}

export interface AdvisorFetch {
  items: AdvisorRecommendation[];
  rejected: number;
}

export async function listAdvisor(client: ArmClient, subscriptionId: string, categories: string[], signal?: AbortSignal, maxItems = 20000): Promise<AdvisorFetch> {
  const q = new URLSearchParams({ "api-version": ADVISOR_API, $filter: advisorFilter(categories), $top: "100" });
  let url: string | null = `/subscriptions/${subscriptionId}/providers/Microsoft.Advisor/recommendations?${q.toString()}`;
  const items: AdvisorRecommendation[] = [];
  let rejected = 0;
  for (let page = 0; url && page < 500; page++) {
    const r: ListResult = await client.request<ListResult>("GET", url, undefined, signal);
    if (!Array.isArray(r.value)) throw new ConnectorError("invalid_response", "Advisor response did not contain a value array");
    for (const v of r.value) {
      const n = normalizeAdvisor(v, subscriptionId);
      if (!n || !categories.includes(n.category)) rejected++;
      else items.push(n);
    }
    if (items.length > maxItems) throw new ConnectorError("limit_exceeded", `More than ${maxItems} Advisor recommendations returned`);
    url = r.nextLink || null;
  }
  if (url) throw new ConnectorError("limit_exceeded", "Advisor pagination did not terminate");
  // The same recommendation can appear on two pages if the source changes during paging; keep one per source ID.
  const unique = new Map(items.map((i) => [i.sourceKey, i]));
  return { items: [...unique.values()], rejected };
}
