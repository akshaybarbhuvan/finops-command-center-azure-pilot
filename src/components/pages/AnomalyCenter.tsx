"use client";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, BellRing, CheckCircle2, Search as SearchIcon } from "lucide-react";
import { C } from "@/components/charts/charts";
import { ExportButton, KpiGrid, MetricCard, PageHeader } from "@/components/data/blocks";
import { DataTable } from "@/components/data/DataTable";
import { AnomalyStatusBadge } from "@/components/data/badges";
import { Drawer, useToast } from "@/components/ui/overlay";
import { Badge, Button, Card, KeyValue, SegmentedControl } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { anomalyImpact, anomalySummary, lookup } from "@/lib/demo/selectors";
import { date, money, moneyExact, num, pct } from "@/lib/format";
import type { Anomaly, AnomalyStatus } from "@/lib/demo/types";

export function AnomalyCenter() {
  const { ds } = useDemo();
  const L = lookup(ds);
  const [status, setStatus] = useState<"all" | AnomalyStatus>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const s = anomalySummary(ds);
  const rows = useMemo(() => ds.anomalies.filter((a) => status === "all" || a.status === status), [ds.anomalies, status]);
  const sel = selected ? ds.anomalies.find((a) => a.id === selected) : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "Inform" }, { label: "Anomalies" }]}
        title="Anomaly Center"
        subtitle="Unexpected spend deviations against a trailing daily baseline, with owners and triage status. Demo records — not a live Azure anomaly feed."
        actions={
          <ExportButton
            rows={rows}
            filename="fcc-anomalies.csv"
            columns={[
              { header: "ID", value: (a) => a.id },
              { header: "Date", value: (a) => a.date },
              { header: "Service", value: (a) => a.service },
              { header: "Subscription", value: (a) => L.subName(a.subscriptionId) },
              { header: "Baseline daily (USD)", value: (a) => a.baselineDaily },
              { header: "Observed daily (USD)", value: (a) => a.observedDaily },
              { header: "Deviation %", value: (a) => anomalyImpact(a).deviationPct.toFixed(1) },
              { header: "Est. impact (USD)", value: (a) => Math.round(anomalyImpact(a).estimatedImpact) },
              { header: "Owner", value: (a) => L.userName(a.ownerId) },
              { header: "Status", value: (a) => a.status },
            ]}
          />
        }
      />
      <KpiGrid cols={4}>
        <MetricCard label="Open anomalies" value={s.open} format={num} context="New, investigating or acknowledged" icon={<Activity className="h-4 w-4" aria-hidden />} accent="amber" />
        <MetricCard label="Needs triage" value={s.new} format={num} context="Status: New" icon={<BellRing className="h-4 w-4" aria-hidden />} accent="rose" />
        <MetricCard label="Est. 30-day impact" value={s.openImpact} format={money} context="If open anomalies persist" icon={<SearchIcon className="h-4 w-4" aria-hidden />} />
        <MetricCard label="Resolved (30 days)" value={s.resolved} format={num} context="Root cause documented" icon={<CheckCircle2 className="h-4 w-4" aria-hidden />} accent="teal" />
      </KpiGrid>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
          <SegmentedControl
            label="Status filter"
            value={status}
            onChange={setStatus}
            options={[
              { id: "all", label: `All (${ds.anomalies.length})` },
              { id: "New", label: "New" },
              { id: "Investigating", label: "Investigating" },
              { id: "Acknowledged", label: "Acknowledged" },
              { id: "Resolved", label: "Resolved" },
            ]}
          />
          <span className="text-xs text-slate-500">Select a row to triage</span>
        </div>
        <DataTable
          caption="Spend anomalies"
          rows={rows}
          rowKey={(a) => a.id}
          onRowClick={(a) => setSelected(a.id)}
          initialSort={{ id: "date", dir: "desc" }}
          columns={[
            { id: "date", header: "Date", sortValue: (a) => a.date, cell: (a) => <span className="whitespace-nowrap">{date(a.date)}</span> },
            { id: "service", header: "Service", sortValue: (a) => a.service, cell: (a) => <div><div className="font-medium text-slate-900">{a.service}</div><div className="text-[11px] text-slate-500">{a.id} · {a.resourceGroup}</div></div> },
            { id: "sub", header: "Subscription", sortValue: (a) => L.subName(a.subscriptionId), cell: (a) => L.subName(a.subscriptionId) },
            { id: "base", header: "Baseline / day", align: "right", sortValue: (a) => a.baselineDaily, cell: (a) => moneyExact(a.baselineDaily) },
            { id: "obs", header: "Observed / day", align: "right", sortValue: (a) => a.observedDaily, cell: (a) => <span className="font-medium text-slate-900">{moneyExact(a.observedDaily)}</span> },
            { id: "dev", header: "Deviation", align: "right", sortValue: (a) => anomalyImpact(a).deviationPct, cell: (a) => <Badge tone={anomalyImpact(a).deviationPct > 100 ? "danger" : "warning"}>+{pct(anomalyImpact(a).deviationPct, 0)}</Badge> },
            { id: "impact", header: "Est. impact", align: "right", sortValue: (a) => anomalyImpact(a).estimatedImpact, cell: (a) => money(anomalyImpact(a).estimatedImpact) },
            { id: "owner", header: "Owner", sortValue: (a) => L.userName(a.ownerId), cell: (a) => <span className="whitespace-nowrap">{L.userName(a.ownerId)}</span> },
            { id: "status", header: "Status", sortValue: (a) => a.status, cell: (a) => <AnomalyStatusBadge status={a.status} /> },
          ]}
        />
      </Card>
      {sel && <AnomalyDrawer a={sel} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AnomalyDrawer({ a, onClose }: { a: Anomaly; onClose: () => void }) {
  const { ds, dispatch, persona } = useDemo();
  const toast = useToast();
  const L = lookup(ds);
  const imp = anomalyImpact(a);
  const days = [-6, -5, -4, -3, -2, -1, 0].map((d) => {
    const wobble = [0.97, 1.02, 0.99, 1.01, 0.98, 1.03, 1][d + 6];
    return { d: d === 0 ? date(a.date).replace(", 2026", "") : `D${d}`, v: d === 0 ? a.observedDaily : a.baselineDaily * wobble, anomaly: d === 0 };
  });
  const set = (status: "Investigating" | "Acknowledged" | "Resolved") => {
    const r = dispatch({ kind: "set_anomaly_status", anomalyId: a.id, status });
    if (r.ok) toast({ kind: "success", title: `${a.id} marked ${status}`, body: `${a.service} · ${L.subName(a.subscriptionId)}` });
  };
  const canAct = persona !== "executive";
  return (
    <Drawer
      open
      onClose={onClose}
      title={`${a.service} spend anomaly`}
      subtitle={
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs">{a.id}</span>
          <AnomalyStatusBadge status={a.status} />
        </span>
      }
      footer={
        canAct ? (
          <>
            {a.status === "New" && <Button onClick={() => set("Investigating")}>Start investigating</Button>}
            {(a.status === "New" || a.status === "Investigating") && <Button onClick={() => set("Acknowledged")}>Acknowledge</Button>}
            {a.status !== "Resolved" && (
              <Button variant="primary" onClick={() => set("Resolved")}>
                Mark resolved
              </Button>
            )}
            {a.status === "Resolved" && <span className="text-xs text-slate-500">Resolved — no further action.</span>}
          </>
        ) : (
          <span className="text-xs text-slate-500">Triage actions are performed by FinOps, Engineering or Administrator roles. Leadership access is read-only.</span>
        )
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-[11px] text-slate-500">Baseline / day</div>
          <div className="text-lg font-semibold num">{moneyExact(a.baselineDaily)}</div>
        </div>
        <div className="rounded-xl bg-rose-50 p-3">
          <div className="text-[11px] text-rose-700">Observed / day</div>
          <div className="text-lg font-semibold num">{moneyExact(a.observedDaily)}</div>
        </div>
        <div className="rounded-xl bg-amber-50 p-3">
          <div className="text-[11px] text-amber-800">Deviation</div>
          <div className="text-lg font-semibold num">+{pct(imp.deviationPct, 0)}</div>
        </div>
      </div>
      <div className="mt-5">
        <div className="eyebrow mb-1">Daily cost vs baseline</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={days} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="d" tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => money(v)} />
            <Tooltip formatter={(v: number) => [moneyExact(v), "Daily cost"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="v" radius={[4, 4, 0, 0]}>
              {days.map((x) => (
                <Cell key={x.d} fill={x.anomaly ? C.rose : C.slate} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[11.5px] text-slate-500">Illustrative series: prior six days shown at baseline with normal variation.</p>
      </div>
      <div className="mt-5">
        <KeyValue
          items={[
            { label: "Subscription", value: L.subName(a.subscriptionId) },
            { label: "Resource group", value: a.resourceGroup },
            { label: "Category", value: a.category },
            { label: "Detected", value: date(a.date) },
            { label: "Owner", value: L.userName(a.ownerId) },
            { label: "Acknowledged by", value: a.acknowledgedBy ? L.userName(a.acknowledgedBy) : "—" },
            { label: a.status === "Resolved" ? "Est. impact (incurred)" : "Est. impact (30 days)", value: moneyExact(imp.estimatedImpact) },
          ]}
        />
      </div>
      <div className="mt-5 rounded-xl border border-line p-4">
        <div className="eyebrow">Root cause</div>
        <p className="mt-1 text-sm text-slate-700">{a.rootCause}</p>
      </div>
    </Drawer>
  );
}
