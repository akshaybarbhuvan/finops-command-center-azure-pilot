// @vitest-environment node
import { describe, expect, it } from "vitest";
import { acquireLock, closeInterruptedRuns, runSync } from "@/pilot/sync/service";
import { connectorHealth, statusFor } from "@/pilot/queries/portfolio";
import { applyAction } from "@/pilot/workflow/service";
import { actor, fakeClient, seedUsers, SUB_A, SUB_B, testConfig, testDb } from "./helpers";
import { fixtureAdvisor } from "./fixtures/azure";

const NOW = new Date("2026-10-09T06:00:00Z");
const count = async (db: Awaited<ReturnType<typeof testDb>>, sql: string) => Number((await db.get<{ c: number | bigint }>(sql))!.c);

describe("synchronization", () => {
  it("stores inventory, cost and Advisor data for every approved subscription", async () => {
    const db = await testDb();
    const r = await runSync({ db, config: testConfig(), client: fakeClient({ resourcesPerSub: 1200 }), now: () => NOW }, { trigger: "cli" });
    expect(r.outcomes.map((o) => `${o.source}:${o.status}`)).toEqual(["inventory:success", "inventory:success", "cost:success", "cost:success", "advisor:success", "advisor:success"]);
    expect(await count(db, "SELECT COUNT(*) c FROM resources WHERE is_present = 1")).toBe(2400);
    expect(await count(db, "SELECT COUNT(*) c FROM recommendations")).toBe(12);
    expect(await count(db, "SELECT COUNT(*) c FROM cost_daily")).toBe(2 * 2 * 39); // 2 subs × 2 cost types × 39 days (Sep 1 → Oct 9)
    expect(await count(db, "SELECT COUNT(*) c FROM audit_events WHERE action = 'sync.completed'")).toBe(3);
  });

  it("is idempotent and never resets FCC workflow decisions", async () => {
    const db = await testDb();
    const cfg = testConfig();
    const fin = actor(["finops"]);
    const eng = actor(["engineering"]);
    await seedUsers(db, fin, eng);
    await runSync({ db, config: cfg, client: fakeClient({ resourcesPerSub: 10 }), now: () => NOW }, { trigger: "cli" });
    const rec = (await db.get<{ id: string }>("SELECT id FROM recommendations ORDER BY id"))!;
    await applyAction(db, fin, rec.id, { action: "validate", expectedVersion: 1 });
    await applyAction(db, fin, rec.id, { action: "assign", expectedVersion: 2, ownerId: eng.id });
    const before = await db.all("SELECT id, stage, owner_id, version FROM recommendations ORDER BY id");
    await runSync({ db, config: cfg, client: fakeClient({ resourcesPerSub: 10 }), now: () => new Date(NOW.getTime() + 3_600_000) }, { trigger: "cli" });
    expect(await db.all("SELECT id, stage, owner_id, version FROM recommendations ORDER BY id")).toEqual(before);
    expect(await count(db, "SELECT COUNT(*) c FROM recommendations")).toBe(12);
    expect(await count(db, "SELECT COUNT(*) c FROM resources")).toBe(20);
    expect(await count(db, "SELECT COUNT(*) c FROM cost_daily")).toBe(2 * 2 * 39);
  });

  it("keeps the last good data and reports authorization failures truthfully", async () => {
    const db = await testDb();
    const cfg = testConfig();
    await runSync({ db, config: cfg, client: fakeClient({ resourcesPerSub: 5 }), now: () => NOW }, { trigger: "cli" });
    const costBefore = await count(db, `SELECT COUNT(*) c FROM cost_daily WHERE subscription_id = '${SUB_B}'`);
    const later = new Date(NOW.getTime() + 3_600_000);
    const r = await runSync(
      { db, config: cfg, client: fakeClient({ resourcesPerSub: 5, invisibleSubs: [SUB_B], forbiddenCostSubs: [SUB_B], forbiddenAdvisorSubs: [SUB_B] }), now: () => later },
      { trigger: "cli" },
    );
    expect(r.outcomes.filter((o) => o.scope === SUB_B).map((o) => o.status)).toEqual(["unauthorized", "unauthorized", "unauthorized"]);
    expect(await count(db, `SELECT COUNT(*) c FROM cost_daily WHERE subscription_id = '${SUB_B}'`)).toBe(costBefore);
    expect(await count(db, `SELECT COUNT(*) c FROM resources WHERE subscription_id = '${SUB_B}' AND is_present = 1`)).toBe(5); // not wiped
    expect(await count(db, `SELECT COUNT(*) c FROM recommendations WHERE subscription_id = '${SUB_B}' AND source_status = 'active'`)).toBe(6);
    const health = await connectorHealth(db, cfg, later);
    expect(health.find((h) => h.source === "cost" && h.scope === SUB_B)?.status).toBe("unauthorized");
    expect(health.find((h) => h.source === "cost" && h.scope === SUB_A)?.status).toBe("connected");
  });

  it("records partial cost results when one cost type fails, keeping the other", async () => {
    const db = await testDb();
    const r = await runSync({ db, config: testConfig(), client: fakeClient({ failAmortizedFor: [SUB_A] }), now: () => NOW }, { sources: ["cost"], trigger: "cli" });
    const a = r.outcomes.find((o) => o.scope === SUB_A)!;
    expect(a.status).toBe("partial");
    expect(await count(db, `SELECT COUNT(*) c FROM cost_daily WHERE subscription_id='${SUB_A}' AND cost_type='AmortizedCost'`)).toBe(0);
    expect(await count(db, `SELECT COUNT(*) c FROM cost_daily WHERE subscription_id='${SUB_A}' AND cost_type='ActualCost'`)).toBe(39);
  });

  it("marks resources absent and recommendations not-returned only after a complete run", async () => {
    const db = await testDb();
    const cfg = testConfig({ FCC_AZURE_SUBSCRIPTION_IDS: SUB_A });
    await runSync({ db, config: cfg, client: fakeClient({ resourcesPerSub: 10, advisorPerSub: 6 }), now: () => NOW }, { trigger: "cli" });
    await runSync({ db, config: cfg, client: fakeClient({ resourcesPerSub: 8, advisorPerSub: 4 }), now: () => new Date(NOW.getTime() + 60_000) }, { trigger: "cli" });
    expect(await count(db, "SELECT COUNT(*) c FROM resources WHERE is_present = 0")).toBe(2);
    expect(await count(db, "SELECT COUNT(*) c FROM recommendations WHERE source_status = 'not_returned'")).toBe(2);
    // A run with an invalid row is partial and must not reconcile.
    const bad = [...fixtureAdvisor(SUB_A, 2), { id: "not-an-arm-id", properties: {} }];
    const r = await runSync({ db, config: cfg, client: fakeClient({ advisorOverride: () => bad }), now: () => new Date(NOW.getTime() + 120_000) }, { sources: ["advisor"], trigger: "cli" });
    expect(r.outcomes[0].status).toBe("partial");
    expect(await count(db, "SELECT COUNT(*) c FROM recommendations WHERE source_status = 'not_returned'")).toBe(2);
  });

  it("prevents overlapping runs and recovers from crashed ones", async () => {
    const db = await testDb();
    expect(await acquireLock(db, "sync:cost", "holder-1", NOW)).toBe(true);
    const r = await runSync({ db, config: testConfig(), client: fakeClient(), now: () => NOW }, { sources: ["cost"], trigger: "manual" });
    expect(r.skipped).toEqual([{ source: "cost", reason: "already_running" }]);
    expect(r.outcomes).toEqual([]);
    // After the lease expires another holder can take over.
    expect(await acquireLock(db, "sync:cost", "holder-2", new Date(NOW.getTime() + 2 * 3_600_000))).toBe(true);
    await db.run(`INSERT INTO sync_runs (id, source, scope, trigger_kind, started_at, status) VALUES ('r1', 'cost', '${SUB_A}', 'scheduled', '2026-10-01T00:00:00Z', 'running')`);
    await closeInterruptedRuns(db, "cost", NOW);
    expect((await db.get<{ status: string; error_class: string }>("SELECT status, error_class FROM sync_runs WHERE id = 'r1'"))).toEqual({ status: "failed", error_class: "interrupted" });
  });

  it("retries a throttled Cost Management call and succeeds", async () => {
    const db = await testDb();
    const r = await runSync({ db, config: testConfig(), client: fakeClient({ throttleFirstCostCall: true }), now: () => NOW }, { sources: ["cost"], trigger: "cli" });
    expect(r.outcomes.every((o) => o.status === "success")).toBe(true);
  });

  it("derives connector status from run history", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    const ok = (h: number) => ({ status: "success", started_at: new Date(now.getTime() - h * 3_600_000).toISOString(), finished_at: new Date(now.getTime() - h * 3_600_000).toISOString() });
    expect(statusFor(undefined, null, 24, now)).toBe("not_run");
    expect(statusFor(ok(1), "x", 24, now)).toBe("connected");
    expect(statusFor(ok(30), "x", 24, now)).toBe("stale");
    expect(statusFor({ status: "failed", started_at: "x", finished_at: "x" }, "2026-10-01", 24, now)).toBe("failed_using_cached");
    expect(statusFor({ status: "failed", started_at: "x", finished_at: "x" }, null, 24, now)).toBe("unavailable");
    expect(statusFor({ status: "unauthorized", started_at: "x", finished_at: "x" }, "y", 24, now)).toBe("unauthorized");
  });
});

