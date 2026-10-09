"use client";
// Client-side demo state: simulated local sign-in session, workflow state and presentation preferences.
// Workflow state persists in the browser (localStorage) across sign-ins and can be reset to the deterministic seed.
// The session is a LOCAL DEMO convenience only. This provider is mounted exclusively when APP_MODE=demo
// (see app/layout.tsx); pilot and production render the enterprise SSO gate instead and never reach this code.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getSeedDataset } from "./seed";
import { applyCommand, WorkflowError, type WorkflowCommand } from "./workflow";
import { validateDataset, type ValidationResult } from "./validation";
import { scopeDataset } from "./access";
import type { Dataset, DemoState, Role, StaticDataset, User } from "./types";

const STORAGE_KEY = "fcc.demo.v1";
const SESSION_KEY = "fcc.demo.session.v1";
const STATE_VERSION = 4;

/** The four simulated demo accounts offered on the local sign-in page. */
export const PERSONA_USER: Record<Role, string> = {
  executive: "u-exec",
  finops: "u-finops",
  engineering: "u-priya",
  admin: "u-admin",
};

export const DEMO_ACCOUNTS: { role: Role; userId: string; title: string; purpose: string }[] = [
  { role: "executive", userId: "u-exec", title: "Executive / Leadership", purpose: "Read-only portfolio view, drill-down and export" },
  { role: "finops", userId: "u-finops", title: "FinOps Practitioner", purpose: "Route, prioritize, track and verify savings" },
  { role: "engineering", userId: "u-priya", title: "Engineering Owner", purpose: "Triage, ticket, change approval and implementation for owned items" },
  { role: "engineering", userId: "u-erp2", title: "Engineering Owner (second account)", purpose: "Same team, separate assigned items — sees only their own records" },
  { role: "admin", userId: "u-admin", title: "Administrator", purpose: "Users, audit, platform health and demo reset" },
];

const DEMO_ACCOUNT_IDS = new Set(DEMO_ACCOUNTS.map((a) => a.userId));

function seedState(): DemoState {
  const s = getSeedDataset();
  return { version: STATE_VERSION, recommendations: s.recommendations, tickets: s.tickets, anomalies: s.anomalies, audit: s.audit, sequence: 0 };
}

function staticPart(): StaticDataset {
  const s = getSeedDataset();
  return {
    asOf: s.asOf,
    users: s.users,
    teams: s.teams,
    businessUnits: s.businessUnits,
    applications: s.applications,
    subscriptions: s.subscriptions,
    resources: s.resources,
    reservations: s.reservations,
    policyExceptions: s.policyExceptions,
    monthlyCosts: s.monthlyCosts,
    dailyCosts: s.dailyCosts,
    priorMonthDailyCosts: s.priorMonthDailyCosts,
    monthlyBudgets: s.monthlyBudgets,
  };
}

interface Persisted {
  version: number;
  focus: boolean;
  state: DemoState;
}

function load(): Persisted | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed.version !== STATE_VERSION || parsed.state?.version !== STATE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function save(p: Persisted) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable (private mode) — demo continues in memory */
  }
}

function loadSession(): string | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: unknown };
    return typeof parsed.userId === "string" && DEMO_ACCOUNT_IDS.has(parsed.userId) ? parsed.userId : null;
  } catch {
    return null;
  }
}

function saveSession(userId: string | null) {
  try {
    if (userId) window.localStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* in-memory only */
  }
}

export type DispatchResult = { ok: true } | { ok: false; error: string };

interface ProviderValue {
  /** Full, unscoped dataset — only for the provider and the session layer. Pages use useDemo().ds. */
  fullDs: Dataset;
  ds: Dataset | null;
  hydrated: boolean;
  user: User | null;
  signIn: (userId: string) => boolean;
  signOut: () => void;
  dispatch: (cmd: WorkflowCommand) => DispatchResult;
  dispatchMany: (cmds: WorkflowCommand[]) => DispatchResult[];
  reset: () => void;
  focus: boolean;
  setFocus: (v: boolean) => void;
  clientLabel: string;
  validation: ValidationResult;
  isDirty: boolean;
}

