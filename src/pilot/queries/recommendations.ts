import type { Actor } from "../auth/principal";
import { recScope } from "../auth/permissions";
import type { Db } from "../db/types";
import type { DbValue } from "../db/types";
import { OPEN_STAGES, PRIORITIES, STAGES, type PilotStage } from "../workflow/rules";
import { approvedClause } from "./scope";

export const PAGE_SIZES = [25, 50, 100] as const;

export interface RecFilters {
  stage?: string; // a stage, or "open"
  category?: string;
  impact?: string;
  priority?: string;
  subscription?: string;
  owner?: string; // "me" | "unassigned" | user id
  sourceStatus?: string; // active | not_returned
  q?: string;
  page?: number;
  pageSize?: number;
  /** Set by the server from configuration (never from user input): currently approved subscriptions. */
  approvedSubscriptions?: string[];
}

export interface RecListRow {
  id: string;
  problem: string;
  impactedName: string | null;
  impactedType: string | null;
  category: string;
  impact: string | null;
  priority: string;
  stage: PilotStage;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  subscriptionId: string;
  sourceStatus: string;
  ticketReference: string | null;
  updatedAt: string;
}

/** Builds the WHERE clause: row-level scope first, then user filters. All values are bound parameters. */
export function recWhere(actor: Actor, f: RecFilters): { where: string; params: Record<string, DbValue> } {
  const scope = recScope(actor);
  const clauses: string[] = [];
  const params: Record<string, DbValue> = {};
  if (scope.kind === "none") clauses.push("1 = 0");
  if (scope.kind === "owned") {
    clauses.push("r.owner_id = @scopeOwner");
    params.scopeOwner = scope.ownerId;
  }
  const ap = approvedClause("r.subscription_id", f.approvedSubscriptions);
  if (ap.sql) {
    clauses.push(ap.sql);
    Object.assign(params, ap.params);
  }
  if (f.stage === "open") clauses.push(`r.stage IN (${OPEN_STAGES.map((s) => `'${s}'`).join(",")})`);
  else if (f.stage && (STAGES as readonly string[]).includes(f.stage)) {
    clauses.push("r.stage = @stage");
    params.stage = f.stage;
  }
  if (f.category && /^[A-Za-z]{1,40}$/.test(f.category)) {
    clauses.push("r.category = @category");
    params.category = f.category;
  }
  if (f.impact && ["High", "Medium", "Low"].includes(f.impact)) {
    clauses.push("r.impact = @impact");
    params.impact = f.impact;
  }
  if (f.priority && (PRIORITIES as readonly string[]).includes(f.priority)) {
    clauses.push("r.priority = @priority");
    params.priority = f.priority;
  }
  if (f.subscription && /^[0-9a-f-]{36}$/i.test(f.subscription)) {
    clauses.push("r.subscription_id = @sub");
    params.sub = f.subscription.toLowerCase();
  }
  if (f.owner === "me") {
    clauses.push("r.owner_id = @me");
    params.me = actor.id;
  } else if (f.owner === "unassigned") clauses.push("r.owner_id IS NULL");
  else if (f.owner && /^[0-9a-f-]{36}$/i.test(f.owner)) {
    clauses.push("r.owner_id = @owner");
    params.owner = f.owner.toLowerCase();
  }
  if (f.sourceStatus === "active" || f.sourceStatus === "not_returned") {
    clauses.push("r.source_status = @ss");
    params.ss = f.sourceStatus;
  }
  const q = (f.q ?? "").trim().slice(0, 100);
  if (q) {
    clauses.push("(LOWER(r.problem) LIKE @q OR LOWER(r.impacted_name) LIKE @q OR LOWER(r.resource_id) LIKE @q OR LOWER(r.ticket_reference) LIKE @q)");
    params.q = `%${q.toLowerCase().replace(/[%_[\]]/g, "")}%`;
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

const ORDER = `ORDER BY CASE r.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, r.updated_at DESC, r.id`;

export async function listRecommendations(db: Db, actor: Actor, f: RecFilters): Promise<{ rows: RecListRow[]; total: number; page: number; pageSize: number }> {
  const pageSize = (PAGE_SIZES as readonly number[]).includes(f.pageSize ?? 0) ? f.pageSize! : 25;
  const page = Math.max(1, Math.min(10_000, Math.floor(f.page ?? 1)));
  const { where, params } = recWhere(actor, f);
  const total = await db.get<{ c: number | bigint }>(`SELECT COUNT(*) AS c FROM recommendations r ${where}`, params);
  const rows = await db.all<Record<string, string | null>>(
    `SELECT r.id, r.problem, r.impacted_name, r.impacted_type, r.category, r.impact, r.priority, r.stage, r.owner_id, u.display_name AS owner_name, r.due_date, r.subscription_id, r.source_status, r.ticket_reference, r.updated_at
     FROM recommendations r LEFT JOIN users u ON u.id = r.owner_id ${where} ${ORDER} ${db.paginate("lim", "off")}`,
    { ...params, lim: pageSize, off: (page - 1) * pageSize },
  );
  return {
    rows: rows.map((r) => ({
      id: r.id!,
      problem: r.problem!,
      impactedName: r.impacted_name,
      impactedType: r.impacted_type,
      category: r.category!,
      impact: r.impact,
      priority: r.priority!,
      stage: r.stage as PilotStage,
      ownerId: r.owner_id,
      ownerName: r.owner_name,
      dueDate: r.due_date,
      subscriptionId: r.subscription_id!,
      sourceStatus: r.source_status!,
      ticketReference: r.ticket_reference,
      updatedAt: r.updated_at!,
    })),
    total: Number(total?.c ?? 0),
    page,
    pageSize,
  };
}

/** Bounded export (scoped exactly like the list). Includes source estimates with explicit currency. */
export async function exportRecommendations(db: Db, actor: Actor, f: RecFilters, max = 10_000) {
  const { where, params } = recWhere(actor, f);
  return db.all<Record<string, string | number | bigint | null>>(
    `SELECT r.id, r.source, r.source_id, r.subscription_id, r.resource_id, r.category, r.impact, r.priority, r.stage, u.display_name AS owner_name, r.due_date, r.problem, r.solution,
            r.est_monthly_micros, r.est_annual_micros, r.est_annual_is_derived, r.est_currency, r.source_status, r.source_last_updated, r.last_seen_at, r.ticket_reference, r.change_reference, r.updated_at
     FROM recommendations r LEFT JOIN users u ON u.id = r.owner_id ${where} ${ORDER} ${db.paginate("lim", "off")}`,
    { ...params, lim: max, off: 0 },
  );
}

export interface RecDetail {
  rec: Record<string, string | number | bigint | null>;
  events: { at: string; actorName: string | null; action: string; fromStage: string | null; toStage: string | null; note: string | null; data: Record<string, unknown> | null }[];
  evidence: { submittedAt: string; submittedBy: string; implementedOn: string; summary: string; url: string | null }[];
  verifications: Record<string, string | number | bigint | null>[];
  resource: { name: string; type: string; resourceGroup: string | null; location: string | null; isPresent: boolean; lastSeenAt: string } | null;
}

/** Returns null when not visible (callers render the same not-found page as for a missing ID). */
export async function getRecommendationDetail(db: Db, actor: Actor, id: string, approvedSubscriptions?: string[]): Promise<RecDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { where, params } = recWhere(actor, { approvedSubscriptions });
  const rec = await db.get<Record<string, string | number | bigint | null>>(
    `SELECT r.*, u.display_name AS owner_name, i.display_name AS implementer_name FROM recommendations r LEFT JOIN users u ON u.id = r.owner_id LEFT JOIN users i ON i.id = r.implemented_by ${where ? `${where} AND` : "WHERE"} r.id = @rid`,
    { ...params, rid: id },
  );
  if (!rec) return null;
  const events = await db.all<Record<string, string | null>>(
    `SELECT e.at, u.display_name AS actor_name, e.action, e.from_stage, e.to_stage, e.note, e.data_json FROM rec_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.rec_id = @id ORDER BY e.rec_version, e.at`,
    { id },
  );
  const evidence = await db.all<Record<string, string | null>>(
    `SELECT e.submitted_at, u.display_name AS submitted_by, e.implemented_on, e.summary, e.url FROM evidence e JOIN users u ON u.id = e.submitted_by WHERE e.rec_id = @id ORDER BY e.submitted_at`,
    { id },
  );
  const verifications = await db.all<Record<string, string | number | bigint | null>>(
    `SELECT v.*, u.display_name AS decided_by_name FROM verifications v JOIN users u ON u.id = v.decided_by WHERE v.rec_id = @id ORDER BY v.decided_at`,
    { id },
  );
  const res = rec.resource_key
    ? await db.get<Record<string, string | number | bigint | null>>(`SELECT name, type, resource_group, location, is_present, last_seen_at FROM resources WHERE resource_key = @k`, { k: rec.resource_key as string })
    : undefined;
  return {
    rec,
    events: events.map((e) => ({
      at: e.at!,
      actorName: e.actor_name,
      action: e.action!,
      fromStage: e.from_stage,
      toStage: e.to_stage,
      note: e.note,
      data: e.data_json ? (JSON.parse(e.data_json) as Record<string, unknown>) : null,
    })),
    evidence: evidence.map((e) => ({ submittedAt: e.submitted_at!, submittedBy: e.submitted_by!, implementedOn: e.implemented_on!, summary: e.summary!, url: e.url })),
    verifications,
    resource: res
      ? { name: String(res.name), type: String(res.type), resourceGroup: (res.resource_group as string) ?? null, location: (res.location as string) ?? null, isPresent: Number(res.is_present) === 1, lastSeenAt: String(res.last_seen_at) }
      : null,
  };
}

export async function assignableOwners(db: Db) {
  const rows = await db.all<{ id: string; display_name: string; email: string | null; roles: string }>(`SELECT id, display_name, email, roles FROM users ORDER BY display_name`);
  return rows.filter((r) => r.roles.split(",").includes("engineering")).map((r) => ({ id: r.id, name: r.display_name, email: r.email }));
}
