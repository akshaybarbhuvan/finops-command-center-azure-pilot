"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight, Download, Inbox, Lightbulb, Minus } from "lucide-react";
import { Button, Card, CardHeader, cx } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/overlay";
import { downloadCsv, type CsvColumn } from "@/lib/csv";
import type { Insight } from "@/lib/demo/insights";

// ---------------------------------------------------------------------------
// Animated number
// ---------------------------------------------------------------------------
export function useCountUp(value: number, duration = 750) {
  const [display, setDisplay] = useState(value);
  const from = useRef<number | null>(null);
  useEffect(() => {
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = from.current ?? value * 0.6;
    from.current = value;
    if (reduced || start === value) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + (value - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

export function AnimatedValue({ value, format }: { value: number; format: (n: number) => string }) {
  const v = useCountUp(value);
  return (
    <>
      <span aria-hidden>{format(v)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------
export type DeltaTone = "favorable" | "unfavorable" | "neutral";

export interface MetricCardProps {
  label: string;
  value: number;
  format: (n: number) => string;
  context: ReactNode;
  delta?: { text: string; direction: "up" | "down" | "flat"; tone: DeltaTone };
  href?: string;
  icon?: ReactNode;
  accent?: "brand" | "teal" | "amber" | "violet" | "slate" | "rose";
  footnote?: ReactNode;
  large?: boolean;
}

const ACCENT: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  brand: "from-brand-500/10 text-brand-600",
  teal: "from-accent-500/10 text-accent-600",
  amber: "from-amber-500/10 text-amber-600",
  violet: "from-violet-500/10 text-violet-600",
  slate: "from-slate-500/10 text-slate-600",
  rose: "from-rose-500/10 text-rose-600",
};

export function MetricCard({ label, value, format, context, delta, href, icon, accent = "brand", footnote, large }: MetricCardProps) {
  const DeltaIcon = delta?.direction === "up" ? ArrowUpRight : delta?.direction === "down" ? ArrowDownRight : Minus;
  const deltaClass = delta?.tone === "favorable" ? "text-emerald-700 bg-emerald-50" : delta?.tone === "unfavorable" ? "text-rose-700 bg-rose-50" : "text-slate-600 bg-slate-100";
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="eyebrow">{label}</div>
        {icon && <span className={cx("flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br to-transparent", ACCENT[accent])}>{icon}</span>}
      </div>
      <div className={cx("mt-2 font-semibold tracking-tight text-slate-900 num", large ? "text-[36px] leading-10" : "text-[28px] leading-8")}>
        <AnimatedValue value={value} format={format} />
      </div>
      <div className="mt-1.5 text-xs text-slate-500">{context}</div>
      {(delta || footnote || href) && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          {delta ? (
            <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium num", deltaClass)}>
              <DeltaIcon className="h-3 w-3" aria-hidden />
              {delta.text}
              <span className="sr-only">({delta.tone === "favorable" ? "favorable" : delta.tone === "unfavorable" ? "unfavorable" : "neutral"})</span>
            </span>
          ) : (
            <span className="text-[11.5px] text-slate-500">{footnote}</span>
          )}
          {href && <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" aria-hidden />}
        </div>
      )}
      {delta && footnote && <div className="mt-1.5 text-[11.5px] text-slate-500">{footnote}</div>}
    </>
  );
  const cls = "group card block p-4 transition-all duration-200";
  return href ? (
    <Link href={href} className={cx(cls, "hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift")} aria-label={`${label}: ${format(value)}. Open details`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function KpiGrid({ children, cols = 6 }: { children: ReactNode; cols?: 3 | 4 | 5 | 6 }) {
  const c = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-3 2xl:grid-cols-6" }[cols];
  return <div className={cx("grid grid-cols-1 gap-3 sm:grid-cols-2", c)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Page header with breadcrumbs
// ---------------------------------------------------------------------------
export function PageHeader({ title, subtitle, crumbs, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; crumbs?: { label: string; href?: string }[]; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {crumbs && (
          <nav aria-label="Breadcrumb" className="mb-1.5">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
              {crumbs.map((c, i) => (
                <li key={c.label} className="flex items-center gap-1">
                  {c.href ? (
                    <Link href={c.href} className="hover:text-slate-800">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-slate-700">
                      {c.label}
                    </span>
                  )}
                  {i < crumbs.length - 1 && <ChevronRight className="h-3 w-3 text-slate-300" aria-hidden />}
                </li>
              ))}
            </ol>
          </nav>
        )}
        {eyebrow && <div className="mb-1">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900 md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Executive insight panel ("so what")
// ---------------------------------------------------------------------------
export function InsightPanel({ insights, title = "What leadership should know", compact }: { insights: Insight[]; title?: string; compact?: boolean }) {
  return (
    <Card className="overflow-hidden" aria-label={title}>
      <div className="flex items-center gap-2 border-b border-line bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-3">
        <Lightbulb className="h-4 w-4 text-brand-500" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <span className="ml-auto text-[11px] text-slate-400">Computed from current demo data</span>
      </div>
      <ul className={cx("grid divide-y divide-line md:divide-y-0", compact ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3")}>
        {insights.map((i) => (
          <li key={i.id} className="flex gap-3 p-4 md:border-b md:border-r md:border-line">
            <span aria-hidden className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", i.tone === "attention" ? "bg-amber-500" : i.tone === "positive" ? "bg-emerald-500" : "bg-brand-500")} />
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium leading-snug text-slate-900">{i.headline}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{i.detail}</p>
              {i.href && i.action && (
                <Link href={i.href} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                  {i.action}
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty and error states
// ---------------------------------------------------------------------------
export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">{icon ?? <Inbox className="h-5 w-5" aria-hidden />}</div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {body && <p className="mt-1 max-w-sm text-xs text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart card
// ---------------------------------------------------------------------------
export function ChartCard({ title, subtitle, action, children, footer, className, summary }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string; summary?: string }) {
  return (
    <Card className={cx("flex flex-col", className)}>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      <figure className="flex-1 px-3 pb-3 pt-2" aria-label={typeof title === "string" ? title : undefined}>
        {children}
        {summary && <figcaption className="sr-only">{summary}</figcaption>}
      </figure>
      {footer && <div className="border-t border-line px-5 py-2.5 text-xs text-slate-500">{footer}</div>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
export function ExportButton<T>({ rows, columns, filename, label = "Export CSV", size = "md" }: { rows: T[]; columns: CsvColumn<T>[]; filename: string; label?: string; size?: "sm" | "md" }) {
  const toast = useToast();
  return (
    <Button
      size={size}
      icon={<Download className="h-4 w-4" aria-hidden />}
      onClick={() => {
        downloadCsv(rows, columns, filename);
        toast({ kind: "success", title: "Export ready", body: `${rows.length.toLocaleString("en-US")} rows exported to ${filename}` });
      }}
      disabled={!rows.length}
      title={rows.length ? undefined : "Nothing to export for the current filters"}
    >
      {label}
    </Button>
  );
}
