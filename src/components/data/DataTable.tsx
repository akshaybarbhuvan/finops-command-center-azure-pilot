"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Columns3 } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import { EmptyState } from "./blocks";

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
  hideable?: boolean;
  defaultHidden?: boolean;
  minWidth?: number;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string;
  pageSize?: number;
  initialSort?: { id: string; dir: "asc" | "desc" };
  emptyTitle?: string;
  emptyBody?: ReactNode;
  caption: string;
  toolbar?: ReactNode;
  dense?: boolean;
  maxHeight?: number;
  rowClassName?: (row: T) => string | undefined;
  footer?: ReactNode;
  /** Optional row selection (checkbox column). Keys come from rowKey. */
  selection?: { selected: ReadonlySet<string>; onChange: (next: Set<string>) => void; label?: (row: T) => string };
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  pageSize = 25,
  initialSort,
  emptyTitle = "No records match the current filters",
  emptyBody = "Adjust or clear filters to see more results.",
  caption,
  toolbar,
  dense,
  maxHeight,
  rowClassName,
  footer,
  selection,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.id)));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setPage(0), [rows]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return rows;
    const f = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = f(a);
      const vb = f(b);
      const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const visibleRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const visibleCols = columns.filter((c) => !hidden.has(c.id));
  const hideable = columns.filter((c) => c.hideable);

  const pageKeys = visibleRows.map(rowKey);
  const pageSelected = selection ? pageKeys.filter((k) => selection.selected.has(k)).length : 0;
  const allPageSelected = pageKeys.length > 0 && pageSelected === pageKeys.length;
  const headerBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = pageSelected > 0 && !allPageSelected;
  }, [pageSelected, allPageSelected]);
  const togglePage = () => {
    if (!selection) return;
    const n = new Set(selection.selected);
    for (const k of pageKeys) {
      if (allPageSelected) n.delete(k);
      else n.add(k);
    }
    selection.onChange(n);
  };
  const toggleRow = (k: string) => {
    if (!selection) return;
    const n = new Set(selection.selected);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    selection.onChange(n);
  };

  const toggleSort = (c: Column<T>) => {
    if (!c.sortValue) return;
    setSort((s) => (s?.id === c.id ? { id: c.id, dir: s.dir === "asc" ? "desc" : "asc" } : { id: c.id, dir: typeof c.sortValue!(rows[0] ?? ({} as T)) === "number" ? "desc" : "asc" }));
  };

  return (
    <div className="flex flex-col">
      {(toolbar || hideable.length > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
          {hideable.length > 0 && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="true"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <Columns3 className="h-3.5 w-3.5" aria-hidden /> Columns
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-20 mt-1 w-52 animate-scale-in rounded-xl border border-line bg-white p-1.5 shadow-lift">
                  {hideable.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-brand-500"
                        checked={!hidden.has(c.id)}
                        onChange={() =>
                          setHidden((h) => {
                            const n = new Set(h);
                            if (n.has(c.id)) n.delete(c.id);
                            else n.add(c.id);
                            return n;
                          })
                        }
                      />
                      {c.header}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="overflow-auto scrollbar-thin border-t border-line" style={maxHeight ? { maxHeight } : undefined}>
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
            <tr>
              {selection && (
                <th scope="col" className="w-10 border-b border-line py-2.5 pl-4 pr-0">
                  <input
                    ref={headerBox}
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-brand-500"
                    checked={allPageSelected}
                    onChange={togglePage}
                    disabled={pageKeys.length === 0}
                    aria-label={allPageSelected ? "Clear selection on this page" : "Select all rows on this page"}
                  />
                </th>
              )}
              {visibleCols.map((c) => {
                const active = sort?.id === c.id;
                const SortIcon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                    style={{ minWidth: c.minWidth }}
                    className={cx(
                      "whitespace-nowrap border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500",
                      c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                      c.headerClassName,
                    )}
                  >
                    {c.sortValue ? (
                      <button type="button" onClick={() => toggleSort(c)} className={cx("inline-flex items-center gap-1 uppercase hover:text-slate-800", active && "text-slate-800", c.align === "right" && "flex-row-reverse")}>
                        {c.header}
                        <SortIcon className={cx("h-3 w-3", !active && "opacity-40")} aria-hidden />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                aria-selected={selection ? selection.selected.has(rowKey(row)) : undefined}
                className={cx(
                  "border-b border-slate-100 transition-colors last:border-b-0",
                  onRowClick && "cursor-pointer hover:bg-brand-50/40 focus-visible:bg-brand-50/60",
                  selection?.selected.has(rowKey(row)) && "bg-brand-50/50",
                  rowClassName?.(row),
                )}
              >
                {selection && (
                  <td className="w-10 py-2 pl-4 pr-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-brand-500"
                      checked={selection.selected.has(rowKey(row))}
                      onChange={() => toggleRow(rowKey(row))}
                      aria-label={`Select ${selection.label?.(row) ?? rowKey(row)}`}
                    />
                  </td>
                )}
                {visibleCols.map((c) => (
                  <td key={c.id} className={cx("px-4 text-slate-700", dense ? "py-2" : "py-3", c.align === "right" ? "text-right num" : c.align === "center" ? "text-center" : "text-left", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <EmptyState title={emptyTitle} body={emptyBody} />}
      </div>
      {(rows.length > pageSize || footer) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-slate-500">
          <div>{footer ?? `Showing ${safePage * pageSize + 1}–${Math.min(sorted.length, (safePage + 1) * pageSize)} of ${sorted.length.toLocaleString("en-US")}`}</div>
          {rows.length > pageSize && (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0} className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40" aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="num px-1">
                Page {safePage + 1} of {pages}
              </span>
              <button type="button" onClick={() => setPage(Math.min(pages - 1, safePage + 1))} disabled={safePage >= pages - 1} className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40" aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
