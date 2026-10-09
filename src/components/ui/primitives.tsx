"use client";
import clsx from "clsx";
import Link from "next/link";
import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

export const cx = clsx;

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type ButtonSize = "sm" | "md" | "lg";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2";
const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand-500 text-white shadow-sm hover:bg-brand-600 active:bg-brand-700",
  secondary: "border border-line bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
  subtle: "bg-brand-50 text-brand-700 hover:bg-brand-100",
};
const BTN_SIZE: Record<ButtonSize, string> = { sm: "h-8 px-3 text-xs", md: "h-9 px-3.5 text-sm", lg: "h-11 px-5 text-sm" };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ href, variant = "secondary", size = "md", icon, children, className }: { href: string; variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)}>
      {icon}
      {children}
    </Link>
  );
}

export function Card({ className, children, as: As = "section", ...rest }: { className?: string; children: ReactNode; as?: "section" | "div" | "article"; "aria-label"?: string }) {
  return (
    <As className={cx("card", className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start justify-between gap-4 px-5 pt-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "violet" | "dark";
const TONE: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-100",
  info: "bg-sky-50 text-sky-700 ring-sky-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
  dark: "bg-slate-800 text-white ring-slate-700",
};

export function Badge({ tone = "neutral", children, className, dot, title }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset", TONE[tone], className)}>
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton", className)} />;
}

export function Avatar({ initials, size = "md", tone = "brand" }: { initials: string; size?: "sm" | "md" | "lg"; tone?: "brand" | "slate" | "dark" }) {
  const s = size === "sm" ? "h-6 w-6 text-[10px]" : size === "lg" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs";
  const t = tone === "brand" ? "bg-gradient-to-br from-brand-400 to-brand-600 text-white" : tone === "dark" ? "bg-ink-700 text-white" : "bg-slate-200 text-slate-700";
  return (
    <span aria-hidden className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", s, t)}>
      {initials}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-slate-50 px-1 font-mono text-[10px] font-medium text-slate-500">{children}</kbd>;
}

export function Progress({ value, tone = "brand", className, label }: { value: number; tone?: "brand" | "success" | "warning" | "danger" | "slate"; className?: string; label?: string }) {
  const c = { brand: "bg-brand-500", success: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-rose-500", slate: "bg-slate-400" }[tone];
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} className={cx("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div className={cx("h-full rounded-full transition-[width] duration-700 ease-out", c)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Select({ label, className, children, hideLabel, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hideLabel?: boolean }) {
  const id = useId();
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className={cx("text-[11px] font-medium text-slate-500", hideLabel && "sr-only")}>
        {label}
      </label>
      <select id={id} className="input h-9 cursor-pointer appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8" {...rest}>
        {children}
      </select>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className, size = "md" }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string; size?: "sm" | "md" }) {
  return (
    <div role="tablist" className={cx("flex items-center gap-1 overflow-x-auto border-b border-line scrollbar-thin", className)}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cx(
              "relative -mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 font-medium transition-colors",
              size === "sm" ? "py-2 text-xs" : "py-2.5 text-sm",
              active ? "border-brand-500 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cx("rounded-full px-1.5 text-[10.5px] font-semibold num", active ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500")}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SegmentedControl<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-slate-50 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          onClick={() => onChange(o.id)}
          className={cx("rounded-md px-2.5 py-1 text-xs font-medium transition", o.id === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight text-slate-900 num">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function KeyValue({ items, cols = 2 }: { items: { label: string; value: ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-3", cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3")}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-[11.5px] text-slate-500">{i.label}</dt>
          <dd className="mt-0.5 truncate text-sm font-medium text-slate-900">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
