"use client";
// Searchable multi-select popover. Keyboard: Enter/Space toggles, Escape closes and returns focus.
import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cx } from "./primitives";

export interface MultiSelectOption {
  value: string;
  label: string;
  count?: number;
}

export function MultiSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Any",
}: {
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = useMemo(() => new Set(value), [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const toggle = (v: string) => onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  const summary =
    value.length === 0 ? placeholder : value.length === 1 ? (options.find((o) => o.value === value[0])?.label ?? value[0]) : `${value.length} selected`;

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <span id={`${id}-label`} className="mb-1 block text-[11px] font-medium text-slate-500">
        {label}
      </span>
      <button
        ref={button}
        type="button"
        className={cx("input flex h-9 items-center justify-between gap-2 text-left", value.length > 0 && "border-brand-300 bg-brand-50/40")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => setOpen((v) => !v)}
      >
        <span id={`${id}-value`} className={cx("truncate", value.length === 0 && "text-slate-400")}>
          {summary}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[220px] rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {options.length > 6 && (
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}`} aria-label={`Search ${label}`} className="input h-8 pl-7 text-xs" />
            </div>
          )}
          <ul id={`${id}-list`} role="listbox" aria-multiselectable="true" aria-label={label} className="max-h-60 overflow-auto">
            {shown.length === 0 && <li className="px-2 py-1.5 text-xs text-slate-500">No matches</li>}
            {shown.map((o) => {
              const on = selected.has(o.value);
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={on}
                  tabIndex={0}
                  onClick={() => toggle(o.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(o.value);
                    }
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 focus:bg-brand-50 focus:outline-none"
                >
                  <span className={cx("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300")} aria-hidden>
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.count !== undefined && <span className="text-xs tabular-nums text-slate-400">{o.count}</span>}
                </li>
              );
            })}
          </ul>
          {value.length > 0 && (
            <button type="button" className="mt-2 w-full rounded px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50" onClick={() => onChange([])}>
              Clear {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
