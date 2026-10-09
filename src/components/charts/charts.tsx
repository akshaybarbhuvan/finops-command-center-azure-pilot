"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { cx } from "@/components/ui/primitives";
import { dateShort, money, moneyExact, monthLabel, pct } from "@/lib/format";
import type { TrendPoint } from "@/lib/demo/selectors";

export const C = {
  indigo: "#3461E8",
  indigoSoft: "#A9BEF7",
  teal: "#0EA5A4",
  amber: "#F59E0B",
  violet: "#8B5CF6",
  sky: "#0EA5E9",
  slate: "#94A3B8",
  rose: "#E11D48",
  grid: "#EEF1F6",
  axis: "#64748B",
};

export const ANIM = { animationDuration: 500 } as const;
const axisProps = { tick: { fill: C.axis, fontSize: 11 }, tickLine: false, axisLine: false } as const;

function TooltipBox({ title, rows }: { title: ReactNode; rows: { label: string; value: string; color?: string; dashed?: boolean }[] }) {
  return (
    <div className="min-w-[180px] rounded-lg border border-line bg-white/98 px-3 py-2 text-xs shadow-lift">
      <div className="mb-1.5 font-semibold text-slate-800">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-slate-500">
            {r.color && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: r.color, opacity: r.dashed ? 0.7 : 1 }} />}
            {r.label}
          </span>
          <span className="font-semibold text-slate-900 num">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spend trend: actuals, MTD, forecast and budget
// ---------------------------------------------------------------------------
export function SpendTrendChart({ data, height = 300 }: { data: TrendPoint[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, label: monthLabel(d.month), forecastBar: d.actual === null && d.mtd === null ? d.forecast : null, remaining: d.mtd !== null && d.forecast !== null ? d.forecast - d.mtd : null }));
  const tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as (typeof rows)[number];
    const items = [
      ...(p.actual !== null ? [{ label: "Actual", value: moneyExact(p.actual), color: C.indigo }] : []),
      ...(p.mtd !== null ? [{ label: "Month-to-date", value: moneyExact(p.mtd), color: C.indigo }] : []),
      ...(p.forecast !== null && p.actual === null ? [{ label: "Forecast", value: moneyExact(p.forecast), color: C.amber }] : []),
      { label: "Budget", value: moneyExact(p.budget), color: C.slate },
      ...(p.actual !== null || p.forecast !== null ? [{ label: "Variance to budget", value: `${(p.actual ?? p.forecast ?? 0) > p.budget ? "+" : "-"}${money(Math.abs((p.actual ?? p.forecast ?? 0) - p.budget))}` }] : []),
    ];
    return <TooltipBox title={p.label} rows={items} />;
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} interval={0} fontSize={11} />
        <YAxis {...axisProps} width={56} tickFormatter={(v: number) => money(v)} domain={[0, "auto"]} />
        <Tooltip content={tip} cursor={{ fill: "rgba(52,97,232,0.05)" }} />
        <Legend verticalAlign="top" align="right" height={28} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: C.axis }} />
        <Bar dataKey="actual" {...ANIM} name="Actual" stackId="s" fill={C.indigo} radius={[4, 4, 0, 0]} maxBarSize={34} />
        <Bar dataKey="mtd" {...ANIM} name="Month-to-date" stackId="s" fill={C.indigo} maxBarSize={34} legendType="none" />
        <Bar dataKey="remaining" {...ANIM} name="Forecast (remaining)" stackId="s" fill={C.indigoSoft} fillOpacity={0.55} radius={[4, 4, 0, 0]} maxBarSize={34} legendType="none" />
        <Bar dataKey="forecastBar" {...ANIM} name="Forecast" stackId="s" fill={C.indigoSoft} fillOpacity={0.55} radius={[4, 4, 0, 0]} maxBarSize={34} />
        <Line dataKey="forecast" {...ANIM} name="Forecast trend" stroke={C.amber} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2.5, fill: C.amber }} connectNulls={false} isAnimationActive />
        <Line dataKey="budget" {...ANIM} name="Budget" stroke={C.slate} strokeWidth={1.5} type="stepAfter" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Ranked horizontal bars (categories, subscriptions, business units)