describe("cost series: zero vs no data", () => {
  it("shows trailing days without returned data as no data, not zero", async () => {
    const { costDaily } = await import("@/pilot/queries/portfolio");
    const db = await testDb();
    const cfg = testConfig({ FCC_AZURE_SUBSCRIPTION_IDS: SUB_A });
    // Azure returns data only up to Oct 7 for a window ending Oct 9; Sep 5 is a genuine zero-cost day.
    const client = fakeClient({ costRows: (_s, type, from) => {
      const rows: unknown[][] = [];
      for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse("2026-10-07T00:00:00Z"); t += 86_400_000) {
        const d = new Date(t).toISOString().slice(0, 10);
        if (d !== "2026-09-05") rows.push([type === "ActualCost" ? 10 : 9, Number(d.replace(/-/g, "")), "USD"]);
      }
      return rows;
    } });
    await runSync({ db, config: cfg, client, now: () => NOW }, { sources: ["cost"], trigger: "cli" });
    const s = await costDaily(db, cfg, {});
    const at = (d: string) => s.points.find((p) => p.date === d)!;
    expect(at("2026-09-05").actual).toBe(0);
    expect(at("2026-10-07").actual).toBe(10);
    expect(at("2026-10-08").actual).toBeNull();
    expect(at("2026-10-09").amortized).toBeNull();
  });
});

describe("lock renewal", () => {
  it("renews the lease for its holder and stops when another holder took over", async () => {
    const { renewLock } = await import("@/pilot/sync/service");
    const db = await testDb();
    expect(await acquireLock(db, "sync:x", "h1", NOW)).toBe(true);
    expect(await renewLock(db, "sync:x", "h1", NOW)).toBe(true);
    await db.run(`UPDATE sync_locks SET holder = 'h2' WHERE name = 'sync:x'`);
    expect(await renewLock(db, "sync:x", "h1", NOW)).toBe(false);
  });
});
