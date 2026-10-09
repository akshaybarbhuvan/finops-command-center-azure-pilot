// Synchronization of Azure sources into the FCC database.
//
// Policies (documented in docs/OPERATIONS.md):
// - One run record per source and approved subscription; status success | partial | failed | unauthorized.
// - A failed or partial run never deletes previously stored data. Resources are marked absent, and Advisor
//   recommendations marked "not returned", only after a COMPLETE successful run for that subscription.
// - Cost rows for a subscription and cost type are replaced inside the queried window only after that window was
//   fetched completely (Azure can restate recent days); other windows are untouched.
// - Re-running is idempotent: identities are source IDs (hashed), never display names. FCC workflow fields
//   (stage, owner, ticket, evidence, verification) are never modified by synchronization.
// - Overlapping runs are prevented with a database lease lock per source, so this is safe with several app instances.
import type { PilotConfig } from "../config";
import type { Db } from "../db/types";
import { newId } from "../ids";
import { log } from "../log";
import { ConnectorError, type ArmClient } from "../azure/arm";
import { inventoryPages, subscriptionVisible } from "../azure/resourceGraph";
import { COST_TYPES, defaultCostWindow, queryDailyCost, type CostType, type DailyCost } from "../azure/costManagement";
import { listAdvisor } from "../azure/advisor";

export type SyncSource = "inventory" | "cost" | "advisor";
export const SYNC_SOURCES: SyncSource[] = ["inventory", "cost", "advisor"];
export type SyncStatus = "success" | "partial" | "failed" | "unauthorized";
export type Trigger = "manual" | "scheduled" | "cli";

export interface SyncDeps {
  db: Db;
  config: PilotConfig;
  client: ArmClient;
  now?: () => Date;
  signal?: AbortSignal;
}

export interface SyncOutcome {
  source: SyncSource;
  scope: string;
  runId: string;
  status: SyncStatus;
  recordsRead: number;
  recordsWritten: number;
  errorClass?: string;
  errorDetail?: string;
}

export interface SyncReport {
  outcomes: SyncOutcome[];
  skipped: { source: SyncSource; reason: "already_running" }[];
}

const LOCK_TTL_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------------------------
// Locks and run records
// ---------------------------------------------------------------------------------------------------------------

export async function acquireLock(db: Db, name: string, holder: string, now: Date, ttlMs = LOCK_TTL_MS): Promise<boolean> {
  const at = now.toISOString();
  const exp = new Date(now.getTime() + ttlMs).toISOString();
  try {
    await db.run(`INSERT INTO sync_locks (name, holder, acquired_at, expires_at) VALUES (@n, @h, @a, @e)`, { n: name, h: holder, a: at, e: exp });
    return true;
  } catch {
    // Row exists: take it over only if the previous lease has expired (holder crashed).
    const r = await db.run(`UPDATE sync_locks SET holder = @h, acquired_at = @a, expires_at = @e WHERE name = @n AND expires_at < @a`, { n: name, h: holder, a: at, e: exp });
    return r.changes === 1;
  }
}

/** Extends a held lease. Returns false if another holder took over (the caller must stop). */
export async function renewLock(db: Db, name: string, holder: string, now: Date, ttlMs = LOCK_TTL_MS): Promise<boolean> {
  const r = await db.run(`UPDATE sync_locks SET expires_at = @e WHERE name = @n AND holder = @h`, { n: name, h: holder, e: new Date(now.getTime() + ttlMs).toISOString() });
  return r.changes === 1;
}

export async function releaseLock(db: Db, name: string, holder: string) {
  await db.run(`DELETE FROM sync_locks WHERE name = @n AND holder = @h`, { n: name, h: holder });
}

async function startRun(db: Db, source: SyncSource, scope: string, trigger: Trigger, triggeredBy: string | null, now: Date) {
  const id = newId();
  await db.run(
    `INSERT INTO sync_runs (id, source, scope, trigger_kind, triggered_by, started_at, status, records_read, records_written) VALUES (@id, @s, @sc, @t, @by, @at, 'running', 0, 0)`,
    { id, s: source, sc: scope, t: trigger, by: triggeredBy, at: now.toISOString() },
  );
  return id;
}

