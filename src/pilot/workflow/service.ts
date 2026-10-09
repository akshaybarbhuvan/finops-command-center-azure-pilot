// Persists workflow actions. Every call: row-level scope → role/stage rules → optimistic concurrency →
// one transaction updating the recommendation, its history, evidence/verification and the audit log.
import type { Actor } from "../auth/principal";
import { recScope } from "../auth/permissions";
import type { Db } from "../db/types";
import { newId } from "../ids";
import { toMicros } from "../money";
import { ACTIONS, ActionInput, availability, checkWindows, monthlySavingsMicros, type PilotStage } from "./rules";
import { approvedClause } from "../queries/scope";

export class WorkflowFailure extends Error {
  constructor(
    public status: 400 | 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

interface RecRow {
  id: string;
  stage: PilotStage;
  owner_id: string | null;
  ticket_reference: string | null;
  implemented_by: string | null;
  est_currency: string | null;
  version: number | bigint;
}

const NOT_FOUND = (id: string) => new WorkflowFailure(404, `Recommendation ${id.slice(0, 64)} was not found`);

/** Loads a recommendation only if the actor may see it. Out-of-scope and missing records are indistinguishable. */
export async function loadVisibleRec(db: Db, actor: Actor, id: string, approvedSubscriptions?: string[]): Promise<RecRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw NOT_FOUND(id);
  const scope = recScope(actor);
  if (scope.kind === "none") throw NOT_FOUND(id);
  const ap = approvedClause("subscription_id", approvedSubscriptions);
  const row = await db.get<RecRow>(
    `SELECT id, stage, owner_id, ticket_reference, implemented_by, est_currency, version FROM recommendations WHERE id = @id${scope.kind === "owned" ? " AND owner_id = @owner" : ""}${ap.sql ? ` AND ${ap.sql}` : ""}`,
    { id, ...(scope.kind === "owned" ? { owner: scope.ownerId } : {}), ...ap.params },
  );
  if (!row) throw NOT_FOUND(id);
  return row;
}

export interface ActionResult {
  id: string;
  stage: PilotStage;
  version: number;
}

export async function applyAction(db: Db, actor: Actor, recId: string, raw: unknown, now = new Date(), approvedSubscriptions?: string[]): Promise<ActionResult> {
  const parsed = ActionInput.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new WorkflowFailure(400, `Invalid input${first?.path?.length ? ` (${first.path.join(".")})` : ""}: ${first?.message ?? "malformed request"}`);
  }
  const input = parsed.data;
  const at = now.toISOString();
  const today = at.slice(0, 10);

