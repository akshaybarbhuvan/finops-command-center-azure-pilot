"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  ChevronDown,
  FileBarChart,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Lock,
  LogOut,
  Map,
  Maximize2,
  Menu,
  RotateCcw,
  Minimize2,
  PiggyBank,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Siren,
  Sparkles,
  Target,
  Ticket,
  TrendingUp,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Avatar, Button, ButtonLink, Kbd, Skeleton, cx } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/overlay";
import { useDemo, useDemoSession } from "@/lib/demo/store";
import { attentionItems } from "@/lib/demo/selectors";
import { ROLE_LABEL } from "@/lib/demo/workflow";
import { canAccess, HOME, isPublicPath, navFor, type NavItem } from "@/lib/rbac";
import { date } from "@/lib/format";
import type { Role } from "@/lib/demo/types";
import { GlobalSearch } from "./GlobalSearch";
import { ResetDemoDialog } from "@/components/pages/Administration";
import { CopilotPanel } from "./CopilotPanel";

const ICONS: Record<string, typeof Gauge> = {
  gauge: Gauge,
  layout: LayoutDashboard,
  wrench: Wrench,
  chart: TrendingUp,
  target: Target,
  siren: Siren,
  sparkles: Sparkles,
  list: ListChecks,
  piggy: PiggyBank,
  shield: ShieldCheck,
  server: Server,
  ticket: Ticket,
  file: FileBarChart,
  map: Map,
  settings: Settings,
};

