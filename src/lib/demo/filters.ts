// Shared recommendation filtering used by the FinOps workbench, recommendation center and reports.
// Filters are always applied to an already-authorized (scoped) dataset: authorization first, then filters.
// Multi-value dimensions are encoded comma-separated so they stay plain strings in state and in the URL.
import { AS_OF } from "./org";
import { annual, lookup, PRIORITIES, REC_CATEGORIES, slaStatus } from "./selectors";
import { daysBetween } from "./seed";
import { ALL_STAGES, isOpen, isRealized, STAGE_META } from "./workflow";
import type { Dataset, Recommendation } from "./types";

export interface RecFilters {
  q: string;
  product: string; // application ids
  service: string;
  businessUnit: string;
  costCenter: string;
  subscription: string;
  resourceGroup: string;
  environment: string;
  resourceType: string;
  category: string;
  owner: string; // user ids or "unassigned"
  team: string;
  priority: string;
  stage: string; // Stage values, "open" or "realized"
  sla: string; // "On track" | "Due soon" | "Breached" (shown as Overdue) | "Met" | "Missed"
  from: string; // created on/after (YYYY-MM-DD)
  to: string; // created on/before (YYYY-MM-DD)
  created: string; // days back (legacy shortcut)
  minMonthly: string;
  maxMonthly: string;
  minSavings: string; // annual USD
  maxSavings: string; // annual USD
}

export const EMPTY_FILTERS: RecFilters = {
  q: "",
  product: "",
  service: "",
  businessUnit: "",
  costCenter: "",
  subscription: "",
  resourceGroup: "",
  environment: "",
  resourceType: "",
  category: "",
  owner: "",
  team: "",
  priority: "",
  stage: "",
  sla: "",
  from: "",
  to: "",
  created: "",
  minMonthly: "",
  maxMonthly: "",
  minSavings: "",
  maxSavings: "",
};

export const FILTER_KEYS = Object.keys(EMPTY_FILTERS) as (keyof RecFilters)[];

export const MULTI_KEYS = ["product", "service", "businessUnit", "costCenter", "subscription", "resourceGroup", "environment", "resourceType", "category", "owner", "team", "priority", "stage", "sla"] as const;
export type MultiKey = (typeof MULTI_KEYS)[number];
export const RANGE_KEYS = ["from", "to", "created", "minMonthly", "maxMonthly", "minSavings", "maxSavings"] as const;

export const FILTER_LABEL: Record<keyof RecFilters, string> = {
  q: "Search",
  product: "Product",
  service: "Service",
  businessUnit: "Business unit",
  costCenter: "Cost center",
  subscription: "Subscription",
  resourceGroup: "Resource group",
  environment: "Environment",
  resourceType: "Resource type",
  category: "Category",
  owner: "Owner",
  team: "Team",
  priority: "Priority",
  stage: "Stage / status",
  sla: "SLA",
  from: "Created from",
  to: "Created to",
  created: "Created within",
  minMonthly: "Monthly savings ≥",
  maxMonthly: "Monthly savings ≤",
  minSavings: "Annual savings ≥",
  maxSavings: "Annual savings ≤",
};

export const SLA_OPTIONS = [
  { value: "On track", label: "On track" },
  { value: "Due soon", label: "Due soon" },
  { value: "Breached", label: "Overdue" },
  { value: "Met", label: "Met" },
  { value: "Missed", label: "Missed" },
];

export const splitValues = (v: string): string[] => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
export const joinValues = (vs: string[]): string => [...new Set(vs)].join(",");

export function filtersFromParams(params: URLSearchParams | null | undefined, defaults: Partial<RecFilters> = {}): RecFilters {
  const f: RecFilters = { ...EMPTY_FILTERS, ...defaults };
  if (!params) return f;
  for (const k of FILTER_KEYS) {
    const v = params.get(k);
    if (v !== null) f[k] = v.slice(0, 500);
  }
  return f;
}

export function filtersToQuery(f: RecFilters): string {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) if (f[k]) p.set(k, f[k]);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function activeFilterCount(f: RecFilters) {
  return FILTER_KEYS.filter((k) => k !== "q" && f[k]).length;
}

function num(v: string): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Attribute accessors shared by filtering and option building. */
function attrs(ds: Dataset) {
  const L = lookup(ds);
  return (r: Recommendation) => {
    const res = L.resource(r.resourceId);
    const sub = L.subscription(r.subscriptionId);
    const app = res ? L.application(res.applicationId) : undefined;
    return {
      product: app?.id ?? "",
      service: res?.service ?? "",
      businessUnit: sub?.businessUnitId ?? "",
      costCenter: res?.costCenter ?? sub?.costCenter ?? "",
      subscription: r.subscriptionId,
      resourceGroup: res?.resourceGroup ?? "",
      environment: sub?.environment ?? "",
      resourceType: res?.type ?? "",
      category: r.category,
      owner: r.ownerId ?? "unassigned",
      team: r.teamId,
      priority: r.priority,
      sla: slaStatus(r).status as string,
      res,
    };
  };
}

function stageMatches(r: Recommendation, values: string[]) {
  return values.some((v) => (v === "open" ? isOpen(r.stage) : v === "realized" ? isRealized(r.stage) : r.stage === v));
}

