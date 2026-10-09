// @vitest-environment node
// Deployment tooling: the fail-closed gates used by deploy-pilot.yml, the post-deployment check, the read-only Azure
// preflight, and the workflow/template contracts they rely on. Azure is never called: `az` is a local stub on PATH.
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const script = (name: string) => path.join(ROOT, "scripts/pilot", name);
const TENANT = "00000000-0000-0000-0000-0000000000aa";
const SUB = "00000000-0000-0000-0000-00000000000a";
const WORKLOAD = { "fcc-workload": "finops-command-center-azure-pilot" };
const posixOnly = process.platform === "win32" ? it.skip : it;

type Run = { code: number | null; out: string };
function run(file: string, args: string[], env: Record<string, string | undefined> = {}): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script(file), ...args], { cwd: ROOT, env: { NODE_ENV: "test", PATH: process.env.PATH, ...env } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

// --- stub Azure CLI --------------------------------------------------------------------------------------------
let stubDir = "";
type AzReply = { stdout?: unknown; status?: number; stderr?: string };
function azStub(replies: Record<string, AzReply>) {
  const file = path.join(stubDir, `replies-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify(replies));
  return { PATH: `${stubDir}${path.delimiter}${process.env.PATH}`, AZ_STUB_REPLIES: file };
}
beforeAll(() => {
  stubDir = mkdtempSync(path.join(tmpdir(), "fcc-az-stub-"));
  const impl = path.join(stubDir, "az-stub.mjs");
  writeFileSync(
    impl,
    `import { readFileSync, appendFileSync } from "node:fs";
const args = process.argv.slice(2).join(" ");
appendFileSync(process.env.AZ_STUB_REPLIES + ".log", args + "\\n");
const replies = JSON.parse(readFileSync(process.env.AZ_STUB_REPLIES, "utf8"));
const key = Object.keys(replies).sort((a, b) => b.length - a.length).find((k) => args.startsWith(k));
if (!key) { process.stderr.write("ERROR: unexpected az call: " + args); process.exit(3); }
const r = replies[key];
if (r.stdout !== undefined) process.stdout.write(typeof r.stdout === "string" ? r.stdout : JSON.stringify(r.stdout));
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status ?? 0);
`,
  );
  writeFileSync(path.join(stubDir, "az"), `#!/bin/sh\nexec "${process.execPath}" "${impl}" "$@"\n`);
  chmodSync(path.join(stubDir, "az"), 0o755);
});
afterAll(() => rmSync(stubDir, { recursive: true, force: true }));
const azCalls = (env: { AZ_STUB_REPLIES: string }) => {
  try {
    return readFileSync(`${env.AZ_STUB_REPLIES}.log`, "utf8").trim().split("\n");
  } catch {
    return [];
  }
};

// --- deploy-guard.mjs ------------------------------------------------------------------------------------------
const VARS = {
  AZURE_CLIENT_ID: "00000000-0000-0000-0000-0000000000c1",
  AZURE_TENANT_ID: TENANT,
  AZURE_SUBSCRIPTION_ID: SUB,
  PILOT_RESOURCE_GROUP: "rg-fcc-pilot",
  PILOT_WEBAPP_NAME: "fcc-pilot-abc123",
};