// ---------------------------------------------------------------------------
export function RankedBars({ items, color = C.indigo, format = money, max, emptyLabel = "No data" }: { items: { label: string; value: number; sub?: ReactNode; href?: string; secondary?: number }[]; color?: string; format?: (n: number) => string; max?: number; emptyLabel?: string }) {
  const m = max ?? Math.max(...items.map((i) => i.value), 1);
  if (!items.length) return <p className="px-2 py-6 text-center text-xs text-slate-500">{emptyLabel}</p>;
  return (
    <ul className="space-y-2.5 px-2">
      {items.map((i) => {
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] font-medium text-slate-800">{i.label}</span>
              <span className="shrink-0 text-[13px] font-semibold text-slate-900 num">{format(i.value)}</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="relative h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${(i.value / m) * 100}%`, background: color }}>
                {i.secondary !== undefined && i.value > 0 && <div className="absolute inset-y-0 left-0 rounded-full bg-white/45" style={{ width: `${Math.min(100, (i.secondary / i.value) * 100)}%` }} />}
              </div>
            </div>
            {i.sub && <div className="mt-1 text-[11.5px] text-slate-500">{i.sub}</div>}
          </>
        );
        return (
          <li key={i.label}>
            {i.href ? (
              <Link href={i.href} className="block rounded-lg p-1.5 -m-1.5 transition hover:bg-slate-50">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Savings funnel (cumulative)
// ---------------------------------------------------------------------------
export function SavingsFunnel({ stages }: { stages: { stage: string; value: number; hint: string }[] }) {
  const max = stages[0]?.value || 1;
  const colors = [C.slate, C.sky, C.violet, C.indigo, C.teal];
  return (
    <ol className="space-y-2 px-2">
      {stages.map((s, i) => {
        const conv = i === 0 ? null : (s.value / (stages[i - 1].value || 1)) * 100;
        return (
          <li key={s.stage}>
            <div className="flex items-center gap-3">
              <div className="w-24 shrink-0 text-xs font-medium text-slate-600">{s.stage}</div>
              <div className="relative h-8 flex-1 overflow-hidden rounded-md bg-slate-50">
                <div className="flex h-full items-center gap-2">
                  <div className="flex h-full items-center rounded-md px-2.5 transition-[width] duration-700 ease-out" style={{ width: `${Math.max(3, (s.value / max) * 100)}%`, background: colors[i] }} title={s.hint}>
                    {s.value / max >= 0.22 && <span className="whitespace-nowrap text-xs font-semibold text-white drop-shadow-sm num">{money(s.value)}</span>}
                  </div>
                  {s.value / max < 0.22 && <span className="whitespace-nowrap text-xs font-semibold text-slate-800 num">{money(s.value)}</span>}
                </div>
              </div>
              <div className="w-14 shrink-0 text-right text-[11px] text-slate-500 num">{conv === null ? "100%" : pct(conv, 0)}</div>
            </div>
          </li>
        );
      })}
      <li className="flex justify-between pt-1 text-[11px] text-slate-400">
        <span>Annualized value · cumulative</span>
        <span>Stage conversion</span>
      </li>
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Waterfall
// ---------------------------------------------------------------------------
export function WaterfallChart({ steps, height = 320 }: { steps: { name: string; kind: "total" | "delta"; value: number; base: number; bar: number }[]; height?: number }) {
  const tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as (typeof steps)[number];
    return <TooltipBox title={p.name} rows={[{ label: p.kind === "total" ? "Annualized value" : "Change", value: p.kind === "total" ? moneyExact(p.value) : `-${moneyExact(Math.abs(p.value))}` }]} />;
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={steps} margin={{ top: 16, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="name" {...axisProps} interval={0} height={44} tick={(props) => <WrappedTick {...props} />} />
        <YAxis {...axisProps} width={56} tickFormatter={(v: number) => money(v)} />
        <Tooltip content={tip} cursor={{ fill: "rgba(52,97,232,0.05)" }} />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="bar" stackId="w" radius={[4, 4, 4, 4]} maxBarSize={52} isAnimationActive={false}>
          {steps.map((s, i) => (
            <Cell key={s.name} fill={s.kind === "total" ? (i === 0 ? C.indigo : C.teal) : "#CBD5E1"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function WrappedTick(props: { x?: number; y?: number; payload?: { value: string } }) {
  const { x = 0, y = 0, payload } = props;
  const words = (payload?.value ?? "").split(" ");
  const lines = words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : words;
  return (
    <g transform={`translate(${x},${y + 10})`}>
      {lines.map((l, i) => (
        <text key={i} x={0} y={i * 12} textAnchor="middle" fill={C.axis} fontSize={10.5}>
          {l}
        </text>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Aging / SLA stacked bars
// ---------------------------------------------------------------------------
export function AgingChart({ data, height = 240 }: { data: { bucket: string; onTrack: number; dueSoon: number; breached: number; annual: number }[]; height?: number }) {
  const tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as (typeof data)[number];
    return (
      <TooltipBox
        title={`Open for ${p.bucket}`}
        rows={[
          { label: "On track", value: String(p.onTrack), color: C.teal },
          { label: "Due within 7 days", value: String(p.dueSoon), color: C.amber },
          { label: "Past SLA", value: String(p.breached), color: C.rose },
          { label: "Annualized value", value: money(p.annual) },
        ]}
      />
    );
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="bucket" {...axisProps} interval={0} />
        <YAxis {...axisProps} allowDecimals={false} width={40} />
        <Tooltip content={tip} cursor={{ fill: "rgba(52,97,232,0.05)" }} />
        <Legend verticalAlign="top" align="right" height={26} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: C.axis }} />
        <Bar dataKey="onTrack" {...ANIM} name="On track" stackId="a" fill={C.teal} maxBarSize={48} />
        <Bar dataKey="dueSoon" {...ANIM} name="Due ≤ 7 days" stackId="a" fill={C.amber} maxBarSize={48} />
        <Bar dataKey="breached" {...ANIM} name="Past SLA" stackId="a" fill={C.rose} radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Daily spend vs prior month
// ---------------------------------------------------------------------------
export function DailySpendChart({ data, height = 220 }: { data: { date: string; cost: number; priorMonth: number }[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, label: dateShort(d.date) }));
  const tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as (typeof rows)[number];
    return <TooltipBox title={p.label} rows={[{ label: "Daily spend", value: moneyExact(p.cost), color: C.indigo }, { label: "Same day last month", value: moneyExact(p.priorMonth), color: C.slate }]} />;
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="dailyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.indigo} stopOpacity={0.22} />
            <stop offset="100%" stopColor={C.indigo} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={56} tickFormatter={(v: number) => money(v)} domain={["dataMin - 30000", "dataMax + 20000"]} />
        <Tooltip content={tip} />
        <Area dataKey="cost" {...ANIM} stroke={C.indigo} strokeWidth={2} fill="url(#dailyFill)" dot={{ r: 2.5, fill: C.indigo }} />
        <Area dataKey="priorMonth" {...ANIM} stroke={C.slate} strokeDasharray="4 4" fill="transparent" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Realized savings trend (cumulative annualized)
// ---------------------------------------------------------------------------
export function RealizedTrendChart({ data, height = 260 }: { data: { month: string; added: number; cumulative: number; count: number }[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, label: monthLabel(d.month) }));
  const tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as (typeof rows)[number];
    return (
      <TooltipBox
        title={p.label}
        rows={[
          { label: "Verified this month", value: `${money(p.added)}/yr`, color: C.teal },
          { label: "Cumulative run-rate", value: `${money(p.cumulative)}/yr`, color: C.indigo },
          { label: "Recommendations", value: String(p.count) },
        ]}
      />
    );
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="realFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.indigo} stopOpacity={0.18} />
            <stop offset="100%" stopColor={C.indigo} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={56} tickFormatter={(v: number) => money(v)} />
        <Tooltip content={tip} />
        <Legend verticalAlign="top" align="right" height={26} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: C.axis }} />
        <Bar dataKey="added" {...ANIM} name="Verified in month" fill={C.teal} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Area dataKey="cumulative" {...ANIM} name="Cumulative (annualized)" stroke={C.indigo} strokeWidth={2} fill="url(#realFill)" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Score ring
// ---------------------------------------------------------------------------
export function ScoreRing({ value, size = 132, label, sub }: { value: number; size?: number; label: string; sub?: string }) {
  const r = (size - 14) / 2;
  const circ = 2 * Math.PI * r;
  const color = value >= 85 ? C.teal : value >= 70 ? C.amber : C.rose;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(value)} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#EEF1F6" strokeWidth={10} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={10} fill="none" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - value / 100)} style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.2,.7,.2,1)" }} />
      </svg>
      <div className="absolute text-center">
        <div className="text-3xl font-semibold tracking-tight text-slate-900 num">{Math.round(value)}</div>
        <div className="text-[11px] text-slate-500">{sub ?? "of 100"}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Budget utilization bar with 80 / 90 / 100% thresholds
// ---------------------------------------------------------------------------
export function BudgetBar({ actualPct, forecastPct, className }: { actualPct: number; forecastPct: number; className?: string }) {
  const scale = 120; // show up to 120% of budget
  const f = Math.min(scale, forecastPct);
  const a = Math.min(scale, actualPct);
  const tone = forecastPct >= 100 ? "bg-rose-500" : forecastPct >= 90 ? "bg-amber-500" : forecastPct >= 80 ? "bg-amber-300" : "bg-emerald-500";
  return (
    <div className={cx("relative h-2.5 w-full rounded-full bg-slate-100", className)} role="img" aria-label={`Forecast ${pct(forecastPct, 0)} of budget, actual ${pct(actualPct, 0)}`}>
      <div className={cx("absolute inset-y-0 left-0 rounded-full opacity-35", tone)} style={{ width: `${(f / scale) * 100}%` }} />
      <div className={cx("absolute inset-y-0 left-0 rounded-full", tone)} style={{ width: `${(a / scale) * 100}%` }} />
      {[80, 90, 100].map((t) => (
        <span key={t} aria-hidden className={cx("absolute -top-0.5 h-3.5 w-px", t === 100 ? "bg-slate-700" : "bg-slate-400")} style={{ left: `${(t / scale) * 100}%` }} />
      ))}
    </div>
  );
}

