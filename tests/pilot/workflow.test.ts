// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyAction, WorkflowFailure } from "@/pilot/workflow/service";
import { monthlySavingsMicros, checkWindows } from "@/pilot/workflow/rules";
import { pipeline, verifiedSavings } from "@/pilot/queries/portfolio";
import { getRecommendationDetail, listRecommendations } from "@/pilot/queries/recommendations";
import { runSync } from "@/pilot/sync/service";
import type { Db } from "@/pilot/db/types";
import { actor, fakeClient, seedUsers, testConfig, testDb } from "./helpers";

const NOW = new Date("2026-10-09T06:00:00Z");
const exec = actor(["executive"], "Erin Exec");
const fin = actor(["finops"], "Fran FinOps");
const fin2 = actor(["finops"], "Felix FinOps");
const engA = actor(["engineering"], "Priya Eng");
const engB = actor(["engineering"], "Marcus Eng");
const admin = actor(["admin"], "Avery Admin");
const finEng = actor(["finops", "engineering"], "Dual Role");

let db: Db;
let recId: string;
let version: number;

async function act(a: typeof fin, body: Record<string, unknown>, at = NOW) {
  const r = await applyAction(db, a, recId, { expectedVersion: version, ...body }, at);
  version = r.version;
  return r;
}
const fails = async (p: Promise<unknown>, status: number, msg?: RegExp) => {
  const e = await p.then(() => null).catch((x) => x as WorkflowFailure);
  expect(e, "expected a WorkflowFailure").toBeInstanceOf(WorkflowFailure);
  expect(e!.status).toBe(status);
  if (msg) expect(e!.message).toMatch(msg);
};

beforeEach(async () => {
  db = await testDb();
  await seedUsers(db, exec, fin, fin2, engA, engB, admin, finEng);
  await runSync({ db, config: testConfig(), client: fakeClient({ resourcesPerSub: 5, advisorPerSub: 6 }), now: () => NOW }, { sources: ["advisor"], trigger: "cli" });
  // A recommendation with a USD estimate.
  recId = (await db.get<{ id: string }>("SELECT id FROM recommendations WHERE est_currency = 'USD' ORDER BY id"))!.id;
  version = 1;
});

async function toImplemented(owner = engA) {
  await act(fin, { action: "validate" });
  await act(fin, { action: "assign", ownerId: owner.id, dueDate: "2026-11-30" });
  await act(owner, { action: "start" });
  await act(owner, { action: "record_ticket", reference: "CHG-1234", url: "https://tickets.fixture.invalid/CHG-1234" });
  await act(owner, { action: "submit", plan: "Resize during the Saturday window; rollback documented." });
  await act(owner, { action: "record_change", reference: "CAB-2026-0042" });
  await act(owner, { action: "implement", implementedOn: "2026-09-10", summary: "Resized to D2s_v5; monitoring normal for 48 hours." });
}
const verification = {
  action: "verify",
  currency: "USD",
  baselineFrom: "2026-08-10",
  baselineTo: "2026-09-08",
  baselineCost: "3000.00",
  postFrom: "2026-09-11",
  postTo: "2026-10-08",
  postCost: "1400.00",
  method: "cost_management_before_after",
  sourceReference: "Cost Management saved view 'fixture-rightsize'",
};

describe("pilot workflow — end to end", () => {
  it("runs validate → assign → accept → ticket → plan → change approval → evidence → verify → close with full history", async () => {
    await toImplemented();
    const v = await act(fin, verification);
    expect(v.stage).toBe("verified");
    await act(fin, { action: "close" });
    const d = (await getRecommendationDetail(db, fin, recId))!;
    expect(d.rec.stage).toBe("closed");
    expect(d.rec.ticket_reference).toBe("CHG-1234");
    expect(d.rec.change_reference).toBe("CAB-2026-0042");
    expect(d.evidence).toHaveLength(1);
    expect(d.verifications[0]).toMatchObject({ decision: "verified", currency: "USD" });
    // (3000/30 - 1400/28) × 30.4375 = (100 - 50) × 30.4375 = 1521.875
    expect(BigInt(d.verifications[0].monthly_savings_micros as bigint)).toBe(1_521_875_000n);
    expect(d.events.map((e) => e.action)).toEqual(["ingested", "validate", "assign", "start", "record_ticket", "submit", "record_change", "implement", "verify", "close"]);
    expect(Number((await db.get<{ c: number | bigint }>(`SELECT COUNT(*) c FROM audit_events WHERE target_id = '${recId}'`))!.c)).toBe(9);
    const vs = await verifiedSavings(db);
    expect(vs).toMatchObject({ count: 1, monthly: { USD: 1_521_875_000n } });
  });
});

