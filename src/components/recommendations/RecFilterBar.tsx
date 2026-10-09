"use client";
// Recommendation filter bar: global search, searchable multi-selects, savings and date ranges, chips, clear-all and result count.
// Options come from the role-scoped dataset, so a user can never filter toward records outside their authorization.
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Select, cx } from "@/components/ui/primitives";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { useDemo } from "@/lib/demo/store";
import {
  activeFilterCount,
  EMPTY_FILTERS,
  FILTER_LABEL,
  filterChips,
  filterOptions,
  joinValues,
  removeChip,
  splitValues,
  type MultiKey,
  type RecFilters,
} from "@/lib/demo/filters";

const CREATED_OPTIONS = [
  { v: "", l: "Any time" },
  { v: "30", l: "Last 30 days" },
  { v: "90", l: "Last 90 days" },
  { v: "180", l: "Last 180 days" },
];

const GROUPS: { title: string; keys: MultiKey[] }[] = [
  { title: "Workflow", keys: ["stage", "sla", "priority", "category", "owner", "team"] },
  { title: "Organization", keys: ["product", "service", "businessUnit", "costCenter"] },
  { title: "Azure scope", keys: ["subscription", "resourceGroup", "environment", "resourceType"] },
];

export function RecFilterBar({
  value,
  onChange,
  compact,
  resultCount,
  totalCount,
}: {
  value: RecFilters;
  onChange: (f: RecFilters) => void;
  compact?: boolean;
  resultCount?: number;
  totalCount?: number;
}) {
  const { ds } = useDemo();
  const [expanded, setExpanded] = useState(!compact);
  const options = useMemo(() => filterOptions(ds), [ds]);
  const chips = useMemo(() => filterChips(ds, value), [ds, value]);
  const count = activeFilterCount(value);
  const setText = (k: keyof RecFilters) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const setMulti = (k: MultiKey) => (vs: string[]) => onChange({ ...value, [k]: joinValues(vs) });
  const numInput = (k: keyof RecFilters, placeholder: string) => (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      step={100}
      value={value[k]}
      onChange={setText(k)}
      placeholder={placeholder}
      aria-label={FILTER_LABEL[k]}
      className="input h-9 min-w-0 tabular-nums"
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <label htmlFor="rec-search" className="sr-only">
            Search recommendations
          </label>
          <input id="rec-search" type="search" value={value.q} onChange={setText("q")} placeholder="Search ID, title, resource, service, owner or ticket" className="input pl-9" />
        </div>
        <Button variant={expanded ? "subtle" : "secondary"} icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />} onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} aria-controls="rec-filter-panel">
          Filters{count ? ` · ${count}` : ""}
        </Button>
        {(count > 0 || value.q) && (
          <Button variant="ghost" icon={<X className="h-4 w-4" aria-hidden />} onClick={() => onChange(EMPTY_FILTERS)}>
            Clear all
          </Button>
        )}
        {resultCount !== undefined && (
          <span className="ml-auto text-xs text-slate-500" role="status" aria-live="polite">
            <span className="font-semibold tabular-nums text-slate-800">{resultCount.toLocaleString("en-US")}</span>
            {totalCount !== undefined ? ` of ${totalCount.toLocaleString("en-US")}` : ""} recommendations
          </span>
        )}
      </div>

      {expanded && (
        <div id="rec-filter-panel" className="animate-fade-up space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          {GROUPS.map((g) => (
            <fieldset key={g.title}>
              <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.title}</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                {g.keys.map((k) => (
                  <MultiSelect key={k} label={FILTER_LABEL[k]} options={options[k]} value={splitValues(value[k])} onChange={setMulti(k)} />
                ))}
              </div>
            </fieldset>
          ))}
          <fieldset>
            <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Savings and dates</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-500">Monthly savings (USD)</span>
                <div className="flex items-center gap-1.5">
                  {numInput("minMonthly", "Min")}
                  <span className="text-slate-400" aria-hidden>
                    –
                  </span>
                  {numInput("maxMonthly", "Max")}
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-500">Annual savings (USD)</span>
                <div className="flex items-center gap-1.5">
                  {numInput("minSavings", "Min")}
                  <span className="text-slate-400" aria-hidden>
                    –
                  </span>
                  {numInput("maxSavings", "Max")}
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-500">Created between</span>
                <div className="flex items-center gap-1.5">
                  <input type="date" value={value.from} onChange={setText("from")} aria-label={FILTER_LABEL.from} className="input h-9 min-w-0" />
                  <span className="text-slate-400" aria-hidden>
                    –
                  </span>
                  <input type="date" value={value.to} onChange={setText("to")} aria-label={FILTER_LABEL.to} className="input h-9 min-w-0" />
                </div>
              </div>
              <Select label="Created within" value={value.created} onChange={setText("created")}>
                {CREATED_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </Select>
            </div>
          </fieldset>
        </div>
      )}

      {chips.length > 0 && (
        <ul className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {chips.map((c) => (
            <li key={`${c.key}:${c.value}`}>
              <button
                type="button"
                onClick={() => onChange(removeChip(value, c))}
                className={cx("inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500")}
                aria-label={`Remove filter ${c.label}`}
              >
                {c.label}
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