describe("deploy-guard dispatch (confirmation and branch)", () => {
  it("passes only for exactly DEPLOY on main", async () => {
    const r = await run("deploy-guard.mjs", ["dispatch"], { CONFIRM: "DEPLOY", REF: "refs/heads/main" });
    expect(r.code).toBe(0);
  });
  it.each(["deploy", "DEPLOY ", "yes", ""])("fails for confirmation %j", async (confirm) => {
    const r = await run("deploy-guard.mjs", ["dispatch"], { CONFIRM: confirm, REF: "refs/heads/main" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("::error::Deployment not confirmed");
  });
  it("fails for any branch other than main", async () => {
    const r = await run("deploy-guard.mjs", ["dispatch"], { CONFIRM: "DEPLOY", REF: "refs/heads/feature" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("Only main can be deployed");
  });
  it("rejects an unknown mode", async () => {
    expect((await run("deploy-guard.mjs", ["bogus"])).code).toBe(2);
  });
});

describe("deploy-guard config (GitHub variables)", () => {
  it("passes when all five variables are well-formed", async () => {
    expect((await run("deploy-guard.mjs", ["config"], VARS)).code).toBe(0);
  });
  it("lists every missing variable with where to set it", async () => {
    const r = await run("deploy-guard.mjs", ["config"]);
    expect(r.code).toBe(1);
    for (const v of Object.keys(VARS)) expect(r.out).toContain(`GitHub variable ${v} is not set`);
    expect(r.out).toContain("Settings → Environments → pilot");
  });
  it("rejects malformed values without echoing them", async () => {
    const r = await run("deploy-guard.mjs", ["config"], { ...VARS, AZURE_TENANT_ID: "contoso.onmicrosoft.com", PILOT_WEBAPP_NAME: "-bad-" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("AZURE_TENANT_ID is not a valid value");
    expect(r.out).toContain("PILOT_WEBAPP_NAME is not a valid value");
    expect(r.out).not.toContain("contoso.onmicrosoft.com");
  });
  it("refuses the FinThrive pilot by name and denied subscriptions by ID", async () => {
    expect((await run("deploy-guard.mjs", ["config"], { ...VARS, PILOT_RESOURCE_GROUP: "rg-FinThrive-pilot" })).out).toContain("FinThrive");
    const r = await run("deploy-guard.mjs", ["config"], { ...VARS, FCC_DENY_SUBSCRIPTION_IDS: `x, ${SUB.toUpperCase()}` });
    expect(r.code).toBe(1);
    expect(r.out).toContain("FCC_DENY_SUBSCRIPTION_IDS");
  });
});

describe("deploy-guard target (after azure/login)", () => {
  const account = { stdout: { id: SUB, tenantId: TENANT, name: "Pilot hosting" } };
  const HOST = "fcc-pilot-abc123-h7d.westeurope-01.azurewebsites.net";
  const site = { stdout: { defaultHostName: HOST, hostNames: [HOST], httpsOnly: true, tags: WORKLOAD } };
  const origin = { stdout: JSON.stringify(`https://${HOST}`) }; // az -o json prints a JSON string

  posixOnly("emits the real default host name (not a guessed azurewebsites.net URL)", async () => {
    const out = path.join(stubDir, "gh-output");
    writeFileSync(out, "");
    const r = await run("deploy-guard.mjs", ["target"], { ...VARS, ...azStub({ "account show": account, "webapp show": site, "webapp config appsettings list": origin }), GITHUB_OUTPUT: out });
    expect(r.code).toBe(0);
    expect(readFileSync(out, "utf8")).toBe("hostname=fcc-pilot-abc123-h7d.westeurope-01.azurewebsites.net\n");
  });
  posixOnly("fails when the signed-in tenant or subscription differs from the variables", async () => {
    const r = await run("deploy-guard.mjs", ["target"], { ...VARS, ...azStub({ "account show": { stdout: { id: SUB, tenantId: "00000000-0000-0000-0000-0000000000bb", name: "x" } }, "webapp show": site }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain("Signed-in tenant does not match");
  });
  posixOnly("refuses a web app without the FCC workload tag", async () => {
    const r = await run("deploy-guard.mjs", ["target"], { ...VARS, ...azStub({ "account show": account, "webapp show": { stdout: { ...site.stdout, tags: {} } }, "webapp config appsettings list": origin }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain("does not carry the tag fcc-workload=finops-command-center-azure-pilot");
  });
  posixOnly("refuses a subscription whose name matches the FinThrive pilot", async () => {
    const r = await run("deploy-guard.mjs", ["target"], { ...VARS, ...azStub({ "account show": { stdout: { ...account.stdout, name: "FinThrive Pilot" } }, "webapp show": site, "webapp config appsettings list": origin }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain("FinThrive");
  });
  posixOnly("fails when FCC_PUBLIC_ORIGIN is not one of the web app's real host names", async () => {
    const r = await run("deploy-guard.mjs", ["target"], { ...VARS, ...azStub({ "account show": account, "webapp show": site, "webapp config appsettings list": { stdout: JSON.stringify("https://fcc-pilot-abc123.azurewebsites.net") } }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain("FCC_PUBLIC_ORIGIN (https://fcc-pilot-abc123.azurewebsites.net) is not a host name");
    expect(r.out).toContain("Set the Bicep parameter publicOrigin");
  });
  posixOnly("reports a missing web app or missing permission clearly", async () => {
    const r = await run("deploy-guard.mjs", ["target"], { ...VARS, ...azStub({ "account show": account, "webapp show": { status: 3, stderr: "ERROR: (ResourceNotFound)" } }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain("was not found in resource group rg-fcc-pilot");
  });
  it("reports an unavailable az executable instead of crashing", async () => {
    const r = await run("deploy-guard.mjs", ["target"], { ...VARS, PATH: path.join(tmpdir(), "fcc-no-az-here") });
    expect(r.code).toBe(1);
    expect(r.out).toContain("could not run az");
  });
});

// --- check-deployment.mjs --------------------------------------------------------------------------------------
describe("check-deployment (post-deployment anonymous checks)", () => {
  let server: Server;
  let base = "";
  let handler: (req: IncomingMessage, res: ServerResponse) => void = () => {};
  beforeAll(async () => {
    server = createServer((req, res) => handler(req, res));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  const healthy = (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/api/health") return res.writeHead(200, { "content-type": "application/json" }).end('{"status":"ok"}');
    return false;
  };

  it("passes when healthy and pages redirect to Entra sign-in", async () => {
    handler = (req, res) => healthy(req, res) || res.writeHead(302, { location: "/.auth/login/aad?post_login_redirect_uri=/overview" }).end();
    const r = await run("check-deployment.mjs", ["--base-url", base, "--attempts", "1", "--interval-ms", "0"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("NOT verified");
  });
  it("retries, then fails with the last status when health never succeeds", async () => {
    handler = (_req, res) => res.writeHead(503).end("starting");
    const r = await run("check-deployment.mjs", ["--base-url", base, "--attempts", "3", "--interval-ms", "10"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("after 3 attempt(s); last result: HTTP 503");
  });
  it("fails when a 200 response is not the health JSON", async () => {
    handler = (_req, res) => res.writeHead(200).end("<html>default site</html>");
    const r = await run("check-deployment.mjs", ["--base-url", base, "--attempts", "1", "--interval-ms", "0"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("not the expected health JSON");
  });
  it("fails when pages are served without sign-in", async () => {
    handler = (req, res) => healthy(req, res) || res.writeHead(200).end("<html>overview</html>");
    const r = await run("check-deployment.mjs", ["--base-url", base, "--attempts", "1", "--interval-ms", "0"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("Sign-in gate check failed");
  });
  it("fails clearly when nothing is listening", async () => {
    const r = await run("check-deployment.mjs", ["--base-url", "http://127.0.0.1:9", "--attempts", "1", "--interval-ms", "0", "--timeout-ms", "2000"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("Health check failed");
  });
  it("refuses plain http for non-local hosts and invalid URLs", async () => {
    expect((await run("check-deployment.mjs", ["--base-url", "http://fcc.example.net"])).out).toContain("must use https");
    expect((await run("check-deployment.mjs", ["--base-url", "https://"])).code).toBe(1);
  });
});

// --- azure-preflight.mjs ---------------------------------------------------------------------------------------
describe("azure-preflight (read-only)", () => {
  let dir = "";
  let good = "";
  const RG = "rg-fcc-pilot";
  const target = ["--tenant", TENANT, "--subscription", SUB, "--resource-group", RG, "--location", "westeurope"];
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "fcc-preflight-"));
    const example = JSON.parse(readFileSync(path.join(ROOT, "infra/main.parameters.example.json"), "utf8"));
    const v = example.parameters;
    v.tenantId.value = TENANT;
    v.entraClientId.value = "00000000-0000-0000-0000-0000000000c2";
    v.approvedSubscriptionIds.value = `${SUB},00000000-0000-0000-0000-00000000000b`;
    v.sqlAdminGroupObjectId.value = "00000000-0000-0000-0000-0000000000d2";
    v.sqlAdminGroupName.value = "FCC SQL Admins";
    good = path.join(dir, "good.json");
    writeFileSync(good, JSON.stringify(example));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const azure = (over: Record<string, AzReply> = {}) =>
    azStub({
      "account show": { stdout: { id: SUB, tenantId: TENANT, name: "Pilot hosting", state: "Enabled", user: { name: "admin@example.test" } } },
      "provider show": { stdout: "Registered\n" },
      "group show": { stdout: { location: "westeurope", tags: WORKLOAD } },
      "deployment group what-if": { stdout: { changes: [{ changeType: "Create", resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Web/sites/x` }] } },
      ...over,
    });

  it("STOPs on the unfilled example parameters file (placeholders)", async () => {
    const r = await run("azure-preflight.mjs", ["--params-only", "--parameters", "infra/main.parameters.example.json"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("Parameter tenantId still contains a <placeholder>");
  });
  it("accepts a filled-in parameters file offline", async () => {
    const r = await run("azure-preflight.mjs", ["--params-only", "--parameters", good]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("no Azure checks were run");
  });
  it("rejects a namePrefix that would produce invalid Key Vault or SQL names", async () => {
    const bad = JSON.parse(readFileSync(good, "utf8"));
    bad.parameters.namePrefix.value = "1FCC_pilot";
    const f = path.join(dir, "bad-prefix.json");
    writeFileSync(f, JSON.stringify(bad));
    expect((await run("azure-preflight.mjs", ["--params-only", "--parameters", f])).out).toContain("namePrefix must be");
  });
  it("requires every target explicitly and never calls Azure without them", async () => {
    const env = azure();
    const r = await run("azure-preflight.mjs", ["--tenant", TENANT, "--parameters", good], env);
    expect(r.code).toBe(1);
    for (const k of ["--subscription", "--resource-group", "--location"]) expect(r.out).toContain(`${k} is required`);
    expect(azCalls(env)).toEqual([]);
  });
  it("refuses a FinThrive resource group before calling Azure", async () => {
    const env = azure();
    const r = await run("azure-preflight.mjs", ["--tenant", TENANT, "--subscription", SUB, "--resource-group", "rg-finthrive", "--location", "westeurope", "--parameters", good], env);
    expect(r.code).toBe(1);
    expect(r.out).toContain("FinThrive");
    expect(azCalls(env)).toEqual([]);
  });
  posixOnly("GO for review: read-only calls only, explicit --subscription on each, what-if saved", async () => {
    const env = azure();
    const out = path.join(dir, "wi.json");
    const r = await run("azure-preflight.mjs", [...target, "--parameters", good, "--what-if-out", out], env);
    expect(r.code).toBe(0);
    expect(r.out).toContain("GO for human review");
    expect(JSON.parse(readFileSync(out, "utf8")).changes).toHaveLength(1);
    const calls = azCalls(env);
    expect(calls.length).toBe(9);
    for (const c of calls) {
      expect(c).toMatch(/^(account show|provider show|group show|deployment group what-if) /);
      expect(c).toContain(`--subscription ${SUB}`);
    }
  });
  posixOnly("STOPs on a deletion or a change outside the resource group", async () => {
    const r = await run("azure-preflight.mjs", [...target, "--parameters", good, "--what-if-out", path.join(dir, "wi2.json")], azure({
      "deployment group what-if": { stdout: { changes: [
        { changeType: "Delete", resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Sql/servers/old` },
        { changeType: "Modify", resourceId: `/subscriptions/${SUB}/resourceGroups/other-rg/providers/Microsoft.Web/sites/y` },
      ] } },
    }));
    expect(r.code).toBe(1);
    expect(r.out).toContain("what-if: deletion of");
    expect(r.out).toContain("outside the pilot resource group");
  });
  posixOnly("STOPs on an untagged resource group, unregistered providers, or a tenant mismatch", async () => {
    expect((await run("azure-preflight.mjs", [...target, "--parameters", good], azure({ "group show": { stdout: { location: "westeurope", tags: {} } } }))).out).toContain("does not carry the tag");
    expect((await run("azure-preflight.mjs", [...target, "--parameters", good], azure({ "provider show --namespace Microsoft.Sql": { stdout: "NotRegistered\n" } }))).out).toContain("Microsoft.Sql (NotRegistered)");
    const r = await run("azure-preflight.mjs", [...target, "--parameters", good], azure({ "account show": { stdout: { id: SUB, tenantId: "00000000-0000-0000-0000-0000000000bb", name: "x", state: "Enabled" } } }));
    expect(r.code).toBe(1);
    expect(r.out).toContain("belongs to a different tenant");
  });
  posixOnly("explains quota or capacity failures from what-if", async () => {
    const r = await run("azure-preflight.mjs", [...target, "--parameters", good], azure({ "deployment group what-if": { status: 1, stderr: "ERROR: SubscriptionIsOverQuotaForSku" } }));
    expect(r.code).toBe(1);
    expect(r.out).toContain("quota or regional capacity");
  });
});

// --- contracts between the workflow, templates and scripts ------------------------------------------------------
describe("deployment contracts", () => {
  const deploy = readFileSync(path.join(ROOT, ".github/workflows/deploy-pilot.yml"), "utf8");
  const ci = readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const bicep = readFileSync(path.join(ROOT, "infra/main.bicep"), "utf8");
  const lib = readFileSync(path.join(ROOT, "scripts/pilot/lib/azure-target.mjs"), "utf8");

  it("deploy-pilot is manual-only, gated, OIDC-only and pins every action to a commit SHA", () => {
    expect(deploy).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
    expect(deploy).not.toMatch(/^\s+(push|pull_request|schedule|workflow_run):/m);
    for (const u of deploy.match(/uses: \S+/g) ?? []) expect(u).toMatch(/@[0-9a-f]{40}$/);
    expect(deploy).toContain("node scripts/pilot/deploy-guard.mjs dispatch");
    expect(deploy).toContain("node scripts/pilot/deploy-guard.mjs config");
    expect(deploy).toContain("node scripts/pilot/deploy-guard.mjs target");
    expect(deploy).toMatch(/needs: guard/);
    expect(deploy).toMatch(/environment: pilot/);
    expect(deploy.match(/id-token: write/g)).toHaveLength(1);
    expect(deploy).not.toMatch(/secrets\./);
    expect(deploy).not.toMatch(/azurewebsites\.net\/api\/health/);
    expect(deploy).toContain("steps.target.outputs.hostname");
  });
  it("CI fails on high production advisories and does not claim an unrecorded risk acceptance", () => {
    expect(ci).toContain("npm audit --omit=dev --audit-level=high");
    expect(ci).not.toMatch(/accepted exception/i);
  });
  it("main.bicep tags resources with the value the deploy gates require", () => {
    expect(lib).toContain('WORKLOAD_TAG = "fcc-workload"');
    expect(lib).toContain('WORKLOAD_TAG_VALUE = "finops-command-center-azure-pilot"');
    expect(bicep).toContain("union(tags, { 'fcc-workload': 'finops-command-center-azure-pilot' })");
    expect(bicep.match(/^ {2}tags: resourceTags$/gm)).toHaveLength(7);
  });
});