async function finishRun(db: Db, o: SyncOutcome, now: Date) {
  await db.run(
    `UPDATE sync_runs SET finished_at = @f, status = @st, records_read = @rr, records_written = @rw, error_class = @ec, error_detail = @ed WHERE id = @id`,
    { id: o.runId, f: now.toISOString(), st: o.status, rr: o.recordsRead, rw: o.recordsWritten, ec: o.errorClass ?? null, ed: o.errorDetail?.slice(0, 1000) ?? null },
  );
}

/** Runs left in 'running' by a crashed process are closed as failed so health status stays truthful. */
export async function closeInterruptedRuns(db: Db, source: SyncSource, now: Date) {
  const cutoff = new Date(now.getTime() - LOCK_TTL_MS).toISOString();
  await db.run(
    `UPDATE sync_runs SET status = 'failed', finished_at = @f, error_class = 'interrupted', error_detail = 'The run did not finish (process stopped or timed out).' WHERE source = @s AND status = 'running' AND started_at < @c`,
    { s: source, f: now.toISOString(), c: cutoff },
  );
}

function failure(e: unknown): Pick<SyncOutcome, "status" | "errorClass" | "errorDetail"> {
  if (e instanceof ConnectorError) {
    return { status: e.isAuthorization ? "unauthorized" : "failed", errorClass: e.kind, errorDetail: e.message };
  }
  return { status: "failed", errorClass: "internal", errorDetail: "Unexpected error while storing data (see application logs)" };
}

// ---------------------------------------------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------------------------------------------

async function syncInventory(d: SyncDeps, sub: string, runId: string, now: Date): Promise<Omit<SyncOutcome, "source" | "scope" | "runId">> {
  let read = 0;
  let written = 0;
  let rejected = 0;
  try {
    if (!(await subscriptionVisible(d.client, sub, d.signal))) {
      return { status: "unauthorized", recordsRead: 0, recordsWritten: 0, errorClass: "forbidden", errorDetail: "The subscription is not visible to the application identity (Reader role missing or wrong subscription ID)." };
    }
    for await (const page of inventoryPages(d.client, sub, d.config.maxResources, d.signal)) {
      read += page.resources.length + page.rejected;
      rejected += page.rejected;
      await d.db.tx(async (t) => {
        for (const r of page.resources) {
          const p = {
            k: r.resourceKey,
            id: r.resourceId,
            sub: r.subscriptionId,
            rg: r.resourceGroup,
            n: r.name,
            ty: r.type,
            loc: r.location,
            kind: r.kind,
            sku: r.skuName,
            tags: JSON.stringify(r.tags),
            now: now.toISOString(),
            run: runId,
          };
          const u = await t.run(
            `UPDATE resources SET resource_id=@id, subscription_id=@sub, resource_group=@rg, name=@n, type=@ty, location=@loc, kind=@kind, sku_name=@sku, tags_json=@tags, is_present=1, last_seen_at=@now, last_sync_run_id=@run WHERE resource_key=@k`,
            p,
          );
          if (u.changes === 0) {
            await t.run(
              `INSERT INTO resources (resource_key, resource_id, subscription_id, resource_group, name, type, location, kind, sku_name, tags_json, is_present, first_seen_at, last_seen_at, last_sync_run_id) VALUES (@k, @id, @sub, @rg, @n, @ty, @loc, @kind, @sku, @tags, 1, @now, @now, @run)`,
              p,
            );
          }
          written++;
        }
      });
    }
  } catch (e) {
    return { ...failure(e), recordsRead: read, recordsWritten: written };
  }
  if (rejected) {
    return { status: "partial", recordsRead: read, recordsWritten: written, errorClass: "invalid_rows", errorDetail: `${rejected} rows failed validation and were skipped; absent-resource reconciliation was not applied.` };
  }
  // Complete run: anything in this subscription not seen in this run is no longer present (deleted, moved or inaccessible).
  await d.db.run(`UPDATE resources SET is_present = 0 WHERE subscription_id = @s AND is_present = 1 AND last_sync_run_id <> @run`, { s: sub, run: runId });
  return { status: "success", recordsRead: read, recordsWritten: written };
}

// ---------------------------------------------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------------------------------------------