describe("authorization and separation of duties", () => {
  it("executives and administrators cannot change anything", async () => {
    for (const a of [exec, admin]) {
      await fails(applyAction(db, a, recId, { action: "validate", expectedVersion: 1 }), 403);
      await fails(applyAction(db, a, recId, { action: "comment", expectedVersion: 1, body: "hello" }), 403);
    }
  });
  it("engineers cannot see or act on records they do not own (indistinguishable from missing)", async () => {
    await act(fin, { action: "validate" });
    await act(fin, { action: "assign", ownerId: engA.id });
    await fails(applyAction(db, engB, recId, { action: "start", expectedVersion: version }), 404, /not found/);
    await fails(applyAction(db, engB, "00000000-0000-0000-0000-000000000000", { action: "start", expectedVersion: 1 }), 404, /not found/);
    expect(await getRecommendationDetail(db, engB, recId)).toBeNull();
    expect((await listRecommendations(db, engB, { q: "" })).total).toBe(0);
    expect((await listRecommendations(db, engA, {})).rows.map((r) => r.id)).toEqual([recId]);
  });
  it("only FinOps routes work, and only to an Engineering user who has signed in", async () => {
    await fails(applyAction(db, engA, recId, { action: "validate", expectedVersion: 1 }), 404); // engineer cannot even see unassigned work
    await act(fin, { action: "validate" });
    await fails(applyAction(db, fin, recId, { action: "assign", expectedVersion: version, ownerId: exec.id }), 422, /Engineering role/);
    await fails(applyAction(db, fin, recId, { action: "assign", expectedVersion: version, ownerId: "00000000-0000-0000-0000-00000000ffff" }), 422);
  });
  it("blocks invalid transitions and stale versions", async () => {
    await fails(applyAction(db, fin, recId, { action: "close", expectedVersion: 1 }), 409, /Not available/);
    await fails(applyAction(db, fin, recId, { action: "validate", expectedVersion: 7 }), 409, /changed by someone else/);
    await act(fin, { action: "validate" });
    await act(fin, { action: "assign", ownerId: engA.id });
    await act(engA, { action: "start" });
    await fails(applyAction(db, engA, recId, { action: "submit", expectedVersion: version, plan: "A plan without a ticket" }), 409, /ticket reference/);
  });
  it("rejects malformed and over-posted input", async () => {
    await fails(applyAction(db, fin, recId, { action: "validate", expectedVersion: 1, stage: "verified" }), 400);
    await fails(applyAction(db, fin, recId, { action: "drop_table", expectedVersion: 1 }), 400);
    await act(fin, { action: "validate" });
    await act(fin, { action: "assign", ownerId: engA.id });
    await act(engA, { action: "start" });
    await fails(applyAction(db, engA, recId, { action: "record_ticket", expectedVersion: version, reference: "OK-1", url: "javascript:alert(1)" }), 400);
    await fails(applyAction(db, engA, recId, { action: "record_ticket", expectedVersion: version, reference: "<script>" }), 400);
  });
  it("the owner or implementer can never verify their own savings, even holding the FinOps role", async () => {
    await toImplemented(finEng);
    await fails(applyAction(db, finEng, recId, { ...verification, expectedVersion: version }), 403, /Separation of duties/);
    await fails(applyAction(db, finEng, recId, { action: "decline_verification", expectedVersion: version, reason: "Self-review attempt" }), 403);
    await act(fin, verification);
  });
  it("engineers cannot verify, close or reopen", async () => {
    await toImplemented();
    await fails(applyAction(db, engA, recId, { ...verification, expectedVersion: version }), 403);
  });
});

