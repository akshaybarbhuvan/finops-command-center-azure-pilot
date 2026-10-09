"use client";
// Remembers the last filter query per list page (sessionStorage), so filters survive navigating to a detail page and back.
// Browser-only convenience: values are validated on read and storage failures are ignored.
import { useEffect, useState } from "react";

const KEY = (page: string) => `fcc.filters.v1:${page}`;

export function rememberQuery(page: string, query: string) {
  try {
    if (query && query !== "?") window.sessionStorage.setItem(KEY(page), query.startsWith("?") ? query : `?${query}`);
    else window.sessionStorage.removeItem(KEY(page));
  } catch {
    /* storage unavailable */
  }
}

export function recallQuery(page: string): string {
  try {
    const v = window.sessionStorage.getItem(KEY(page));
    return v && v.startsWith("?") && v.length < 2000 ? v : "";
  } catch {
    return "";
  }
}

/** href for a list page including its remembered filters, e.g. a "Back to recommendations" link. */
export function useReturnHref(page: string): string {
  const [href, setHref] = useState(page);
  useEffect(() => setHref(page + recallQuery(page)), [page]);
  return href;
}
