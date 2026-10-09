// Deterministic, clearly synthetic Azure API responses for OFFLINE tests only.
// Every identifier is obviously fake (all-zero GUIDs, "fixture-" names, "FIXTURE:" descriptions) so fixture data
// can never be mistaken for a live tenant. These are not live integration tests.
export const SUB_A = "00000000-0000-0000-0000-00000000000a";
export const SUB_B = "00000000-0000-0000-0000-00000000000b";
export const TENANT = "00000000-0000-0000-0000-0000000000aa";

const rid = (sub: string, rg: string, type: string, name: string) => `/subscriptions/${sub}/resourceGroups/${rg}/providers/${type}/${name}`;

export function fixtureResources(sub: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: rid(sub, "rg-fixture", "Microsoft.Compute/virtualMachines", `fixture-vm-${String(i).padStart(4, "0")}`),
    name: `fixture-vm-${String(i).padStart(4, "0")}`,
    type: "microsoft.compute/virtualmachines",
    location: "eastus",
    resourceGroup: "rg-fixture",
    subscriptionId: sub,
    kind: null,
    skuName: "Standard_D4s_v5",
    tags: { env: "fixture", owner: "fixture-team" },
  }));
}

export function fixtureAdvisor(sub: string, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const res = rid(sub, "rg-fixture", "Microsoft.Compute/virtualMachines", `fixture-vm-${String(i).padStart(4, "0")}`);
    return {
      id: `${res}/providers/Microsoft.Advisor/recommendations/${String(i).padStart(8, "0")}-0000-0000-0000-000000000000`,
      name: `${String(i).padStart(8, "0")}-0000-0000-0000-000000000000`,
      type: "Microsoft.Advisor/recommendations",
      properties: {
        category: "Cost",
        impact: i % 3 === 0 ? "High" : i % 3 === 1 ? "Medium" : "Low",
        impactedField: "Microsoft.Compute/virtualMachines",
        impactedValue: `fixture-vm-${String(i).padStart(4, "0")}`,
        lastUpdated: "2026-10-01T00:00:00Z",
        recommendationTypeId: "00000000-0000-0000-0000-0000000000f1",
        shortDescription: { problem: `FIXTURE: Right-size or shut down underutilized virtual machine ${i}`, solution: "FIXTURE: Right-size or shut down underutilized virtual machines" },
        resourceMetadata: { resourceId: res },
        extendedProperties: i % 4 === 3 ? {} : { savingsAmount: String(100 + i * 10.5), savingsCurrency: "USD", ...(i % 2 === 0 ? { annualSavingsAmount: String((100 + i * 10.5) * 12) } : {}) },
      },
    };
  });
}

export interface FakeAzureOptions {
  resourcesPerSub?: number;
  advisorPerSub?: number;
  invisibleSubs?: string[]; // Resource Graph returns nothing (no Reader access)
  forbiddenCostSubs?: string[]; // 403 from Cost Management
  forbiddenAdvisorSubs?: string[];
  throttleFirstCostCall?: boolean; // 429 with Retry-After once
  failAmortizedFor?: string[]; // 500 for AmortizedCost only
  advisorOverride?: (sub: string) => unknown[] | null;
  costRows?: (sub: string, type: string, from: string, to: string) => unknown[][];
  calls?: { method: string; url: string; body?: unknown }[];
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function datesBetween(from: string, to: string) {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** A fetch implementation that emulates the three Azure APIs used by FCC. */
export function fakeAzureFetch(o: FakeAzureOptions = {}): typeof fetch {
  const perSub = o.resourcesPerSub ?? 1500;
  const advisorPerSub = o.advisorPerSub ?? 6;
  let throttled = false;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    o.calls?.push({ method, url: url.href, body });
    if (!String((init?.headers as Record<string, string>)?.authorization ?? "").startsWith("Bearer ")) return json(401, { error: { code: "AuthenticationFailed" } });

    if (url.pathname === "/providers/Microsoft.ResourceGraph/resources") {
      const sub = body.subscriptions[0] as string;
      if (o.invisibleSubs?.includes(sub)) return json(200, { data: [], count: 0, totalRecords: 0, resultTruncated: "false" });
      if (String(body.query).startsWith("ResourceContainers")) return json(200, { data: [{ subscriptionId: sub }], count: 1, totalRecords: 1 });
      const all = fixtureResources(sub, perSub);
      const start = body.options?.$skipToken ? Number(Buffer.from(body.options.$skipToken, "base64").toString()) : 0;
      const page = all.slice(start, start + 1000);
      const next = start + 1000 < all.length ? Buffer.from(String(start + 1000)).toString("base64") : undefined;
      return json(200, { data: page, count: page.length, totalRecords: all.length, resultTruncated: "false", ...(next ? { $skipToken: next } : {}) });
    }

    const cost = /^\/subscriptions\/([0-9a-f-]{36})\/providers\/Microsoft\.CostManagement\/query$/i.exec(url.pathname);
    if (cost) {
      const sub = cost[1];
      if (o.throttleFirstCostCall && !throttled) {
        throttled = true;
        return json(429, { error: { code: "TooManyRequests" } }, { "retry-after": "1" });
      }
      if (o.forbiddenCostSubs?.includes(sub)) return json(403, { error: { code: "AuthorizationFailed" } });
      if (body.type === "AmortizedCost" && o.failAmortizedFor?.includes(sub)) return json(500, { error: { code: "InternalServerError" } });
      const from = body.timePeriod.from.slice(0, 10);
      const to = body.timePeriod.to.slice(0, 10);
      const rows =
        o.costRows?.(sub, body.type, from, to) ??
        datesBetween(from, to).map((d, i) => [body.type === "ActualCost" ? 1000.125 + i : 950.5 + i, Number(d.replace(/-/g, "")), "USD"]);
      // Two pages: second page via nextLink, as Cost Management can return.
      const half = Math.ceil(rows.length / 2);
      const page2 = url.searchParams.get("$skiptoken") === "p2";
      const columns = [
        { name: body.dataset.aggregation.totalCost.name, type: "Number" },
        { name: "UsageDate", type: "Number" },
        { name: "Currency", type: "String" },
      ];
      return json(200, {
        properties: {
          columns,
          rows: page2 ? rows.slice(half) : rows.slice(0, half),
          nextLink: page2 || half >= rows.length ? null : `https://management.azure.com${url.pathname}?api-version=2023-11-01&$skiptoken=p2`,
        },
      });
    }

    const adv = /^\/subscriptions\/([0-9a-f-]{36})\/providers\/Microsoft\.Advisor\/recommendations$/i.exec(url.pathname);
    if (adv) {
      const sub = adv[1];
      if (o.forbiddenAdvisorSubs?.includes(sub)) return json(403, { error: { code: "AuthorizationFailed" } });
      const all = o.advisorOverride?.(sub) ?? fixtureAdvisor(sub, advisorPerSub);
      const skip = Number(url.searchParams.get("$skiptoken") ?? "0");
      const page = all.slice(skip, skip + 4);
      const next = skip + 4 < all.length ? `https://management.azure.com${url.pathname}?api-version=2025-01-01&$skiptoken=${skip + 4}` : null;
      return json(200, { value: page, nextLink: next });
    }
    return json(404, { error: { code: "NotFound" } });
  }) as typeof fetch;
}
