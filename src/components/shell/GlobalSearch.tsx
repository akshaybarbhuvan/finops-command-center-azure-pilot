"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, CornerDownLeft, ListChecks, Search, Server, Ticket, User as UserIcon } from "lucide-react";
import { Kbd, cx } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { annual, lookup } from "@/lib/demo/selectors";
import { STAGE_META } from "@/lib/demo/workflow";
import { canAccess } from "@/lib/rbac";
import { money } from "@/lib/format";

interface Result {
  id: string;
  group: "Recommendations" | "Resources" | "Subscriptions" | "Tickets" | "Owners";
  title: string;
  meta: string;
  href: string;
}

const GROUP_ICON = { Recommendations: ListChecks, Resources: Server, Subscriptions: Building2, Tickets: Ticket, Owners: UserIcon };

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ds, persona } = useDemo();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const term = q.trim().toLowerCase();
    const L = lookup(ds);
    const out: Result[] = [];
    if (!term) {
      // Helpful defaults: the largest open opportunities.
      return ds.recommendations
        .filter((r) => STAGE_META[r.stage].open)
        .sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings)
        .slice(0, 6)
        .map((r) => ({ id: r.id, group: "Recommendations" as const, title: `${r.id} · ${r.title}`, meta: `${money(annual(r))}/yr · ${STAGE_META[r.stage].label}`, href: `/recommendations/${r.id}` }));
    }
    const has = (...xs: (string | undefined | null)[]) => xs.some((x) => x?.toLowerCase().includes(term));
    out.push(
      ...ds.recommendations
        .filter((r) => has(r.id, r.title, L.resource(r.resourceId)?.name, r.type))
        .slice(0, 6)
        .map((r) => ({ id: r.id, group: "Recommendations" as const, title: `${r.id} · ${r.title}`, meta: `${money(annual(r))}/yr · ${STAGE_META[r.stage].label} · ${L.userName(r.ownerId)}`, href: `/recommendations/${r.id}` })),
    );
    out.push(
      ...ds.resources
        .filter((r) => has(r.name, r.resourceGroup, r.sku))
        .slice(0, 5)
        .map((r) => ({ id: r.id, group: "Resources" as const, title: r.name, meta: `${r.type} · ${L.subName(r.subscriptionId)} · ${money(r.monthlyCost)}/mo`, href: `/resources?q=${encodeURIComponent(r.name)}` })),
    );
    out.push(
      ...ds.subscriptions
        .filter((s) => has(s.name, s.subscriptionGuid, L.buName(s.businessUnitId)))
        .slice(0, 4)
        .map((s) => ({ id: s.id, group: "Subscriptions" as const, title: s.name, meta: `${L.buName(s.businessUnitId)} · ${s.environment}`, href: `/resources?sub=${s.id}` })),
    );
    out.push(
      ...ds.tickets
        .filter((t) => has(t.id, t.title, t.recommendationId))
        .slice(0, 4)
        .map((t) => ({ id: t.id, group: "Tickets" as const, title: `${t.id} · ${t.title.replace("[FinOps] ", "")}`, meta: `${t.status} · ${L.userName(t.assigneeId)}`, href: `/tickets?id=${t.id}` })),
    );
    out.push(
      ...ds.users
        .filter((u) => u.id !== "u-system" && has(u.name, u.title))
        .slice(0, 4)
        .map((u) => ({ id: u.id, group: "Owners" as const, title: u.name, meta: `${u.title} · ${L.teamName(u.teamId)}`, href: `/recommendations?owner=${u.id}` })),
    );
    return out.filter((r) => canAccess(persona, r.href.split("?")[0]));
  }, [q, ds, persona]);

  useEffect(() => setActive(0), [q]);

  if (!open) return null;
  const go = (r: Result | undefined) => {
    if (!r) return;
    onClose();
    router.push(r.href);
  };
  const groups = [...new Set(results.map((r) => r.group))];

  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Global search" className="relative w-full max-w-2xl animate-scale-in overflow-hidden rounded-2xl border border-line bg-white shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-5 w-5 text-slate-400" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(results[active]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Search recommendations, resources, subscriptions, tickets, owners…"
            aria-label="Search"
            aria-controls="search-results"
            aria-activedescendant={results[active] ? `sr-${results[active].group}-${results[active].id}` : undefined}
            className="h-14 flex-1 bg-transparent text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div id="search-results" role="listbox" className="max-h-[52vh] overflow-y-auto p-2 scrollbar-thin">
          {!q && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Largest open opportunities</div>}
          {results.length === 0 && <div className="px-3 py-10 text-center text-sm text-slate-500">No matches for “{q}”. Try a recommendation ID, a resource name, or an owner.</div>}
          {groups.map((g) => {
            const Icon = GROUP_ICON[g];
            return (
              <div key={g} className="mb-1">
                {q && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g}</div>}
                {results
                  .filter((r) => r.group === g)
                  .map((r) => {
                    const idx = results.indexOf(r);
                    return (
                      <button
                        key={`${g}-${r.id}`}
                        id={`sr-${g}-${r.id}`}
                        role="option"
                        aria-selected={idx === active}
                        type="button"
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => go(r)}
                        className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left", idx === active ? "bg-brand-50" : "hover:bg-slate-50")}
                      >
                        <Icon className={cx("h-4 w-4 shrink-0", idx === active ? "text-brand-500" : "text-slate-400")} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium text-slate-900">{r.title}</span>
                          <span className="block truncate text-xs text-slate-500">{r.meta}</span>
                        </span>
                        {idx === active && <CornerDownLeft className="h-3.5 w-3.5 text-slate-400" aria-hidden />}
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-line bg-slate-50/70 px-4 py-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="ml-auto">Searches demo data in this browser</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
