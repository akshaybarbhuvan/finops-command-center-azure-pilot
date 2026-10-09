import Link from "next/link";
import type { ReactNode } from "react";
import { can, type Permission } from "@/pilot/auth/permissions";
import type { Actor } from "@/pilot/auth/principal";
import type { PilotConfig } from "@/pilot/config";
import { UserMenu } from "./UserMenu";

const NAV: { href: string; label: string; any: Permission[] }[] = [
  { href: "/overview", label: "Overview", any: ["portfolio.read"] },
  { href: "/finops", label: "FinOps Workbench", any: ["workflow.finops"] },
  { href: "/engineering", label: "My Work", any: ["workflow.engineering"] },
  { href: "/recommendations", label: "Recommendations", any: ["portfolio.read", "recs.read.owned"] },
  { href: "/cost", label: "Cost", any: ["portfolio.read"] },
  { href: "/resources", label: "Resources", any: ["portfolio.read"] },
  { href: "/savings", label: "Verified Savings", any: ["portfolio.read"] },
  { href: "/admin", label: "Administration", any: ["admin.read"] },
];

const ROLE_LABEL = { executive: "Executive", finops: "FinOps", engineering: "Engineering", admin: "Administrator" } as const;

export function PilotShell({ actor, config, active, children }: { actor: Actor; config: PilotConfig; active: string; children: ReactNode }) {
  const nav = NAV.filter((n) => n.any.some((p) => can(actor, p)));
  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="bg-ink-900 text-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500 text-xs font-bold">FC</span>
            FinOps Command Center
          </Link>
          <span className="rounded-full border border-white/20 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/80" title="Single-organization Azure pilot">
            {config.orgLabel} · {config.subscriptionIds.length} approved subscription{config.subscriptionIds.length === 1 ? "" : "s"}
          </span>
          <div className="ml-auto">
            <UserMenu name={actor.name} email={actor.email} roles={actor.roles.map((r) => ROLE_LABEL[r])} />
          </div>
        </div>
        <nav aria-label="Primary" className="mx-auto max-w-[1400px] overflow-x-auto px-2 sm:px-4">
          <ul className="flex gap-1">
            {nav.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active === n.href ? "page" : undefined}
                  className={`block whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${active === n.href ? "border-accent-500 text-white" : "border-transparent text-white/70 hover:text-white"}`}
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
