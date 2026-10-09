import "server-only";
// Common wrapper for pilot API route handlers: configuration → authentication → CSRF → rate limit → handler,
// with sanitized error responses. Business authorization happens inside the handler/service on every call.
import { randomUUID } from "node:crypto";
import { pilotConfig, type PilotConfig } from "../config";
import { getDb, SchemaNotReadyError } from "../db";
import type { Db } from "../db/types";
import { log } from "../log";
import { AuthzError } from "../auth/permissions";
import type { Actor } from "../auth/principal";
import { WorkflowFailure } from "../workflow/service";
import { resolvePrincipal, touchUser } from "../session";

export interface ApiContext {
  actor: Actor;
  config: PilotConfig;
  db: Db;
  requestId: string;
}

const json = (status: number, body: unknown, requestId: string) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-request-id": requestId } });

// ---- rate limiting (per instance; the pilot runs a single App Service instance by default) ----
const buckets = new Map<string, { tokens: number; at: number }>();
export function rateLimit(key: string, capacity: number, refillPerMinute: number, now = Date.now()): boolean {
  const b = buckets.get(key) ?? { tokens: capacity, at: now };
  const tokens = Math.min(capacity, b.tokens + ((now - b.at) / 60_000) * refillPerMinute);
  if (tokens < 1) {
    buckets.set(key, { tokens, at: now });
    return false;
  }
  buckets.set(key, { tokens: tokens - 1, at: now });
  if (buckets.size > 10_000) buckets.clear();
  return true;
}
export const _resetRateLimits = () => buckets.clear();

/** Same-origin check for state-changing requests (defence against cross-site request forgery). */
export function isSameOrigin(req: Request, publicOrigin: string): boolean {
  const origin = req.headers.get("origin");
  if (origin) return origin === publicOrigin;
  return req.headers.get("sec-fetch-site") === "same-origin";
}

export interface ApiOptions {
  mutation?: boolean;
  limit?: { bucket: string; capacity: number; perMinute: number };
}

export async function handleApi(req: Request, opts: ApiOptions, fn: (ctx: ApiContext) => Promise<Response>): Promise<Response> {
  const requestId = randomUUID();
  const cfg = pilotConfig();
  if (!cfg.ok) return json(503, { error: "configuration_incomplete", message: "The pilot is not fully configured. An administrator must complete the configuration." }, requestId);
  const config = cfg.config;
  const principal = resolvePrincipal((n) => req.headers.get(n), config);
  if (principal.kind === "anonymous") return json(401, { error: "unauthenticated", message: "Sign-in required" }, requestId);
  if (principal.kind === "rejected") return json(403, { error: "forbidden", message: "This identity is not accepted by the pilot" }, requestId);
  const actor = principal.actor;
  if (!actor.roles.length) return json(403, { error: "no_role", message: "No FCC role is assigned to your account" }, requestId);

  if (opts.mutation) {
    if (!isSameOrigin(req, config.publicOrigin)) return json(403, { error: "csrf", message: "Cross-site request rejected" }, requestId);
    if (req.headers.get("x-fcc-request") !== "1" || !(req.headers.get("content-type") ?? "").startsWith("application/json")) {
      return json(400, { error: "bad_request", message: "Requests must be JSON with the X-FCC-Request header" }, requestId);
    }
    const len = Number(req.headers.get("content-length") ?? "0");
    if (len > 32_768) return json(413, { error: "too_large", message: "Request body too large" }, requestId);
  }
  if (opts.limit && !rateLimit(`${opts.limit.bucket}:${actor.id}`, opts.limit.capacity, opts.limit.perMinute)) {
    return json(429, { error: "rate_limited", message: "Too many requests. Wait a moment and try again." }, requestId);
  }

  try {
    const db = await getDb(config);
    await touchUser(db, actor);
    return await fn({ actor, config, db, requestId });
  } catch (e) {
    if (e instanceof WorkflowFailure || e instanceof AuthzError) return json(e.status, { error: "request_failed", message: e.message }, requestId);
    if (e instanceof SchemaNotReadyError) return json(503, { error: "schema_not_ready", message: e.message }, requestId);
    log.error("api.unhandled", { requestId, path: new URL(req.url).pathname, error: (e as Error)?.message, name: (e as Error)?.name });
    return json(500, { error: "internal", message: `Unexpected error. Reference ${requestId}.` }, requestId);
  }
}

const MAX_BODY = 32_768;
/** Reads a JSON body with a hard byte cap, also for chunked requests without Content-Length. */
export async function readJson(req: Request): Promise<unknown> {
  let text = "";
  if (req.body) {
    const reader = req.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) {
        await reader.cancel();
        throw new WorkflowFailure(400, "Request body too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new WorkflowFailure(400, "Request body is not valid JSON");
  }
}

export { json };
