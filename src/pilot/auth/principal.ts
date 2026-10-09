// Organizational identity for the pilot.
//
// Hosted pilot: Azure App Service Authentication ("Easy Auth") with Microsoft Entra ID performs the sign-in and
// injects X-MS-CLIENT-PRINCIPAL. Microsoft documents that "external requests aren't allowed to set these headers, so
// they're present only if App Service sets them". config.ts refuses to start on App Service unless authentication is
// enabled (WEBSITE_AUTH_ENABLED=True), and this module additionally requires the Entra tenant claim to equal the
// configured pilot tenant.
//
// Development: `next dev` only, never on App Service — a principal from FCC_DEV_PRINCIPAL_JSON (see config.ts).
export type PilotRole = "executive" | "finops" | "engineering" | "admin";

/** Entra application-role values that map to FCC roles. Assigned to users or groups in Enterprise Applications. */
export const APP_ROLE_VALUES: Record<string, PilotRole> = {
  "FCC.Executive": "executive",
  "FCC.FinOps": "finops",
  "FCC.Engineering": "engineering",
  "FCC.Admin": "admin",
};

export interface Actor {
  id: string; // Entra object ID (oid) — immutable per user in the tenant
  tenantId: string;
  name: string;
  email: string | null;
  roles: PilotRole[];
}

export type PrincipalResult =
  | { kind: "authenticated"; actor: Actor }
  | { kind: "anonymous" }
  | { kind: "rejected"; reason: "malformed" | "wrong_tenant" | "wrong_provider" | "missing_object_id" };

const CLAIM = {
  oid: ["http://schemas.microsoft.com/identity/claims/objectidentifier", "oid"],
  tid: ["http://schemas.microsoft.com/identity/claims/tenantid", "tid"],
  name: ["name"],
  email: ["preferred_username", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", "email"],
  role: ["roles", "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"],
};
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_HEADER = 16 * 1024;

interface EasyAuthPrincipal {
  auth_typ?: string;
  claims?: { typ?: string; val?: string }[];
  role_typ?: string;
}

export function rolesFromValues(values: string[]): PilotRole[] {
  const out = new Set<PilotRole>();
  for (const v of values) {
    const r = APP_ROLE_VALUES[v];
    if (r) out.add(r);
  }
  return [...out].sort();
}

/** Parses App Service Authentication headers. Pure — the caller supplies the headers. */
export function parseEasyAuth(get: (name: string) => string | null, tenantId: string): PrincipalResult {
  const raw = get("x-ms-client-principal");
  if (!raw) return { kind: "anonymous" };
  if (raw.length > MAX_HEADER) return { kind: "rejected", reason: "malformed" };
  let p: EasyAuthPrincipal;
  try {
    p = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as EasyAuthPrincipal;
  } catch {
    return { kind: "rejected", reason: "malformed" };
  }
  if (!p || !Array.isArray(p.claims)) return { kind: "rejected", reason: "malformed" };
  const idp = (get("x-ms-client-principal-idp") ?? p.auth_typ ?? "").toLowerCase();
  if (idp !== "aad") return { kind: "rejected", reason: "wrong_provider" };
  const claims = p.claims.filter((c) => typeof c?.typ === "string" && typeof c?.val === "string") as { typ: string; val: string }[];
  const first = (types: string[]) => claims.find((c) => types.includes(c.typ))?.val ?? null;
  const tid = first(CLAIM.tid);
  if (!tid || tid.toLowerCase() !== tenantId.toLowerCase()) return { kind: "rejected", reason: "wrong_tenant" };
  const oid = first(CLAIM.oid);
  if (!oid || !GUID.test(oid)) return { kind: "rejected", reason: "missing_object_id" };
  const roleTypes = new Set([...CLAIM.role, ...(p.role_typ ? [p.role_typ] : [])]);
  const roles = rolesFromValues(claims.filter((c) => roleTypes.has(c.typ)).map((c) => c.val));
  const name = (first(CLAIM.name) ?? get("x-ms-client-principal-name") ?? "Unknown user").slice(0, 256);
  const email = first(CLAIM.email);
  return { kind: "authenticated", actor: { id: oid.toLowerCase(), tenantId: tid.toLowerCase(), name, email: email ? email.slice(0, 320) : null, roles } };
}

/** Development-only principal (`next dev`, never on App Service; enforced in config.ts). */
export function parseDevPrincipal(json: string | undefined, tenantId: string): PrincipalResult {
  if (!json) return { kind: "anonymous" };
  try {
    const p = JSON.parse(json) as { id?: string; name?: string; email?: string; roles?: string[] };
    if (!p.id || !GUID.test(p.id)) return { kind: "rejected", reason: "missing_object_id" };
    return {
      kind: "authenticated",
      actor: { id: p.id.toLowerCase(), tenantId, name: p.name ?? "Developer", email: p.email ?? null, roles: rolesFromValues(p.roles ?? []) },
    };
  } catch {
    return { kind: "rejected", reason: "malformed" };
  }
}

export const has = (actor: Actor, role: PilotRole) => actor.roles.includes(role);

/** Navigation home for the actor's most operational role. */
export function homeFor(actor: Actor): string {
  if (has(actor, "finops")) return "/finops";
  if (has(actor, "engineering") && !has(actor, "executive") && !has(actor, "admin")) return "/engineering";
  if (has(actor, "executive")) return "/overview";
  if (has(actor, "admin")) return "/admin";
  return "/no-access";
}
