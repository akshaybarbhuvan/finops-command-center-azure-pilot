// Middleware-safe principal resolution (no database, no server-only imports).
import type { PilotConfig } from "../config";
import { parseDevPrincipal, parseEasyAuth, type PrincipalResult } from "./principal";

export function resolvePrincipalForMiddleware(get: (n: string) => string | null, c: PilotConfig): PrincipalResult {
  if (c.authMode === "development") return parseDevPrincipal(process.env.FCC_DEV_PRINCIPAL_JSON, c.tenantId);
  return parseEasyAuth(get, c.tenantId);
}