export function applyRecFilters(ds: Dataset, recs: Recommendation[], f: RecFilters): Recommendation[] {
  const L = lookup(ds);
  const get = attrs(ds);
  const q = f.q.trim().toLowerCase();
  const multi = MULTI_KEYS.filter((k) => k !== "stage").map((k) => [k, new Set(splitValues(f[k]))] as const).filter(([, s]) => s.size > 0);
  const stages = splitValues(f.stage);
  const minM = num(f.minMonthly);
  const maxM = num(f.maxMonthly);
  const minA = num(f.minSavings);
  const maxA = num(f.maxSavings);
  const created = num(f.created);
  return recs.filter((r) => {
    const a = get(r);
    if (q) {
      const hay = `${r.id} ${r.title} ${a.res?.name ?? ""} ${r.type} ${L.userName(r.ownerId)} ${r.ticketId ?? ""} ${a.service} ${a.resourceGroup}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    for (const [k, set] of multi) if (!set.has(a[k])) return false;
    if (stages.length && !stageMatches(r, stages)) return false;
    if (minM !== null && r.estimatedMonthlySavings < minM) return false;
    if (maxM !== null && r.estimatedMonthlySavings > maxM) return false;
    if (minA !== null && annual(r) < minA) return false;
    if (maxA !== null && annual(r) > maxA) return false;
    if (f.from && r.createdDate < f.from) return false;
    if (f.to && r.createdDate > f.to) return false;
    if (created !== null && daysBetween(r.createdDate, AS_OF) > created) return false;
    return true;
  });
}

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

/** Options per multi-value dimension, built from the records the user is authorized to see. */
export function filterOptions(ds: Dataset, recs: Recommendation[] = ds.recommendations): Record<MultiKey, FilterOption[]> {
  const L = lookup(ds);
  const get = attrs(ds);
  const counts = Object.fromEntries(MULTI_KEYS.map((k) => [k, new Map<string, number>()])) as Record<MultiKey, Map<string, number>>;
  for (const r of recs) {
    const a = get(r);
    for (const k of MULTI_KEYS) {
      if (k === "stage") continue;
      const v = a[k];
      if (v) counts[k].set(v, (counts[k].get(v) ?? 0) + 1);
    }
    counts.stage.set(r.stage, (counts.stage.get(r.stage) ?? 0) + 1);
  }
  const label = (k: MultiKey, v: string): string => {
    switch (k) {
      case "product":
        return L.application(v)?.name ?? v;
      case "businessUnit":
        return L.buName(v);
      case "subscription":
        return L.subName(v);
      case "owner":
        return v === "unassigned" ? "Unassigned" : L.userName(v);
      case "team":
        return L.teamName(v);
      case "sla":
        return SLA_OPTIONS.find((o) => o.value === v)?.label ?? v;
      default:
        return v;
    }
  };
  const ORDER: Partial<Record<MultiKey, string[]>> = { category: REC_CATEGORIES, priority: PRIORITIES, sla: SLA_OPTIONS.map((o) => o.value) };
  const out = {} as Record<MultiKey, FilterOption[]>;
  for (const k of MULTI_KEYS) {
    if (k === "stage") continue;
    const opts = [...counts[k]].map(([value, count]) => ({ value, label: label(k, value), count }));
    const order = ORDER[k];
    out[k] = order ? opts.sort((x, y) => order.indexOf(x.value) - order.indexOf(y.value)) : opts.sort((x, y) => x.label.localeCompare(y.label));
  }
  const open = recs.filter((r) => isOpen(r.stage)).length;
  const realized = recs.filter((r) => isRealized(r.stage)).length;
  out.stage = [
    { value: "open", label: "All open", count: open },
    { value: "realized", label: "Realized (verified + closed)", count: realized },
    ...ALL_STAGES.map((s) => ({ value: s as string, label: STAGE_META[s].label, count: counts.stage.get(s) ?? 0 })),
  ];
  return out;
}

export interface FilterChip {
  key: keyof RecFilters;
  value: string; // for multi keys the single value; otherwise the whole field value
  label: string;
}

const RANGE_FORMAT: Partial<Record<keyof RecFilters, (v: string) => string>> = {
  created: (v) => `last ${v} days`,
  minMonthly: (v) => `$${Number(v).toLocaleString("en-US")}/mo`,
  maxMonthly: (v) => `$${Number(v).toLocaleString("en-US")}/mo`,
  minSavings: (v) => `$${Number(v).toLocaleString("en-US")}/yr`,
  maxSavings: (v) => `$${Number(v).toLocaleString("en-US")}/yr`,
};

export function filterChips(ds: Dataset, f: RecFilters): FilterChip[] {
  const opts = filterOptions(ds);
  const chips: FilterChip[] = [];
  for (const k of MULTI_KEYS)
    for (const v of splitValues(f[k])) chips.push({ key: k, value: v, label: `${FILTER_LABEL[k]}: ${opts[k].find((o) => o.value === v)?.label ?? v}` });
  for (const k of RANGE_KEYS) if (f[k]) chips.push({ key: k, value: f[k], label: `${FILTER_LABEL[k]} ${RANGE_FORMAT[k]?.(f[k]) ?? f[k]}` });
  return chips;
}

export function removeChip(f: RecFilters, chip: FilterChip): RecFilters {
  if ((MULTI_KEYS as readonly string[]).includes(chip.key)) return { ...f, [chip.key]: joinValues(splitValues(f[chip.key]).filter((v) => v !== chip.value)) };
  return { ...f, [chip.key]: "" };
}