async function syncCost(d: SyncDeps, sub: string, runId: string, now: Date): Promise<Omit<SyncOutcome, "source" | "scope" | "runId">> {
  const window = defaultCostWindow(now);
  const fetched: { type: CostType; rows: DailyCost[] }[] = [];
  const errors: unknown[] = [];
  for (const type of COST_TYPES) {
    try {
      fetched.push({ type, rows: await queryDailyCost(d.client, sub, type, window, d.config.costAggregationColumn, d.signal) });
    } catch (e) {
      errors.push(e);
    }
  }
  let written = 0;
  if (fetched.length) {
    await d.db.tx(async (t) => {
      for (const f of fetched) {
        await t.run(`DELETE FROM cost_daily WHERE subscription_id=@s AND cost_type=@t AND usage_date >= @from AND usage_date <= @to`, { s: sub, t: f.type, from: window.from, to: window.to });
        for (const r of f.rows) {
          await t.run(
            `INSERT INTO cost_daily (subscription_id, usage_date, cost_type, currency, amount_micros, sync_run_id, retrieved_at) VALUES (@s, @d, @t, @c, @a, @run, @now)`,
            { s: sub, d: r.date, t: f.type, c: r.currency, a: r.micros, run: runId, now: now.toISOString() },
          );
          written++;
        }
        const u = await t.run(`UPDATE cost_windows SET from_date=@from, to_date=@to, retrieved_at=@now, sync_run_id=@run WHERE subscription_id=@s AND cost_type=@t`, {
          s: sub,
          t: f.type,
          from: window.from,
          to: window.to,
          now: now.toISOString(),
          run: runId,
        });
        if (u.changes === 0) {
          await t.run(`INSERT INTO cost_windows (subscription_id, cost_type, from_date, to_date, retrieved_at, sync_run_id) VALUES (@s, @t, @from, @to, @now, @run)`, {
            s: sub,
            t: f.type,
            from: window.from,
            to: window.to,
            now: now.toISOString(),
            run: runId,
          });
        }
      }
    });
  }
  const read = fetched.reduce((n, f) => n + f.rows.length, 0);
  if (!errors.length) return { status: "success", recordsRead: read, recordsWritten: written };
  const f = failure(errors[0]);
  if (fetched.length) {
    return { status: "partial", recordsRead: read, recordsWritten: written, errorClass: f.errorClass, errorDetail: `${fetched.map((x) => x.type).join(", ")} stored; other cost type failed: ${f.errorDetail}` };
  }
  return { ...f, recordsRead: 0, recordsWritten: 0 };
}

// ---------------------------------------------------------------------------------------------------------------
// Advisor
// ---------------------------------------------------------------------------------------------------------------

const PRIORITY_FROM_IMPACT: Record<string, string> = { High: "High", Medium: "Medium", Low: "Low" };

async function syncAdvisor(d: SyncDeps, sub: string, runId: string, now: Date): Promise<Omit<SyncOutcome, "source" | "scope" | "runId">> {
  let fetched;
  try {
    fetched = await listAdvisor(d.client, sub, d.config.advisorCategories, d.signal);
  } catch (e) {
    return { ...failure(e), recordsRead: 0, recordsWritten: 0 };
  }
  const at = now.toISOString();
  let inserted = 0;
  let updated = 0;
  await d.db.tx(async (t) => {
    for (const r of fetched.items) {
      const src = {
        key: r.sourceKey,
        sid: r.sourceId,
        sub: r.subscriptionId,
        rid: r.resourceId,
        rkey: r.resourceKey,
        ity: r.impactedType,
        inm: r.impactedName,
        cat: r.category,
        imp: r.impact,
        prob: r.problem,
        sol: r.solution,
        rtid: r.recommendationTypeId,
        learn: r.learnMoreUrl,
        slu: r.sourceLastUpdated,
        em: r.estimate?.monthlyMicros ?? null,
        ea: r.estimate?.annualMicros ?? null,
        ed: r.estimate?.annualIsDerived ? 1 : 0,
        ec: r.estimate?.currency ?? null,
        now: at,
        run: runId,
      };
      // Source fields only. Workflow fields (stage, owner, references, version) are never touched here.
      const u = await t.run(
        `UPDATE recommendations SET source_id=@sid, subscription_id=@sub, resource_id=@rid, resource_key=@rkey, impacted_type=@ity, impacted_name=@inm, category=@cat, impact=@imp, problem=@prob, solution=@sol, recommendation_type_id=@rtid, learn_more_url=@learn, source_last_updated=@slu, est_monthly_micros=@em, est_annual_micros=@ea, est_annual_is_derived=@ed, est_currency=@ec, source_status='active', last_seen_at=@now, last_sync_run_id=@run WHERE source='azure_advisor' AND source_key=@key`,
        src,
      );
      if (u.changes > 0) {
        updated++;
        continue;
      }
      const id = newId();
      await t.run(
        `INSERT INTO recommendations (id, source, source_key, source_id, subscription_id, resource_id, resource_key, impacted_type, impacted_name, category, impact, problem, solution, recommendation_type_id, learn_more_url, source_last_updated, est_monthly_micros, est_annual_micros, est_annual_is_derived, est_currency, source_status, first_seen_at, last_seen_at, last_sync_run_id, stage, priority, version, created_at, updated_at)
         VALUES (@id, 'azure_advisor', @key, @sid, @sub, @rid, @rkey, @ity, @inm, @cat, @imp, @prob, @sol, @rtid, @learn, @slu, @em, @ea, @ed, @ec, 'active', @now, @now, @run, 'identified', @prio, 1, @now, @now)`,
        { ...src, id, prio: PRIORITY_FROM_IMPACT[r.impact ?? ""] ?? "Medium" },
      );
      await t.run(`INSERT INTO rec_events (id, rec_id, rec_version, at, actor_id, action, from_stage, to_stage, note, data_json) VALUES (@e, @r, 1, @now, NULL, 'ingested', NULL, 'identified', @note, NULL)`, {
        e: newId(),
        r: id,
        now: at,
        note: "Imported from Azure Advisor",
      });
      inserted++;
    }
    if (!fetched.rejected) {
      await t.run(
        `UPDATE recommendations SET source_status='not_returned' WHERE source='azure_advisor' AND subscription_id=@s AND source_status='active' AND last_sync_run_id <> @run`,
        { s: sub, run: runId },
      );
    }
  });
  const read = fetched.items.length + fetched.rejected;
  if (fetched.rejected) {
    return { status: "partial", recordsRead: read, recordsWritten: inserted + updated, errorClass: "invalid_rows", errorDetail: `${fetched.rejected} recommendations failed validation and were skipped; "not returned" reconciliation was not applied.` };
  }
  return { status: "success", recordsRead: read, recordsWritten: inserted + updated };
}

