// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadPilotConfig } from "@/pilot/config";
import { parseDevPrincipal, parseEasyAuth, homeFor, rolesFromValues } from "@/pilot/auth/principal";
import { can, recScope } from "@/pilot/auth/permissions";
import { BASE_ENV, easyAuthHeader, actor, TENANT } from "./helpers";

const cfg = (over: Record<string, string | undefined>) => loadPilotConfig({ ...BASE_ENV, ...over });

describe("pilot configuration fails closed", () => {
  it("accepts a complete local-validation configuration", () => {
    expect(cfg({}).ok).toBe(true);
  });
  it.each([
    ["APP_MODE", { APP_MODE: "demo" }],
    ["APP_MODE missing", { APP_MODE: undefined }],
    ["tenant", { FCC_ENTRA_TENANT_ID: "contoso.onmicrosoft.com" }],
    ["subscriptions", { FCC_AZURE_SUBSCRIPTION_IDS: "" }],
    ["subscription format", { FCC_AZURE_SUBSCRIPTION_IDS: "not-a-guid" }],
    ["duplicate subscriptions", { FCC_AZURE_SUBSCRIPTION_IDS: `${BASE_ENV.FCC_AZURE_SUBSCRIPTION_IDS},${BASE_ENV.FCC_AZURE_SUBSCRIPTION_IDS.split(",")[0]}` }],
    ["database dialect", { FCC_DB_DIALECT: undefined }],
    ["sqlite without explicit opt-in", { FCC_ALLOW_LOCAL_SQLITE: undefined }],
    ["sql server host", { FCC_DB_DIALECT: "mssql", FCC_SQL_SERVER: "evil.example.com", FCC_SQL_DATABASE: "fcc" }],
    ["public origin", { FCC_PUBLIC_ORIGIN: "not a url" }],
    ["sync interval below minimum", { FCC_SYNC_INTERVAL_MINUTES: "5" }],
    ["unknown auth mode", { FCC_AUTH_MODE: "none" }],
  ])("rejects bad %s", (_, over) => {
    const r = cfg(over);
    expect(r.ok).toBe(false);
  });
  it("refuses SQLite and plain-http origins on App Service, and requires App Service Authentication there", () => {
    const r = cfg({ WEBSITE_SITE_NAME: "app-fcc-pilot", WEBSITE_AUTH_ENABLED: "False" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems.join(" ")).toMatch(/App Service Authentication is not enabled/);
      expect(r.problems.join(" ")).toMatch(/sqlite is not allowed on App Service/);
      expect(r.problems.join(" ")).toMatch(/FCC_PUBLIC_ORIGIN/);
    }
  });
  it("trusts App Service Authentication headers only on App Service (or explicit localhost validation)", () => {
    const r = cfg({ FCC_LOCAL_VALIDATION: undefined });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toMatch(/requires Azure App Service/);
    expect(cfg({ FCC_PUBLIC_ORIGIN: "https://fcc.example.com" }).ok).toBe(false); // local validation flag with a non-localhost origin
    const onAppService = cfg({ WEBSITE_SITE_NAME: "app", WEBSITE_AUTH_ENABLED: "True", FCC_LOCAL_VALIDATION: undefined, FCC_PUBLIC_ORIGIN: "https://app.azurewebsites.net", FCC_DB_DIALECT: "mssql", FCC_SQL_SERVER: "fcc.database.windows.net", FCC_SQL_DATABASE: "fcc" });
    expect(onAppService.ok).toBe(true);
    expect(cfg({ FCC_DB_DIALECT: "mssql", FCC_SQL_SERVER: "fcc.database.usgovcloudapi.net", FCC_SQL_DATABASE: "fcc" }).ok).toBe(false);
  });
  it("only allows the development principal under `next dev` off App Service", () => {
    expect(cfg({ FCC_AUTH_MODE: "development", NODE_ENV: "production" }).ok).toBe(false);
    expect(cfg({ FCC_AUTH_MODE: "development", NODE_ENV: "development", WEBSITE_SITE_NAME: "x" }).ok).toBe(false);
    expect(cfg({ FCC_AUTH_MODE: "development", NODE_ENV: "development" }).ok).toBe(true);
  });
  it("problem messages never echo configured values", () => {
    const r = cfg({ FCC_SQL_SERVER: "secret-host-name", FCC_DB_DIALECT: "mssql", FCC_SQL_DATABASE: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).not.toContain("secret-host-name");
  });
});

describe("App Service Authentication principal", () => {
  const get = (h: Record<string, string>) => (n: string) => h[n.toLowerCase()] ?? null;
  const u = { id: "11111111-2222-3333-4444-555555555555", name: "Ada Pilot", roles: ["FCC.FinOps", "Unrelated.Role"] };

  it("maps tenant, object ID and app roles", () => {
    const r = parseEasyAuth(get({ "x-ms-client-principal": easyAuthHeader(u), "x-ms-client-principal-idp": "aad" }), TENANT);
    expect(r.kind).toBe("authenticated");
    if (r.kind === "authenticated") {
      expect(r.actor.id).toBe(u.id);
      expect(r.actor.roles).toEqual(["finops"]);
      expect(r.actor.name).toBe("Ada Pilot");
    }
  });
  it("is anonymous without the header and rejects other tenants, providers and malformed input", () => {
    expect(parseEasyAuth(get({}), TENANT).kind).toBe("anonymous");
    expect(parseEasyAuth(get({ "x-ms-client-principal": easyAuthHeader(u, "99999999-9999-9999-9999-999999999999") }), TENANT)).toEqual({ kind: "rejected", reason: "wrong_tenant" });
    expect(parseEasyAuth(get({ "x-ms-client-principal": easyAuthHeader(u), "x-ms-client-principal-idp": "github" }), TENANT)).toEqual({ kind: "rejected", reason: "wrong_provider" });
    expect(parseEasyAuth(get({ "x-ms-client-principal": "%%%not-base64-json" }), TENANT).kind).toBe("rejected");
    expect(parseEasyAuth(get({ "x-ms-client-principal": "a".repeat(20_000) }), TENANT)).toEqual({ kind: "rejected", reason: "malformed" });
  });
  it("ignores role claims with unknown values and does not trust email domains", () => {
    expect(rolesFromValues(["Admin", "FCC.admin", "fcc.FinOps", "Global Administrator"])).toEqual([]);
    expect(rolesFromValues(["FCC.Admin", "FCC.Executive"])).toEqual(["admin", "executive"]);
  });
  it("development principal requires a GUID object ID", () => {
    expect(parseDevPrincipal(JSON.stringify({ id: "dev", roles: ["FCC.Admin"] }), TENANT).kind).toBe("rejected");
    expect(parseDevPrincipal(undefined, TENANT).kind).toBe("anonymous");
  });
});

describe("permission model", () => {
  it("grants the documented permissions per role", () => {
    const exec = actor(["executive"]);
    const fin = actor(["finops"]);
    const eng = actor(["engineering"]);
    const adm = actor(["admin"]);
    expect([can(exec, "portfolio.read"), can(exec, "workflow.finops"), can(exec, "comment"), can(exec, "sync.trigger")]).toEqual([true, false, false, false]);
    expect([can(fin, "workflow.finops"), can(fin, "admin.read")]).toEqual([true, false]);
    expect([can(eng, "portfolio.read"), can(eng, "recs.read.owned"), can(eng, "workflow.engineering")]).toEqual([false, true, true]);
    expect([can(adm, "admin.read"), can(adm, "workflow.finops"), can(adm, "workflow.engineering")]).toEqual([true, false, false]);
    expect(recScope(eng)).toEqual({ kind: "owned", ownerId: eng.id });
    expect(recScope(actor([]))).toEqual({ kind: "none" });
  });
  it("routes each role to a home page", () => {
    expect(homeFor(actor(["finops"]))).toBe("/finops");
    expect(homeFor(actor(["engineering"]))).toBe("/engineering");
    expect(homeFor(actor(["executive"]))).toBe("/overview");
    expect(homeFor(actor(["admin"]))).toBe("/admin");
    expect(homeFor(actor([]))).toBe("/no-access");
  });
});