  return db.tx(async (t) => {
    const rec = await loadVisibleRec(t, actor, recId, approvedSubscriptions);
    const av = availability(input.action, { stage: rec.stage, ownerId: rec.owner_id, ticketReference: rec.ticket_reference, implementedBy: rec.implemented_by }, actor);
    if (!av.allowed) throw new WorkflowFailure(av.code === "forbidden" ? 403 : 409, av.reason);
    if (Number(rec.version) !== input.expectedVersion) throw new WorkflowFailure(409, "This recommendation was changed by someone else. Reload and try again.");

    const rule = ACTIONS[input.action];
    const to: PilotStage = rule.to ?? rec.stage;
    const set: Record<string, string | number | bigint | null> = {};
    let note: string | null = null;
    let data: Record<string, unknown> | null = null;

    switch (input.action) {
      case "validate":
      case "start":
        note = input.note || null;
        break;
      case "assign": {
        const owner = await t.get<{ roles: string; display_name: string }>(`SELECT roles, display_name FROM users WHERE id = @id`, { id: input.ownerId.toLowerCase() });
        if (!owner || !owner.roles.split(",").includes("engineering")) {
          throw new WorkflowFailure(422, "The owner must be a user with the FCC.Engineering role who has signed in to FCC at least once");
        }
        if (input.dueDate && input.dueDate < today) throw new WorkflowFailure(422, "The due date cannot be in the past");
        set.owner_id = input.ownerId.toLowerCase();
        set.due_date = input.dueDate ?? null;
        data = { ownerId: set.owner_id, ownerName: owner.display_name, dueDate: set.due_date, previousOwnerId: rec.owner_id };
        break;
      }
      case "set_priority":
        set.priority = input.priority;
        data = { priority: input.priority };
        break;
      case "record_ticket":
        set.ticket_reference = input.reference;
        set.ticket_url = input.url ?? null;
        data = { reference: input.reference, url: input.url ?? null, verifiedExternally: false };
        break;
      case "submit":
        set.remediation_plan = input.plan;
        note = input.plan;
        break;
      case "record_change":
        set.change_reference = input.reference;
        note = input.note || null;
        data = { reference: input.reference, verifiedExternally: false };
        break;
      case "send_back":
      case "reject":
      case "defer":
      case "decline_verification":
        note = input.reason;
        break;
      case "implement": {
        if (input.implementedOn > today) throw new WorkflowFailure(422, "The implementation date cannot be in the future");
        set.implemented_by = actor.id;
        await t.run(`INSERT INTO evidence (id, rec_id, submitted_by, submitted_at, implemented_on, summary, url) VALUES (@id, @r, @by, @at, @on, @s, @u)`, {
          id: newId(),
          r: rec.id,
          by: actor.id,
          at,
          on: input.implementedOn,
          s: input.summary,
          u: input.url ?? null,
        });
        note = input.summary;
        break;
      }
      case "verify": {
        const ev = await t.get<{ implemented_on: string }>(`SELECT implemented_on FROM evidence WHERE rec_id = @r ORDER BY submitted_at DESC`, { r: rec.id });
        if (!ev) throw new WorkflowFailure(409, "No implementation evidence has been submitted");
        const w = checkWindows(input, ev.implemented_on, today);
        if (!w.ok) throw new WorkflowFailure(422, w.reason);
        if (rec.est_currency && rec.est_currency !== input.currency) throw new WorkflowFailure(422, `Currency must match the recommendation's currency (${rec.est_currency})`);
        const b = toMicros(input.baselineCost);
        const p = toMicros(input.postCost);
        const monthly = monthlySavingsMicros(b, w.baselineDays, p, w.postDays);
        if (monthly <= 0n) throw new WorkflowFailure(422, "The measured cost did not decrease; record 'savings not verified' instead");
        await t.run(
          `INSERT INTO verifications (id, rec_id, decided_by, decided_at, decision, currency, baseline_from, baseline_to, baseline_cost_micros, post_from, post_to, post_cost_micros, monthly_savings_micros, method, source_reference, notes, reason)
           VALUES (@id, @r, @by, @at, 'verified', @c, @bf, @bt, @b, @pf, @pt, @p, @m, @meth, @src, @notes, NULL)`,
          { id: newId(), r: rec.id, by: actor.id, at, c: input.currency, bf: input.baselineFrom, bt: input.baselineTo, b, pf: input.postFrom, pt: input.postTo, p, m: monthly, meth: input.method, src: input.sourceReference, notes: input.notes ?? null },
        );
        data = { currency: input.currency, monthlySavingsMicros: monthly.toString(), baselineDays: w.baselineDays, postDays: w.postDays, method: input.method };
        break;
      }
      case "reopen":
      case "close":
        break;
      case "comment":
        note = input.body;
        break;
    }
    if (input.action === "decline_verification") {
      await t.run(`INSERT INTO verifications (id, rec_id, decided_by, decided_at, decision, reason) VALUES (@id, @r, @by, @at, 'not_verified', @why)`, { id: newId(), r: rec.id, by: actor.id, at, why: input.reason });
    }

    const assignments = Object.keys(set)
      .map((k) => `${k} = @set_${k}`)
      .concat(["stage = @to", "version = version + 1", "updated_at = @at"]);
    const params: Record<string, string | number | bigint | null> = { id: rec.id, v: Number(rec.version), to, at };
    for (const [k, v] of Object.entries(set)) params[`set_${k}`] = v;
    const u = await t.run(`UPDATE recommendations SET ${assignments.join(", ")} WHERE id = @id AND version = @v`, params);
    if (u.changes !== 1) throw new WorkflowFailure(409, "This recommendation was changed by someone else. Reload and try again.");

    await t.run(`INSERT INTO rec_events (id, rec_id, rec_version, at, actor_id, action, from_stage, to_stage, note, data_json) VALUES (@id, @r, @rv, @at, @by, @a, @f, @to, @n, @d)`, {
      id: newId(),
      r: rec.id,
      rv: Number(rec.version) + 1,
      at,
      by: actor.id,
      a: input.action,
      f: rec.stage,
      to,
      n: note,
      d: data ? JSON.stringify(data) : null,
    });
    await t.run(`INSERT INTO audit_events (id, at, actor_id, action, target_type, target_id, detail_json) VALUES (@id, @at, @by, @a, 'recommendation', @r, @d)`, {
      id: newId(),
      at,
      by: actor.id,
      a: `recommendation.${input.action}`,
      r: rec.id,
      d: JSON.stringify({ from: rec.stage, to, ...(data ?? {}) }),
    });
    return { id: rec.id, stage: to, version: Number(rec.version) + 1 };
  });
}
