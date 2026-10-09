// @vitest-environment node
// Offline connector tests against deterministic fixtures. These do NOT prove live Azure connectivity.
import { describe, expect, it } from "vitest";
import { ConnectorError, createArmClient, retryDelayFromHeaders, resolveArmUrl } from "@/pilot/azure/arm";
import { inventoryPages, normalizeResource } from "@/pilot/azure/resourceGraph";
import { combineDaily, defaultCostWindow, parseCostPage, queryDailyCost } from "@/pilot/azure/costManagement";
import { listAdvisor, normalizeAdvisor, advisorFilter } from "@/pilot/azure/advisor";
import { fakeClient, SUB_A } from "./helpers";
import { fakeAzureFetch, fixtureAdvisor } from "./fixtures/azure";

const fixedFetch = (status: number, body: unknown, headers: Record<string, string> = {}) => {
  let calls = 0;
  const f = (async () => {
    calls++;
    return new Response(JSON.stringify(body), { status, headers });
  }) as unknown as typeof fetch;
  return { f, calls: () => calls };
};

describe("ARM client", () => {
  it("retries 429 using Retry-After, then succeeds", async () => {
    const waits: number[] = [];
    let n = 0;
    const client = createArmClient({
      getToken: async () => "t",
      sleep: async (ms) => void waits.push(ms),
      fetch: (async () => (++n === 1 ? new Response("{}", { status: 429, headers: { "retry-after": "7" } }) : new Response(JSON.stringify({ ok: 1 }), { status: 200 }))) as unknown as typeof fetch,
    });
    expect(await client.request("GET", "/subscriptions/x")).toEqual({ ok: 1 });
    expect(waits).toEqual([7000]);
  });
  it("stops retrying when Azure asks to wait longer than the limit", async () => {
    const { f } = fixedFetch(429, {}, { "x-ms-ratelimit-microsoft.costmanagement-qpu-retry-after": "900" });
    const client = createArmClient({ getToken: async () => "t", fetch: f, sleep: async () => {} });
    await expect(client.request("GET", "/x")).rejects.toMatchObject({ kind: "throttled" });
  });
  it("gives up after bounded retries on 5xx and classifies 403 without retrying", async () => {
    const s = fixedFetch(503, {});
    const c1 = createArmClient({ getToken: async () => "t", fetch: s.f, sleep: async () => {}, maxRetries: 3 });
    await expect(c1.request("GET", "/x")).rejects.toMatchObject({ kind: "server" });
    expect(s.calls()).toBe(4);
    const f = fixedFetch(403, { error: { code: "AuthorizationFailed", message: "secret-detail Bearer abc.def.ghi" } });
    const c2 = createArmClient({ getToken: async () => "t", fetch: f.f, sleep: async () => {} });
    const err = (await c2.request("GET", "/x").catch((e: unknown) => e)) as ConnectorError;
    expect(err).toMatchObject({ kind: "forbidden", armCode: "AuthorizationFailed", isAuthorization: true });
    expect(err.message).not.toContain("secret-detail"); // ARM message bodies are never surfaced
    expect(f.calls()).toBe(1);
  });
  it("times out a hung request and reports it", async () => {
    const hang = ((_: unknown, init?: RequestInit) => new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
    const client = createArmClient({ getToken: async () => "t", fetch: hang, sleep: async () => {}, timeoutMs: 20, maxRetries: 1 });
    await expect(client.request("GET", "/x")).rejects.toMatchObject({ kind: "timeout" });
  });
  it("honours caller cancellation", async () => {
    const ctl = new AbortController();
    ctl.abort();
    const client = createArmClient({ getToken: async () => "t", fetch: fixedFetch(200, {}).f });
    await expect(client.request("GET", "/x", undefined, ctl.signal)).rejects.toMatchObject({ kind: "cancelled" });
  });
  it("never calls hosts other than Azure Resource Manager (pagination links included)", () => {
    expect(() => resolveArmUrl("https://evil.example.com/steal")).toThrow(ConnectorError);
    expect(() => resolveArmUrl("https://management.azure.com.evil.example/x")).toThrow(ConnectorError);
    expect(resolveArmUrl("/subscriptions/x").origin).toBe("https://management.azure.com");
  });
  it("reads Azure rate-limit headers", () => {
    expect(retryDelayFromHeaders(new Headers({ "retry-after": "3" }))).toBe(3000);
    expect(retryDelayFromHeaders(new Headers({ "x-ms-user-quota-remaining": "0", "x-ms-user-quota-resets-after": "00:00:05" }))).toBe(5000);
    expect(retryDelayFromHeaders(new Headers({}))).toBeNull();
  });
  it("reports token acquisition failures as unauthorized without leaking details", async () => {
    const client = createArmClient({ getToken: async () => Promise.reject(new Error("ManagedIdentityCredential: secret endpoint xyz")), fetch: fixedFetch(200, {}).f });
    const e = (await client.request("GET", "/x").catch((x: unknown) => x)) as ConnectorError;
    expect(e.kind).toBe("unauthorized");
    expect(e.message).not.toContain("xyz");
  });
});

describe("Resource Graph inventory", () => {
  it("normalizes rows using the full resource ID as identity", () => {
    const n = normalizeResource({ id: `/subscriptions/${SUB_A}/resourceGroups/rg/providers/Microsoft.Web/sites/App1`, name: "App1", type: "Microsoft.Web/sites", subscriptionId: SUB_A.toUpperCase(), tags: { a: "b", n: 5 } });
    expect(n?.subscriptionId).toBe(SUB_A);
    expect(n?.type).toBe("microsoft.web/sites");
    expect(n?.tags).toEqual({ a: "b" });
    expect(n?.resourceKey).toMatch(/^[0-9a-f]{64}$/);
    expect(normalizeResource({ name: "no id" })).toBeNull();
  });
  it("pages with $skipToken and pins every query to one subscription", async () => {
    const calls: { body?: unknown }[] = [];
    const client = createArmClient({ getToken: async () => "t", fetch: fakeAzureFetch({ resourcesPerSub: 2500, calls: calls as never }), sleep: async () => {} });
    let total = 0;
    for await (const p of inventoryPages(client, SUB_A, 10_000)) total += p.resources.length;
    expect(total).toBe(2500);
    expect(calls.length).toBe(3);
    expect(calls.every((c) => JSON.stringify((c.body as { subscriptions: string[] }).subscriptions) === JSON.stringify([SUB_A]))).toBe(true);
  });
  it("stops at the configured maximum instead of silently truncating", async () => {
    const pages = inventoryPages(fakeClient({ resourcesPerSub: 2500 }), SUB_A, 1500);
    await expect((async () => { for await (const _ of pages) void _; })()).rejects.toMatchObject({ kind: "limit_exceeded" });
  });
});

describe("Cost Management", () => {
  const window = { from: "2026-09-01", to: "2026-10-08" };
  it("uses a bounded window from the first day of the previous month", () => {
    expect(defaultCostWindow(new Date("2026-10-09T05:00:00Z"))).toEqual({ from: "2026-09-01", to: "2026-10-09" });
    expect(defaultCostWindow(new Date("2026-01-15T00:00:00Z"))).toEqual({ from: "2025-12-01", to: "2026-01-15" });
  });
  it("parses columns by name, keeps currency, and preserves precision", () => {
    const rows = parseCostPage({ properties: { columns: [{ name: "UsageDate" }, { name: "Currency" }, { name: "Cost" }], rows: [[20260901, "eur", "12.3456789"]] } }, "Cost", window);
    expect(rows).toEqual([{ date: "2026-09-01", currency: "EUR", micros: 12_345_679n }]);
  });
  it("refuses to assume a currency or accept out-of-window dates", () => {
    expect(() => parseCostPage({ properties: { columns: [{ name: "Cost" }, { name: "UsageDate" }], rows: [[1, 20260901]] } }, "Cost", window)).toThrow(/currency/);
    expect(() => parseCostPage({ properties: { columns: [{ name: "Cost" }, { name: "UsageDate" }, { name: "Currency" }], rows: [[1, 20250101, "USD"]] } }, "Cost", window)).toThrow(/outside/);
    expect(() => parseCostPage({ properties: {} }, "Cost", window)).toThrow(ConnectorError);
  });
  it("combines pages and duplicate days instead of overwriting", () => {
    const c = combineDaily([
      { date: "2026-09-01", currency: "USD", micros: 1n },
      { date: "2026-09-01", currency: "USD", micros: 2n },
      { date: "2026-09-01", currency: "EUR", micros: 5n },
    ]);
    expect(c).toEqual([
      { date: "2026-09-01", currency: "EUR", micros: 5n },
      { date: "2026-09-01", currency: "USD", micros: 3n },
    ]);
  });
  it("follows nextLink and returns every day of the window", async () => {
    const days = await queryDailyCost(fakeClient(), SUB_A, "ActualCost", window, "Cost");
    expect(days.length).toBe(38);
    expect(days[0]).toMatchObject({ date: "2026-09-01", currency: "USD", micros: 1_000_125_000n });
  });
});

describe("Advisor", () => {
  it("keeps source identity and only records estimates the source provides", () => {
    const [withAnnual, monthlyOnly, , none] = fixtureAdvisor(SUB_A, 4).map((r) => normalizeAdvisor(r, SUB_A)!);
    expect(withAnnual.sourceId).toContain("/providers/Microsoft.Advisor/recommendations/");
    expect(withAnnual.estimate).toMatchObject({ currency: "USD", monthlyMicros: 100_000_000n, annualMicros: 1_200_000_000n, annualIsDerived: false });
    expect(monthlyOnly.estimate).toMatchObject({ monthlyMicros: 110_500_000n, annualMicros: 1_326_000_000n, annualIsDerived: true });
    expect(none.estimate).toBeNull();
  });
  it("rejects recommendations outside the expected subscription or without a currency", () => {
    const [r] = fixtureAdvisor(SUB_A, 1);
    expect(normalizeAdvisor(r, "00000000-0000-0000-0000-0000000000ff")).toBeNull();
    const noCurrency = { ...r, properties: { ...r.properties, extendedProperties: { savingsAmount: "50" } } };
    expect(normalizeAdvisor(noCurrency, SUB_A)?.estimate).toBeNull();
    const learn = { ...r, properties: { ...r.properties, learnMoreLink: "javascript:alert(1)" } };
    expect(normalizeAdvisor(learn, SUB_A)?.learnMoreUrl).toBeNull();
  });
  it("pages through nextLink, filters by category and de-duplicates by source ID", async () => {
    const dup = fixtureAdvisor(SUB_A, 6);
    const r = await listAdvisor(fakeClient({ advisorOverride: () => [...dup, dup[0]] }), SUB_A, ["Cost"]);
    expect(r.items.length).toBe(6);
    expect(advisorFilter(["Cost", "Performance"])).toBe("Category eq 'Cost' or Category eq 'Performance'");
  });
  it("reports 403 as an authorization failure", async () => {
    await expect(listAdvisor(fakeClient({ forbiddenAdvisorSubs: [SUB_A] }), SUB_A, ["Cost"])).rejects.toMatchObject({ kind: "forbidden" });
  });
});
