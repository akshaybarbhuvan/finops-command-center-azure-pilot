import "server-only";
// Resolves the authenticated actor for a server request and keeps the user directory current.
import { headers } from "next/headers";
import { pilotConfig, type PilotConfig } from "./config";
import { getDb } from "./db";
import type { Db } from "./db/types";
import type { Actor } from "./auth/principal";
import { resolvePrincipalForMiddleware } from "./auth/middleware-principal";

export const resolvePrincipal = resolvePrincipalForMiddleware;

const lastWrite = new WeakMap<Db, Map<string, { at: number; roles: string }>>();

/** Records the user (object ID, display name, current roles). Throttled to one write per user per 5 minutes. */
export async function touchUser(db: Db, a: Actor, now = new Date()) {
  const roles = a.roles.join(",");
  let seen = lastWrite.get(db);
  if (!seen) lastWrite.set(db, (seen = new Map()));
  const prev = seen.get(a.id);
  if (prev && prev.roles === roles && now.getTime() - prev.at < 5 * 60_000) return;
  const p = { id: a.id, n: a.name, e: a.email, r: roles, now: now.toISOString() };
  const u = await db.run(`UPDATE users SET display_name=@n, email=@e, roles=@r, last_seen_at=@now WHERE id=@id`, p);
  if (u.changes === 0) {
    try {
      await db.run(`INSERT INTO users (id, display_name, email, roles, first_seen_at, last_seen_at) VALUES (@id, @n, @e, @r, @now, @now)`, p);
    } catch {
      await db.run(`UPDATE users SET display_name=@n, email=@e, roles=@r, last_seen_at=@now WHERE id=@id`, p); // concurrent first request
    }
  }
  seen.set(a.id, { at: now.getTime(), roles });
}

export type SessionResult =
  | { kind: "ok"; actor: Actor; config: PilotConfig; db: Db }
  | { kind: "config_error"; problems: string[] }
  | { kind: "anonymous" }
  | { kind: "rejected"; reason: string }
  | { kind: "no_role"; actor: Actor };

/** For server components and route handlers. */
export async function getSession(): Promise<SessionResult> {
  const cfg = pilotConfig();
  if (!cfg.ok) return { kind: "config_error", problems: cfg.problems };
  const h = await headers();
  const p = resolvePrincipal((n) => h.get(n), cfg.config);
  if (p.kind === "anonymous") return { kind: "anonymous" };
  if (p.kind === "rejected") return { kind: "rejected", reason: p.reason };
  if (!p.actor.roles.length) return { kind: "no_role", actor: p.actor };
  const db = await getDb(cfg.config);
  await touchUser(db, p.actor);
  return { kind: "ok", actor: p.actor, config: cfg.config, db };
}
