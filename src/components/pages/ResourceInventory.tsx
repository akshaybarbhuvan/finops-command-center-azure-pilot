"use client";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, Boxes, CircleDollarSign, Search, Sparkles, X } from "lucide-react";
import { ExportButton, KpiGrid, MetricCard, PageHeader } from "@/components/data/blocks";
import { DataTable } from "@/components/data/DataTable";
import { EnvBadge } from "@/components/data/badges";
import { Badge, Button, Card, Select, type Tone } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { GOVERNANCE_META, lookup, resourceOptimizationStatus } from "@/lib/demo/selectors";
import { money, moneyExact, num, pct } from "@/lib/format";
import type { GovernanceIssue, Resource } from "@/lib/demo/types";

const OPT_TONE: Record<string, Tone> = { Opportunity: "brand", "In delivery": "violet", Optimized: "success", Deferred: "warning", None: "neutral" };

export function ResourceInventory() {
  const { ds } = useDemo();
  const params = useSearchParams();
  const L = lookup(ds);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [sub, setSub] = useState(params.get("sub") ?? "");
  const [category, setCategory] = useState("");
  const [env, setEnv] = useState("");
  const [region, setRegion] = useState("");
  const [issue, setIssue] = useState(params.get("issue") ?? "");
  const [opt, setOpt] = useState("");
  const optStatus = useMemo(() => resourceOptimizationStatus(ds), [ds]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ds.resources.filter((r) => {
      if (t && !`${r.name} ${r.resourceGroup} ${r.sku} ${r.type}`.toLowerCase().includes(t)) return false;
      if (sub && r.subscriptionId !== sub) return false;
      if (category && r.category !== category) return false;
      if (env && r.environment !== env) return false;
      if (region && r.region !== region) return false;
      if (issue === "any" && !r.governanceIssues.length) return false;
      if (issue && issue !== "any" && !r.governanceIssues.includes(issue as GovernanceIssue)) return false;
      if (opt && (optStatus.get(r.id) ?? "None") !== opt) return false;
      return true;
    });
  }, [ds.resources, q, sub, category, env, region, issue, opt, optStatus]);

  const stats = useMemo(
    () => ({
      cost: rows.reduce((a, r) => a + r.monthlyCost, 0),
      issues: rows.filter((r) => r.governanceIssues.length).length,
      opp: rows.filter((r) => optStatus.get(r.id) === "Opportunity" || optStatus.get(r.id) === "In delivery").length,
    }),
    [rows, optStatus],
  );
  const anyFilter = q || sub || category || env || region || issue || opt;
  const regions = [...new Set(ds.resources.map((r) => r.region))];
  const cats = [...new Set(ds.resources.map((r) => r.category))];

  const utilCell = (r: Resource) =>
    r.utilization > 0 ? (
      <div className="flex items-center justify-end gap-2">
        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
          <div className={r.utilization < 15 ? "h-full bg-amber-500" : "h-full bg-brand-500"} style={{ width: `${r.utilization}%` }} />
        </div>
        <span className="w-12 text-right text-xs num">{pct(r.utilization)}</span>
      </div>
    ) : (
      <span className="text-xs text-slate-400">n/a</span>
    );

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "Operate" }, { label: "Resources" }]}
        title="Azure Resource Inventory"
        subtitle="Every resource with its owner, cost, utilization, governance and optimization status. Illustrative inventory — not a live Resource Graph query."
        actions={
          <ExportButton
            rows={rows}
            filename="fcc-resource-inventory.csv"
            columns={[
              { header: "Resource", value: (r) => r.name },
              { header: "Type", value: (r) => r.type },
              { header: "SKU", value: (r) => r.sku },
              { header: "Subscription", value: (r) => L.subName(r.subscriptionId) },
              { header: "Resource group", value: (r) => r.resourceGroup },
              { header: "Region", value: (r) => r.region },
              { header: "Owner", value: (r) => (r.ownerId ? L.userName(r.ownerId) : "") },
              { header: "Cost center", value: (r) => r.costCenter ?? "" },
              { header: "Environment", value: (r) => r.environment },
              { header: "Monthly cost (USD)", value: (r) => r.monthlyCost },
              { header: "Avg utilization %", value: (r) => r.utilization },
              { header: "Governance findings", value: (r) => r.governanceIssues.map((i) => GOVERNANCE_META[i].label).join("; ") },
              { header: "Optimization status", value: (r) => optStatus.get(r.id) ?? "None" },
            ]}
          />
        }
      />
      <KpiGrid cols={4}>
        <MetricCard label="Resources" value={rows.length} format={num} context={anyFilter ? `of ${num(ds.resources.length)} in inventory` : `${ds.subscriptions.length} subscriptions · ${regions.length} regions`} icon={<Boxes className="h-4 w-4" aria-hidden />} />
        <MetricCard label="Monthly cost" value={stats.cost} format={money} context="Current run-rate of selection" icon={<CircleDollarSign className="h-4 w-4" aria-hidden />} accent="violet" />
        <MetricCard label="With governance findings" value={stats.issues} format={num} context={`${pct((stats.issues / Math.max(1, rows.length)) * 100)} of selection`} icon={<AlertTriangle className="h-4 w-4" aria-hidden />} accent="amber" />
        <MetricCard label="With open optimization" value={stats.opp} format={num} context="Opportunity or in delivery" icon={<Sparkles className="h-4 w-4" aria-hidden />} accent="teal" />
      </KpiGrid>
      <Card>
        <div className="grid grid-cols-2 gap-3 px-4 pt-4 md:grid-cols-4 xl:grid-cols-8">
          <div className="col-span-2 flex flex-col gap-1">
            <label htmlFor="res-q" className="text-[11px] font-medium text-slate-500">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input id="res-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, resource group, SKU" className="input pl-9" />
            </div>
          </div>
          <Select label="Subscription" value={sub} onChange={(e) => setSub(e.target.value)}>
            <option value="">All</option>
            {ds.subscriptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select label="Environment" value={env} onChange={(e) => setEnv(e.target.value)}>
            <option value="">All</option>
            {["Production", "Staging", "Development", "Test", "Shared"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">All</option>
            {regions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select label="Governance" value={issue} onChange={(e) => setIssue(e.target.value)}>
            <option value="">Any</option>
            <option value="any">Any finding</option>
            {(Object.keys(GOVERNANCE_META) as GovernanceIssue[])
              .filter((k) => k !== "policy_exception")
              .map((k) => (
                <option key={k} value={k}>
                  {GOVERNANCE_META[k].label}
                </option>
              ))}
          </Select>
          <Select label="Optimization" value={opt} onChange={(e) => setOpt(e.target.value)}>
            <option value="">Any</option>
            {["Opportunity", "In delivery", "Optimized", "Deferred", "None"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        {anyFilter && (
          <div className="px-4 pt-3">
            <Button
              size="sm"
              variant="ghost"
              icon={<X className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => {
                setQ("");
                setSub("");
                setCategory("");
                setEnv("");
                setRegion("");
                setIssue("");
                setOpt("");
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
        <div className="mt-3">
          <DataTable
            caption="Resource inventory"
            rows={rows}
            rowKey={(r) => r.id}
            pageSize={25}
            dense
            initialSort={{ id: "cost", dir: "desc" }}
            columns={[
              { id: "name", header: "Resource", minWidth: 240, sortValue: (r) => r.name, cell: (r) => <div><div className="font-medium text-slate-900">{r.name}</div><div className="text-[11px] text-slate-500">{r.sku}</div></div> },
              { id: "type", header: "Type", hideable: true, sortValue: (r) => r.type, cell: (r) => <span className="whitespace-nowrap">{r.type}</span> },
              { id: "sub", header: "Subscription", hideable: true, sortValue: (r) => L.subName(r.subscriptionId), cell: (r) => L.subName(r.subscriptionId) },
              { id: "rg", header: "Resource group", hideable: true, defaultHidden: true, sortValue: (r) => r.resourceGroup, cell: (r) => <span className="text-xs">{r.resourceGroup}</span> },
              { id: "region", header: "Region", hideable: true, sortValue: (r) => r.region, cell: (r) => <span className="whitespace-nowrap">{r.region}</span> },
              { id: "owner", header: "Owner", hideable: true, sortValue: (r) => L.userName(r.ownerId), cell: (r) => (r.ownerId ? <span className="whitespace-nowrap">{L.userName(r.ownerId)}</span> : <Badge tone="warning">Missing</Badge>) },
              { id: "env", header: "Environment", hideable: true, sortValue: (r) => r.environment, cell: (r) => <EnvBadge env={r.environment} /> },
              { id: "cost", header: "Cost / mo", align: "right", sortValue: (r) => r.monthlyCost, cell: (r) => (r.state === "Decommissioned" ? <span className="text-xs text-slate-400">Decommissioned</span> : moneyExact(r.monthlyCost)) },
              { id: "util", header: "Utilization", align: "right", hideable: true, sortValue: (r) => r.utilization, cell: utilCell },
              {
                id: "gov",
                header: "Governance",
                hideable: true,
                sortValue: (r) => r.governanceIssues.length,
                cell: (r) =>
                  r.governanceIssues.length ? (
                    <Badge tone="warning" title={r.governanceIssues.map((i) => GOVERNANCE_META[i].label).join(", ")}>
                      {r.governanceIssues.length === 1 ? GOVERNANCE_META[r.governanceIssues[0]].label : `${r.governanceIssues.length} findings`}
                    </Badge>
                  ) : (
                    <Badge tone="success">Compliant</Badge>
                  ),
              },
              { id: "opt", header: "Optimization", hideable: true, sortValue: (r) => optStatus.get(r.id) ?? "None", cell: (r) => { const s = optStatus.get(r.id) ?? "None"; return s === "None" ? <span className="text-xs text-slate-400">—</span> : <Badge tone={OPT_TONE[s]}>{s}</Badge>; } },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}
