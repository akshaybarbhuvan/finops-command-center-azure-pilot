// Navigation and route access by persona.
import type { Role } from "./demo/types";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: Role[];
  section: "Command" | "Inform" | "Optimize" | "Operate" | "Platform";
}

const ALL: Role[] = ["executive", "finops", "engineering", "admin"];

export const NAV: NavItem[] = [
  { href: "/overview", label: "Executive Overview", icon: "gauge", roles: ["executive", "finops", "admin"], section: "Command" },
  { href: "/finops", label: "FinOps Workbench", icon: "layout", roles: ["finops", "admin"], section: "Command" },
  { href: "/engineering", label: "Engineering Work Queue", icon: "wrench", roles: ["engineering", "finops", "admin"], section: "Command" },
  { href: "/cost", label: "Cost & Spend", icon: "chart", roles: ["executive", "finops", "admin"], section: "Inform" },
  { href: "/budgets", label: "Budgets & Forecast", icon: "target", roles: ["executive", "finops", "admin"], section: "Inform" },
  { href: "/anomalies", label: "Anomalies", icon: "siren", roles: ALL, section: "Inform" },
  { href: "/optimization", label: "Optimization", icon: "sparkles", roles: ALL, section: "Optimize" },
  { href: "/recommendations", label: "Recommendations", icon: "list", roles: ALL, section: "Optimize" },
  { href: "/savings", label: "Savings", icon: "piggy", roles: ["executive", "finops", "admin"], section: "Optimize" },
  { href: "/governance", label: "Governance", icon: "shield", roles: ["executive", "finops", "admin"], section: "Operate" },
  { href: "/resources", label: "Resources", icon: "server", roles: ["finops", "engineering", "admin"], section: "Operate" },
  { href: "/tickets", label: "Tickets", icon: "ticket", roles: ["finops", "engineering", "admin"], section: "Operate" },
  { href: "/reports", label: "Reports", icon: "file", roles: ["executive", "finops", "admin"], section: "Operate" },
  { href: "/roadmap", label: "Roadmap", icon: "map", roles: ALL, section: "Platform" },
  { href: "/admin", label: "Administration", icon: "settings", roles: ["admin"], section: "Platform" },
];

export const HOME: Record<Role, string> = {
  executive: "/overview",
  finops: "/finops",
  engineering: "/engineering",
  admin: "/admin",
};

export function navFor(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role));
}

/** Returns true if the persona may open the given pathname. Detail routes inherit from their parent. */
export function canAccess(role: Role, pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  const item = NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  return item ? item.roles.includes(role) : true;
}

/** Routes reachable without a demo session (local demo mode only — pilot/production never mount the demo shell). */
export const PUBLIC_PATHS = ["/login"] as const;

export function isPublicPath(pathname: string): boolean {
  return (PUBLIC_PATHS as readonly string[]).includes(pathname);
}

/** Validates a post-login return path: same-origin, absolute, permitted for the role. Falls back to the role home. */
export function safeReturnPath(role: Role, next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || isPublicPath(next.split("?")[0])) return HOME[role];
  const path = next.split("?")[0].split("#")[0];
  return path !== "/" && canAccess(role, path) ? next : HOME[role];
}