export interface DemoContextValue extends Omit<ProviderValue, "ds" | "user" | "fullDs" | "signIn"> {
  /** Dataset scoped to the signed-in user (row-level authorization applied). */
  ds: Dataset;
  user: User;
  persona: Role;
}

const DemoContext = createContext<ProviderValue | null>(null);

function errorMessage(e: unknown) {
  return e instanceof WorkflowError ? e.message : "The action could not be completed.";
}

export function DemoProvider({ children, clientLabel }: { children: ReactNode; clientLabel: string }) {
  const staticDs = useMemo(staticPart, []);
  const [state, setState] = useState<DemoState>(seedState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [userId, setUserId] = useState<string | null>(null);
  const [focus, setFocusState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const validation = useMemo(() => validateDataset(getSeedDataset()), []);

  useEffect(() => {
    // Presenter start URL: /login?reset=1&focus=1 restores the seed and signs everyone out. It never signs anyone in.
    const url = new URL(window.location.href);
    const resetRequested = url.searchParams.get("reset") === "1";
    const focusParam = url.searchParams.get("focus");
    const p = resetRequested ? null : load();
    if (p) {
      setState(p.state);
      setFocusState(p.focus);
    }
    if (resetRequested) saveSession(null);
    else setUserId(loadSession());
    if (focusParam === "1" || focusParam === "0") setFocusState(focusParam === "1");
    if (resetRequested || focusParam) {
      url.searchParams.delete("reset");
      url.searchParams.delete("focus");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) save({ version: STATE_VERSION, focus, state });
  }, [hydrated, focus, state]);

  const fullDs = useMemo<Dataset>(() => ({ ...staticDs, ...state }), [staticDs, state]);
  const user = useMemo(() => (userId ? (staticDs.users.find((u) => u.id === userId) ?? null) : null), [staticDs, userId]);
  const ds = useMemo(() => (user ? scopeDataset(fullDs, user) : null), [fullDs, user]);

  const signIn = useCallback((id: string) => {
    if (!DEMO_ACCOUNT_IDS.has(id)) return false;
    setUserId(id);
    saveSession(id);
    return true;
  }, []);

  const signOut = useCallback(() => {
    // Workflow data is kept; only the simulated session ends.
    setUserId(null);
    saveSession(null);
  }, []);

  const dispatchMany = useCallback(
    (cmds: WorkflowCommand[]): DispatchResult[] => {
      if (!user) return cmds.map(() => ({ ok: false as const, error: "Sign in to perform this action." }));
      let cur = stateRef.current;
      const results: DispatchResult[] = cmds.map((cmd) => {
        try {
          cur = applyCommand(cur, cmd, { actor: user, asOf: staticDs.asOf, users: staticDs.users });
          return { ok: true as const };
        } catch (e) {
          return { ok: false as const, error: errorMessage(e) };
        }
      });
      if (cur !== stateRef.current) {
        stateRef.current = cur;
        setState(cur);
      }
      return results;
    },
    [user, staticDs],
  );

  const dispatch = useCallback((cmd: WorkflowCommand) => dispatchMany([cmd])[0], [dispatchMany]);

  const reset = useCallback(() => {
    // Restores the seed. Does not create or change a session.
    const s = seedState();
    stateRef.current = s;
    setState(s);
    setFocusState(false);
  }, []);

  const value: ProviderValue = {
    fullDs,
    ds,
    hydrated,
    user,
    signIn,
    signOut,
    dispatch,
    dispatchMany,
    reset,
    focus,
    setFocus: setFocusState,
    clientLabel,
    validation,
    isDirty: state.sequence > 0,
  };
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

/** Session-level access: works whether or not a demo user is signed in (login page, route guard). */
export function useDemoSession() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemoSession must be used inside <DemoProvider>");
  return ctx;
}

/** Signed-in access. Returns the dataset already scoped to the signed-in user. */
export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used inside <DemoProvider>");
  if (!ctx.user || !ctx.ds) throw new Error("useDemo requires a signed-in demo user");
  const { fullDs: _f, signIn: _s, ...rest } = ctx;
  void _f;
  void _s;
  return { ...rest, ds: ctx.ds, user: ctx.user, persona: ctx.user.role };
}
