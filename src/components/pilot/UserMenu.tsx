"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/primitives";

export function UserMenu({ name, email, roles }: { name: string; email: string | null; roles: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button type="button" className="flex items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Avatar initials={initials || "?"} size="sm" tone="slate" />
        <span className="hidden text-xs font-medium text-white sm:block">{name}</span>
        <ChevronDown className="h-3.5 w-3.5 text-white/70" aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-line bg-white p-2 shadow-pop">
          <div className="px-2.5 pb-2 pt-1.5">
            <div className="truncate text-[13px] font-semibold text-slate-900">{name}</div>
            {email && <div className="truncate text-[11.5px] text-slate-500">{email}</div>}
            <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-wider text-brand-600">{roles.join(" · ")}</div>
          </div>
          <div className="mx-2.5 mb-1 rounded-md bg-slate-50 px-2 py-1.5 text-[10.5px] text-slate-500">Signed in with Microsoft Entra ID. Roles come from Entra app-role assignments.</div>
          <a role="menuitem" href="/.auth/logout?post_logout_redirect_uri=/" className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-slate-700 hover:bg-slate-50">
            <LogOut className="h-4 w-4 text-slate-400" aria-hidden />
            Sign out
          </a>
        </div>
      )}
    </div>
  );
}
