// Server-side authorization model. Every page loader, query and route handler calls these functions;
// hiding navigation in the UI is never relied upon.
import type { Actor, PilotRole } from "./principal";

export type Permission =
  | "portfolio.read" // all recommendations, cost, inventory, verified savings (read-only)
  | "recs.read.owned" // only recommendations where owner_id = actor.id
  | "workflow.finops" // validate, route, prioritize, defer/reject (pre-assignment), reopen, verify, close
  | "workflow.engineering" // owner actions on own records only
  | "comment"
  | "sync.trigger"
  | "admin.read"; // connector diagnostics, audit log, user list

const GRANTS: Record<PilotRole, Permission[]> = {
  executive: ["portfolio.read"],
  finops: ["portfolio.read", "workflow.finops", "comment", "sync.trigger"],
  engineering: ["recs.read.owned", "workflow.engineering", "comment"],
  admin: ["portfolio.read", "admin.read", "sync.trigger"],
};

export function can(actor: Actor, p: Permission): boolean {
  return actor.roles.some((r) => GRANTS[r].includes(p));
}

export type RecScope = { kind: "all" } | { kind: "owned"; ownerId: string } | { kind: "none" };

/** Row-level scope applied inside every recommendation query, before filtering, counting or exporting. */
export function recScope(actor: Actor): RecScope {
  if (can(actor, "portfolio.read")) return { kind: "all" };
  if (can(actor, "recs.read.owned")) return { kind: "owned", ownerId: actor.id };
  return { kind: "none" };
}

export class AuthzError extends Error {
  constructor(
    public status: 401 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

export function demand(actor: Actor, p: Permission) {
  if (!can(actor, p)) throw new AuthzError(403, "You do not have permission for this action");
}
