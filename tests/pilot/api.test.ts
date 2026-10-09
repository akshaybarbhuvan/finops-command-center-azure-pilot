// @vitest-environment node
// Route-handler tests: the HTTP boundary exactly as App Service forwards requests (with the injected principal header).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPilotConfig } from "@/pilot/config";
import { setDbForTests } from "@/pilot/db";
import type { Db } from "@/pilot/db/types";
import { _resetRateLimits } from "@/pilot/http/api";
import { runSync } from "@/pilot/sync/service";
import { BASE_ENV, actor, easyAuthHeader, fakeClient, ROLE_VALUE, seedUsers, testConfig, testDb } from "./helpers";
import type { Actor } from "@/pilot/auth/principal";

vi.mock("@/pilot/sync/runtime", () => ({ runLiveSync: vi.fn(async () => ({ outcomes: [], skipped: [] })) }));

import { POST as actionPOST } from "@/app/api/recommendations/[id]/actions/route.pilot";
import { GET as exportGET } from "@/app/api/recommendations/export/route.pilot";
import { POST as syncPOST } from "@/app/api/sync/route.pilot";
import { GET as healthGET } from "@/app/api/health/route.pilot";

const ORIGIN = BASE_ENV.FCC_PUBLIC_ORIGIN;
const saved = { ...process.env };
let db: Db;
let recId: string;
const exec = actor(["executive"], "Erin Exec");
const fin = actor(["finops"], "Fran FinOps");
const engA = actor(["engineering"], "Priya Eng");
const engB = actor(["engineering"], "Marcus Eng");
const admin = actor(["admin"], "Avery Admin");

function headersFor(a: Actor | null, extra: Record<string, string> = {}) {
  const h: Record<string, string> = { origin: ORIGIN, "content-type": "application/json", "x-fcc-request": "1", ...extra };
  if (a) {
    h["x-ms-client-principal"] = easyAuthHeader({ id: a.id, name: a.name, roles: a.roles.map((r) => ROLE_VALUE[r]) });
    h["x-ms-client-principal-idp"] = "aad";
  }
  return h;
}
const post = (a: Actor | null, body: unknown, id = recId, extra: Record<string, string> = {}) =>
  actionPOST(new Request(`${ORIGIN}/api/recommendations/${id}/actions`, { method: "POST", headers: headersFor(a, extra), body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

beforeEach(async () => {
  Object.assign(process.env, BASE_ENV);
  resetPilotConfig();
  _resetRateLimits();
  db = await testDb();
  setDbForTests(db);
  await seedUsers(db, exec, fin, engA, engB, admin);
  await runSync({ db, config: testConfig(), client: fakeClient({ resourcesPerSub: 3, advisorPerSub: 4 }), now: () => new Date() }, { sources: ["advisor"], trigger: "cli" });
  recId = (await db.get<{ id: string }>("SELECT id FROM recommendations ORDER BY id"))!.id;
});
afterAll(() => {
  process.env = saved;
  resetPilotConfig();
  setDbForTests(null);
});

describe("API boundary", () => {
  it("liveness probe is anonymous and reveals nothing", async () => {
    const r = healthGET();
    expect(await r.json()).toEqual({ status: "ok" });
  });
  it("rejects unauthenticated, foreign-tenant and role-less callers", async () => {
    expect((await post(null, { action: "validate", expectedVersion: 1 })).status).toBe(401);
    const foreign = easyAuthHeader({ id: fin.id, name: "x", roles: ["FCC.FinOps"] }, "99999999-9999-9999-9999-999999999999");
    expect((await post(null, { action: "validate", expectedVersion: 1 }, recId, { "x-ms-client-principal": foreign, "x-ms-client-principal-idp": "aad" })).status).toBe(403);
    expect((await post(actor([]), { action: "validate", expectedVersion: 1 })).status).toBe(403);
  });
  it("rejects cross-site and non-JSON mutation requests", async () => {
    expect((await post(fin, { action: "validate", expectedVersion: 1 }, recId, { origin: "https://evil.example" })).status).toBe(403);
    const noHeader = headersFor(fin);
    delete noHeader["x-fcc-request"];
    const r = await actionPOST(new Request(`${ORIGIN}/api/recommendations/${recId}/actions`, { method: "POST", headers: noHeader, body: "{}" }), { params: Promise.resolve({ id: recId }) });
    expect(r.status).toBe(400);
  });
  it("enforces roles, ownership and transitions on the server", async () => {
    expect((await post(exec, { action: "validate", expectedVersion: 1 })).status).toBe(403);
    expect((await post(admin, { action: "validate", expectedVersion: 1 })).status).toBe(403);
    const ok = await post(fin, { action: "validate", expectedVersion: 1 });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ stage: "validated", version: 2 });
    expect((await post(fin, { action: "assign", expectedVersion: 2, ownerId: engA.id })).status).toBe(200);
    // Engineer B: same response as a non-existent ID; nothing about the record is revealed.
    const b = await post(engB, { action: "start", expectedVersion: 3 });
    const missing = await post(engB, { action: "start", expectedVersion: 3 }, "00000000-0000-0000-0000-000000000000");
    expect(b.status).toBe(404);
    expect(missing.status).toBe(404);
    expect((await b.json()).message.replace(recId, "ID")).toBe((await missing.json()).message.replace("00000000-0000-0000-0000-000000000000", "ID"));
    expect((await post(engA, { action: "start", expectedVersion: 3 })).status).toBe(200);
    expect((await post(engA, { action: "verify", expectedVersion: 4 })).status).toBe(400); // schema rejects incomplete verification
  });
  it("rate-limits workflow mutations per user", async () => {
    let last = 0;
    for (let i = 0; i < 32; i++) last = (await post(exec, { action: "validate", expectedVersion: 1 })).status;
    expect(last).toBe(429);
  });
  it("does not leak internals in error responses", async () => {
    const r = await post(fin, "not json at all" as unknown as object);
    const text = await r.text();
    expect(r.status).toBe(400);
    expect(text).not.toMatch(/stack|at .*\.ts|sqlite|SELECT/i);
  });
  it("refuses to serve anything when configuration is incomplete (no fallback data)", async () => {
    delete process.env.FCC_AZURE_SUBSCRIPTION_IDS;
    resetPilotConfig();
    const r = await post(fin, { action: "validate", expectedVersion: 1 });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: "configuration_incomplete" });
  });
  it("lets only FinOps and administrators trigger a refresh", async () => {
    const call = (a: Actor) => syncPOST(new Request(`${ORIGIN}/api/sync`, { method: "POST", headers: headersFor(a), body: "{}" }));
    expect((await call(exec)).status).toBe(403);
    expect((await call(engA)).status).toBe(403);
    expect((await call(admin)).status).toBe(202);
    expect((await call(fin)).status).toBe(202);
  });
  it("scopes CSV exports exactly like the list", async () => {
    await post(fin, { action: "validate", expectedVersion: 1 });
    await post(fin, { action: "assign", expectedVersion: 2, ownerId: engA.id });
    const csv = async (a: Actor) => (await exportGET(new Request(`${ORIGIN}/api/recommendations/export?stage=`, { headers: headersFor(a) }))).text();
    const linesA = (await csv(engA)).trim().split("\r\n");
    const linesB = (await csv(engB)).trim().split("\r\n");
    const linesExec = (await csv(exec)).trim().split("\r\n");
    expect(linesA.length).toBe(2); // header + the one assigned record
    expect(linesB.length).toBe(1); // header only
    expect(linesExec.length).toBe(1 + 8);
    expect(linesExec[0]).toContain("est_currency");
  });
});