describe("savings verification policy", () => {
  it("computes monthly-normalized savings exactly", () => {
    expect(monthlySavingsMicros(3_000_000_000n, 30, 1_400_000_000n, 28)).toBe(1_521_875_000n);
  });
  it("requires windows of at least 7 days on the right sides of the implementation date", () => {
    expect(checkWindows({ baselineFrom: "2026-09-01", baselineTo: "2026-09-05", postFrom: "2026-09-11", postTo: "2026-10-01" }, "2026-09-10", "2026-10-09").ok).toBe(false);
    expect(checkWindows({ baselineFrom: "2026-08-01", baselineTo: "2026-09-10", postFrom: "2026-09-11", postTo: "2026-10-01" }, "2026-09-10", "2026-10-09").ok).toBe(false);
    expect(checkWindows({ baselineFrom: "2026-08-01", baselineTo: "2026-09-09", postFrom: "2026-09-10", postTo: "2026-10-01" }, "2026-09-10", "2026-10-09").ok).toBe(false);
    expect(checkWindows({ baselineFrom: "2026-08-01", baselineTo: "2026-09-09", postFrom: "2026-09-11", postTo: "2026-10-20" }, "2026-09-10", "2026-10-09").ok).toBe(false);
    expect(checkWindows({ baselineFrom: "2026-08-01", baselineTo: "2026-09-09", postFrom: "2026-09-11", postTo: "2026-10-01" }, "2026-09-10", "2026-10-09").ok).toBe(true);
  });
  it("refuses a 'verified' decision without a measured decrease, wrong currency or future window", async () => {
    await toImplemented();
    await fails(applyAction(db, fin, recId, { ...verification, expectedVersion: version, postCost: "3000.00" }), 422, /did not decrease/);
    await fails(applyAction(db, fin, recId, { ...verification, expectedVersion: version, currency: "EUR" }), 422, /Currency must match/);
    await fails(applyAction(db, fin, recId, { ...verification, expectedVersion: version, postTo: "2026-12-31" }), 422, /future/);
  });
  it("records a 'not verified' decision without counting any savings", async () => {
    await toImplemented();
    await act(fin, { action: "decline_verification", reason: "Post-change billing window not yet complete" });
    const d = (await getRecommendationDetail(db, fin, recId))!;
    expect(d.rec.stage).toBe("implemented");
    expect(d.verifications[0]).toMatchObject({ decision: "not_verified", monthly_savings_micros: null });
    expect((await verifiedSavings(db)).count).toBe(0);
  });
  it("never counts estimates as verified savings, whatever the stage", async () => {
    await toImplemented();
    const v = await verifiedSavings(db);
    expect(v.count).toBe(0);
    const p = await pipeline(db);
    expect(p.estimatedAwaitingVerificationMonthly.USD).toBeGreaterThan(0n);
  });
  it("counts one verified value per recommendation when a decision is re-recorded", async () => {
    await toImplemented();
    await act(fin, verification);
    await db.run(
      `INSERT INTO verifications (id, rec_id, decided_by, decided_at, decision, currency, monthly_savings_micros) VALUES ('older', @r, @u, '2026-10-01T00:00:00Z', 'verified', 'USD', 999000000)`,
      { r: recId, u: fin2.id },
    );
    expect((await verifiedSavings(db)).monthly.USD).toBe(1_521_875_000n);
  });
});

describe("pipeline estimates", () => {
  it("separates estimates by currency and flags overlapping recommendations on the same resource", async () => {
    const r = (await db.get<{ resource_key: string }>("SELECT resource_key FROM recommendations ORDER BY id"))!;
    await db.run(`UPDATE recommendations SET resource_key = @k`, { k: r.resource_key });
    await db.run(`UPDATE recommendations SET est_currency = 'EUR' WHERE id = @id`, { id: recId });
    const p = await pipeline(db);
    expect(Object.keys(p.estimatedOpenMonthly).sort()).toEqual(["EUR", "USD"]);
    expect(p.overlappingResources).toBe(1);
    expect(p.openWithoutEstimate).toBeGreaterThan(0);
  });
});

describe("approved-subscription scope", () => {
  it("hides records of a subscription that is no longer approved from lists, totals and actions", async () => {
    const { SUB_A } = await import("./helpers");
    const onlyA = [SUB_A];
    const all = await listRecommendations(db, fin, {});
    const scoped = await listRecommendations(db, fin, { approvedSubscriptions: onlyA });
    expect(all.total).toBe(12);
    expect(scoped.total).toBe(6);
    const outside = (await db.get<{ id: string }>(`SELECT id FROM recommendations WHERE subscription_id <> @a`, { a: SUB_A }))!.id;
    await fails(applyAction(db, fin, outside, { action: "validate", expectedVersion: 1 }, NOW, onlyA), 404);
    expect(await getRecommendationDetail(db, fin, outside, onlyA)).toBeNull();
    const full = await pipeline(db);
    const part = await pipeline(db, onlyA);
    expect(part.estimatedOpenMonthly.USD).toBeLessThan(full.estimatedOpenMonthly.USD);
  });
  it("excludes recommendations no longer returned by Advisor from the open estimate total", async () => {
    const before = (await pipeline(db)).estimatedOpenMonthly.USD;
    await db.run(`UPDATE recommendations SET source_status = 'not_returned' WHERE id = @id`, { id: recId });
    const after = await pipeline(db);
    expect(after.estimatedOpenMonthly.USD).toBeLessThan(before);
    expect(after.notReturnedOpen).toBe(1);
  });
  it("rejects amounts that cannot be stored exactly", async () => {
    await toImplemented();
    await fails(applyAction(db, fin, recId, { ...verification, expectedVersion: version, baselineCost: "9999999999999.00" }), 400);
  });
});