export function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5B82F5" />
          <stop offset="1" stopColor="#0EA5A4" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#lg)" />
      <path d="M9 21.5V10.5h9" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M9 16h6" stroke="white" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M19 21.5l4-5 -4-5" stroke="white" strokeOpacity=".85" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function Sidebar({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const sections = ["Command", "Inform", "Optimize", "Operate", "Platform"] as const;
  return (
    <div className="flex h-full flex-col bg-ink-900 text-slate-300">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-3 px-5 pb-5 pt-5">
        <LogoMark />
        <div className="leading-tight">
          <div className="text-[13.5px] font-semibold tracking-tight text-white">FinOps Command Center</div>
          <div className="text-[10.5px] text-slate-400">Governance & Optimization</div>
        </div>
      </Link>
      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
        {sections.map((sec) => {
          const its = items.filter((i) => i.section === sec);
          if (!its.length) return null;
          return (
            <div key={sec} className="mb-4">
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{sec}</div>
              <ul className="space-y-0.5">
                {its.map((i) => {
                  const Icon = ICONS[i.icon] ?? Gauge;
                  const active = pathname === i.href || pathname.startsWith(`${i.href}/`);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cx(
                          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors focus-visible:ring-offset-ink-900",
                          active ? "bg-white/[0.08] text-white" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100",
                        )}
                      >
                        {active && <span aria-hidden className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-[3px] rounded-r bg-brand-400" />}
                        <Icon className={cx("h-4 w-4 shrink-0", active ? "text-brand-400" : "text-slate-500 group-hover:text-slate-300")} aria-hidden />
                        {i.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/5 px-5 py-4">
        <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden />
          Local demo • Illustrative data
        </div>
        <div className="mt-1 text-[11px] text-slate-500">Data as of {date("2026-10-07")}</div>
      </div>
    </div>
  );
}

function AccountMenu() {
  const { user, signOut } = useDemo();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
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
  const leave = (switching: boolean) => {
    setOpen(false);
    signOut();
    toast({ kind: "info", title: switching ? "Signed out — choose another demo user" : "Signed out", body: "Workflow changes are kept in this browser." });
    router.replace("/login");
  };
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.name}, ${ROLE_LABEL[user.role]}`}
        className="flex items-center gap-2.5 rounded-xl border border-line bg-white py-1 pl-1 pr-2.5 text-left shadow-sm transition hover:border-slate-300"
      >
        <Avatar initials={user.initials} size="sm" />
        <span className="hidden leading-tight sm:block">
          <span className="block text-[12.5px] font-semibold text-slate-800">{user.name}</span>
          <span className="block text-[10.5px] font-medium text-slate-500">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden />
      </button>
      <ResetDemoDialog open={resetOpen} onClose={() => setResetOpen(false)} />
      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 z-50 mt-2 w-72 animate-scale-in rounded-xl border border-line bg-white p-2 shadow-pop">
          <div className="flex items-center gap-3 px-2.5 pb-3 pt-1.5">
            <Avatar initials={user.initials} size="md" />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-slate-900">{user.name}</div>
              <div className="truncate text-[11.5px] text-slate-500">{user.title}</div>
              <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-brand-600">{ROLE_LABEL[user.role]}</div>
            </div>
          </div>
          <div className="mx-2.5 mb-1 rounded-md bg-slate-50 px-2 py-1.5 text-[10.5px] text-slate-500">Simulated local demo sign-in — not enterprise SSO.</div>
          <button role="menuitem" type="button" onClick={() => leave(true)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50">
            <Users className="h-4 w-4 text-slate-400" aria-hidden />
            Switch demo user
          </button>
          {user.role === "admin" && (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                setResetOpen(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4 text-slate-400" aria-hidden />
              Reset demo data
            </button>
          )}
          <button role="menuitem" type="button" onClick={() => leave(false)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50">
            <LogOut className="h-4 w-4 text-slate-400" aria-hidden />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

function AttentionCenter() {
  const { ds, persona } = useDemo();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const items = useMemo(() => attentionItems(ds).filter((i) => i.roles.includes(persona)), [ds, persona]);
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
  const critical = items.filter((i) => i.severity === "critical").length;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Attention center, ${items.length} items`}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {items.length > 0 && (
          <span className={cx("absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9.5px] font-bold text-white", critical ? "bg-rose-500" : "bg-brand-500")}>{items.length}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(400px,calc(100vw-2rem))] animate-scale-in overflow-hidden rounded-xl border border-line bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Attention center</div>
              <div className="text-[11px] text-slate-500">For {ROLE_LABEL[persona]} · illustrative demo data</div>
            </div>
          </div>
          <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto scrollbar-thin">
            {items.length === 0 && <li className="px-4 py-8 text-center text-xs text-slate-500">Nothing needs your attention right now.</li>}
            {items.map((i) => (
              <li key={i.id}>
                <Link href={i.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 transition hover:bg-slate-50">
                  <span aria-hidden className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", i.severity === "critical" ? "bg-rose-500" : i.severity === "warning" ? "bg-amber-500" : "bg-brand-500")} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-slate-900">{i.title}</span>
                    <span className="block truncate text-xs text-slate-500">{i.detail}</span>
                  </span>
                  <span className="sr-only">Severity {i.severity}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-72" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

function AccessDenied({ role }: { role: Role }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Lock className="h-5 w-5" aria-hidden />
      </div>
      <h1 className="text-base font-semibold text-slate-900">Access denied</h1>
      <p className="mt-1 text-sm text-slate-500">Your role ({ROLE_LABEL[role]}) does not have permission to open this page.</p>
      <div className="mt-5">
        <ButtonLink href={HOME[role]} variant="primary">
          Go to my home
        </ButtonLink>
      </div>
    </div>
  );
}

function ValidationFailure() {
  const { validation } = useDemo();
  return (
    <div className="mx-auto mt-10 max-w-2xl rounded-xl border-2 border-rose-300 bg-rose-50 p-6">
      <h1 className="text-base font-semibold text-rose-800">Demo dataset failed validation</h1>
      <p className="mt-1 text-sm text-rose-700">The application will not render demo metrics until the seed data passes every integrity check.</p>
      <ul className="mt-3 space-y-1 text-sm text-rose-800">
        {validation.checks
          .filter((c) => !c.ok)
          .map((c) => (
            <li key={c.name}>
              ✗ {c.name}: {c.detail}
            </li>
          ))}
      </ul>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, hydrated, validation } = useDemoSession();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = isPublicPath(pathname);
  useEffect(() => {
    if (hydrated && !user && !isPublic) {
      const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [hydrated, user, isPublic, pathname, router]);
  if (isPublic) return <>{children}</>;
  if (!validation.ok && user) return <SignedInShell>{children}</SignedInShell>;
  if (!hydrated || !user)
    return (
      <div className="p-6" aria-busy="true">
        <span className="sr-only">Checking demo sign-in…</span>
        <ShellSkeleton />
      </div>
    );
  return <SignedInShell>{children}</SignedInShell>;
}

function SignedInShell({ children }: { children: ReactNode }) {
  const { persona, hydrated, focus, setFocus, clientLabel, validation } = useDemo();
  const pathname = usePathname();
  const items = navFor(persona);
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (typing) return;
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape" && focus && !searchOpen && !copilotOpen) setFocus(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, setFocus, searchOpen, copilotOpen]);

  const allowed = canAccess(persona, pathname);

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-lift">
        Skip to content
      </a>
      {!focus && (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] lg:block" aria-label="Sidebar">
          <Sidebar items={items} />
        </aside>
      )}
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/50" onClick={() => setMobileNav(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-[268px] animate-fade-up">
            <Sidebar items={items} onNavigate={() => setMobileNav(false)} />
            <button type="button" onClick={() => setMobileNav(false)} className="absolute right-3 top-5 rounded-md p-1 text-slate-400 hover:text-white" aria-label="Close navigation">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
      <div className={cx("flex min-h-screen flex-col transition-[padding]", !focus && "lg:pl-[248px]")}>
        <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-2 px-4 md:px-6">
            {!focus && (
              <button type="button" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </button>
            )}
            {focus && (
              <Link href="/" className="mr-2 flex items-center gap-2">
                <LogoMark />
                <span className="hidden text-sm font-semibold text-slate-900 md:block">FinOps Command Center</span>
              </Link>
            )}
            <div className="hidden items-center gap-2 md:flex">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-slate-50 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent-500" aria-hidden />
                Local demo • Illustrative data
              </span>
              <span className="hidden text-[12px] text-slate-400 xl:inline">Prepared for {clientLabel}</span>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="hidden h-9 w-56 items-center gap-2 rounded-lg border border-line bg-slate-50 px-3 text-sm text-slate-400 transition hover:border-slate-300 hover:bg-white md:flex"
                aria-label="Search (press slash)"
              >
                <Search className="h-4 w-4" aria-hidden />
                <span className="flex-1 truncate text-left">Search…</span>
                <Kbd>/</Kbd>
              </button>
              <button type="button" onClick={() => setSearchOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Search">
                <Search className="h-[18px] w-[18px]" />
              </button>
              <Button variant="subtle" size="md" onClick={() => setCopilotOpen(true)} icon={<Sparkles className="h-4 w-4" aria-hidden />} className="hidden sm:inline-flex">
                Copilot
              </Button>
              <AttentionCenter />
              <button
                type="button"
                onClick={() => setFocus(!focus)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-pressed={focus}
                aria-label={focus ? "Exit focus mode" : "Enter focus mode for presenting"}
                title={focus ? "Exit focus mode (Esc)" : "Focus mode for presenting"}
              >
                {focus ? <Minimize2 className="h-[18px] w-[18px]" /> : <Maximize2 className="h-[18px] w-[18px]" />}
              </button>
              <div className="ml-1">
                <AccountMenu />
              </div>
            </div>
          </div>
          {focus && (
            <nav aria-label="Focus navigation" className="no-print flex gap-1 overflow-x-auto border-t border-line px-4 py-1.5 md:px-6 scrollbar-thin">
              {items.map((i) => (
                <Link key={i.href} href={i.href} className={cx("shrink-0 rounded-md px-2.5 py-1 text-xs font-medium", pathname.startsWith(i.href) ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100")}>
                  {i.label}
                </Link>
              ))}
            </nav>
          )}
        </header>
        <main id="main" className={cx("flex-1 px-4 py-6 md:px-6 lg:px-8", focus && "mx-auto w-full max-w-[1600px] text-[15px]")} data-focus={focus || undefined}>
          {!validation.ok ? <ValidationFailure /> : !hydrated ? <ShellSkeleton /> : allowed ? <div className="animate-fade-up">{children}</div> : <AccessDenied role={persona} />}
        </main>
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <CopilotPanel open={copilotOpen} onClose={() => setCopilotOpen(false)} />
    </div>
  );
}