// ---------------------------------------------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------------------------------------------

const RUNNERS = { inventory: syncInventory, cost: syncCost, advisor: syncAdvisor };

export async function runSync(d: SyncDeps, opts: { sources?: SyncSource[]; trigger: Trigger; triggeredBy?: string | null }): Promise<SyncReport> {
  const now = d.now ?? (() => new Date());
  const report: SyncReport = { outcomes: [], skipped: [] };
  for (const source of opts.sources ?? SYNC_SOURCES) {
    const holder = newId();
    const lock = `sync:${source}`;
    await closeInterruptedRuns(d.db, source, now());
    if (!(await acquireLock(d.db, lock, holder, now()))) {
      report.skipped.push({ source, reason: "already_running" });
      continue;
    }
    try {
      for (const sub of d.config.subscriptionIds) {
        if (d.signal?.aborted) break;
        if (!(await renewLock(d.db, lock, holder, now()))) {
          log.warn("sync.lock_lost", { source });
          report.skipped.push({ source, reason: "already_running" });
          break;
        }
        const runId = await startRun(d.db, source, sub, opts.trigger, opts.triggeredBy ?? null, now());
        let result: Omit<SyncOutcome, "source" | "scope" | "runId">;
        try {
          result = await RUNNERS[source](d, sub, runId, now());
        } catch (e) {
          log.error("sync.store_failed", { source, runId, error: (e as Error)?.message });
          result = { ...failure(e), recordsRead: 0, recordsWritten: 0 };
        }
        const outcome: SyncOutcome = { source, scope: sub, runId, ...result };
        await finishRun(d.db, outcome, now());
        report.outcomes.push(outcome);
        log.info("sync.run", { source, runId, status: outcome.status, read: outcome.recordsRead, written: outcome.recordsWritten, errorClass: outcome.errorClass });
      }
      await d.db.run(`INSERT INTO audit_events (id, at, actor_id, action, target_type, target_id, detail_json) VALUES (@id, @at, @by, 'sync.completed', 'source', @s, @detail)`, {
        id: newId(),
        at: now().toISOString(),
        by: opts.triggeredBy ?? null,
        s: source,
        detail: JSON.stringify({
          trigger: opts.trigger,
          runs: report.outcomes.filter((o) => o.source === source).map((o) => ({ runId: o.runId, status: o.status, written: o.recordsWritten })),
        }),
      });
    } finally {
      await releaseLock(d.db, lock, holder);
    }
  }
  return report;
}
