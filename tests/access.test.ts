import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { canAccess, HOME, NAV, navFor } from "@/lib/rbac";
import { clientLabel, isDemoBypassAllowed, resolveAppMode } from "@/lib/app-mode";
import type { Role } from "@/lib/demo/types";

const ROLES: Role[] = ["executive", "finops", "engineering", "admin"];

describe("navigation & route access", () => {
  it("every navigation item maps to an existing page", () => {
    for (const n of NAV) {
      const file = path.join(process.cwd(), "src/app", n.href, "page.tsx");
      expect(fs.existsSync(file), `${n.href} has no page`).toBe(true);
    }
  });

  it("each persona lands on a home page it can access", () => {
    for (const r of ROLES) {
      expect(canAccess(r, HOME[r])).toBe(true);
      expect(navFor(r).some((n) => n.href === HOME[r])).toBe(true);
    }
  });

  it("applies role-specific navigation", () => {
    expect(navFor("admin").length).toBe(NAV.length);
    expect(navFor("engineering").map((n) => n.href)).toContain("/engineering");
    expect(navFor("engineering").map((n) => n.href)).not.toContain("/admin");
    expect(navFor("executive").map((n) => n.href)).not.toContain("/resources");
    expect(canAccess("executive", "/admin")).toBe(false);
    expect(canAccess("engineering", "/recommendations/REC-2041")).toBe(true);
    expect(canAccess("engineering", "/budgets")).toBe(false);
  });
});

describe("app mode — no demo bypass outside demo", () => {
  it("resolves explicit modes", () => {
    expect(resolveAppMode({ APP_MODE: "demo" })).toBe("demo");
    expect(resolveAppMode({ APP_MODE: "pilot" })).toBe("pilot");
    expect(resolveAppMode({ APP_MODE: "PRODUCTION" })).toBe("production");
  });

  it("fails closed for unknown values and production builds", () => {
    expect(resolveAppMode({ APP_MODE: "debug" })).toBe("pilot");
    expect(resolveAppMode({ NODE_ENV: "production" })).toBe("pilot");
    expect(resolveAppMode({ NODE_ENV: "development" })).toBe("demo");
  });

  it("allows the persona bypass only in demo mode", () => {
    expect(isDemoBypassAllowed("demo")).toBe(true);
    expect(isDemoBypassAllowed("pilot")).toBe(false);
    expect(isDemoBypassAllowed("production")).toBe(false);
  });

  it("root layout gates the demo shell on the bypass check", () => {
    const layout = fs.readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toMatch(/isDemoBypassAllowed\(mode\)\s*\?\s*<Providers/);
    expect(layout).toMatch(/<PilotGate/);
  });

  it("sanitizes the client label", () => {
    expect(clientLabel({})).toBe("Enterprise Client Demo");
    expect(clientLabel({ DEMO_CLIENT_LABEL: "x".repeat(80) })).toBe("Enterprise Client Demo");
  });
});

import { isPublicPath, safeReturnPath } from "@/lib/rbac";
import { findVisibleRec, scopeDataset } from "@/lib/demo/access";
import { getSeedDataset } from "@/lib/demo/seed";
import { DEMO_ACCOUNTS } from "@/lib/demo/store";
const DEMO_ACCOUNT_IDS = DEMO_ACCOUNTS.map((a) => a.userId);
import type { User } from "@/lib/demo/types";

const seed = getSeedDataset();
const u = (id: string) => seed.users.find((x) => x.id === id) as User;

describe("simulated local sign-in routing", () => {
  it("only /login is public", () => {
    expect(isPublicPath("/login")).toBe(true);
    for (const p of ["/", "/overview", "/finops", "/engineering", "/admin", "/recommendations/REC-2041"]) expect(isPublicPath(p)).toBe(false);
  });

  it("lands each role on its home page", () => {
    expect(HOME).toEqual({ executive: "/overview", finops: "/finops", engineering: "/engineering", admin: "/admin" });
  });

  it("rejects unsafe or unauthorized return paths", () => {
    expect(safeReturnPath("executive", "//evil.example")).toBe("/overview");
    expect(safeReturnPath("executive", "https://evil.example")).toBe("/overview");
    expect(safeReturnPath("finops", "/login")).toBe("/finops");
    expect(safeReturnPath("engineering", "/admin")).toBe("/engineering");
    expect(safeReturnPath("executive", "/admin")).toBe("/overview");
    expect(safeReturnPath("finops", "/recommendations/REC-2041")).toBe("/recommendations/REC-2041");
    expect(safeReturnPath("admin", null)).toBe("/admin");
  });

  it("offers five demo accounts covering all four roles, with two engineering owners", () => {
    expect([...DEMO_ACCOUNT_IDS].sort()).toEqual(["u-admin", "u-erp2", "u-exec", "u-finops", "u-priya"]);
    expect(new Set(DEMO_ACCOUNT_IDS.map((id) => u(id).role)).size).toBe(4);
    expect(DEMO_ACCOUNT_IDS.filter((id) => u(id).role === "engineering").sort()).toEqual(["u-erp2", "u-priya"]);
    for (const a of DEMO_ACCOUNTS) expect(u(a.userId).role).toBe(a.role);
  });

  it("demo sign-in is never available outside demo mode", () => {
    for (const mode of ["pilot", "production"] as const) expect(isDemoBypassAllowed(mode)).toBe(false);
    expect(isDemoBypassAllowed(resolveAppMode({ APP_MODE: "pilot", NODE_ENV: "development" }))).toBe(false);
  });
});

describe("row-level authorization", () => {
  const priya = scopeDataset(seed, u("u-priya"));
  const other = scopeDataset(seed, u("u-com1"));

  it("engineering owners see only their own recommendations, tickets and anomalies", () => {
    expect(priya.recommendations.length).toBeGreaterThan(0);
    expect(priya.recommendations.every((r) => r.ownerId === "u-priya")).toBe(true);
    expect(other.recommendations.every((r) => r.ownerId === "u-com1")).toBe(true);
    const a = new Set(priya.recommendations.map((r) => r.id));
    expect(other.recommendations.some((r) => a.has(r.id))).toBe(false);
    expect(priya.tickets.every((t) => a.has(t.recommendationId))).toBe(true);
    expect(priya.anomalies.every((x) => x.ownerId === "u-priya")).toBe(true);
  });

  it("portfolio roles see everything", () => {
    for (const id of ["u-exec", "u-finops", "u-admin"]) expect(scopeDataset(seed, u(id)).recommendations.length).toBe(seed.recommendations.length);
  });

  it("out-of-scope and missing records are indistinguishable", () => {
    const owned = seed.recommendations.find((r) => r.ownerId === "u-priya")!;
    expect(findVisibleRec(seed, u("u-priya"), owned.id)?.id).toBe(owned.id);
    expect(findVisibleRec(seed, u("u-com1"), owned.id)).toBeUndefined();
    expect(findVisibleRec(seed, u("u-com1"), "REC-2041")).toBeUndefined();
    expect(findVisibleRec(seed, u("u-com1"), "REC-NOPE")).toBeUndefined();
    expect(findVisibleRec(seed, u("u-finops"), "REC-2041")?.id).toBe("REC-2041");
  });
});
