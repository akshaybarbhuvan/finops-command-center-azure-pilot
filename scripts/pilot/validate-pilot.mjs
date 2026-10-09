#!/usr/bin/env node
// Offline validation of the Azure pilot build. Safe: creates nothing in Azure and uses no credentials.
//   npm run validate:pilot            full run (type check, lint, tests, pilot build, bundle scan, server smoke tests)
//   npm run validate:pilot -- --quick skip build and server checks
// Server smoke tests run the REAL pilot server against a temporary local SQLite database loaded with clearly
// synthetic fixtures, and simulate the identity header that Azure App Service Authentication injects.
// They prove application behaviour, NOT live Azure connectivity (see docs/PILOT_READINESS_REPORT.md).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const quick = process.argv.includes("--quick");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const results = [];
const ok = (name, detail = "") => (results.push({ name, ok: true }), console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`));
const fail = (name, detail = "") => (results.push({ name, ok: false }), console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`));
const step = (name, cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, ...env }, shell: process.platform === "win32" });
  if (r.status === 0) ok(name);
  else fail(name, (r.stdout + r.stderr).trim().split("\n").slice(-6).join(" | "));
  return r.status === 0;
};

console.log("\nFinOps Command Center — Azure pilot offline validation\n");
step("Type check", npm, ["run", "-s", "typecheck"]);
step("Lint", npm, ["run", "-s", "lint"]);
step("Unit, integration and UI tests (demo + pilot)", npm, ["run", "-s", "test"]);

// Infrastructure templates (requires the Bicep CLI: `az bicep install` or a standalone bicep binary).
const bicep = process.env.BICEP_BIN || (spawnSync(process.platform === "win32" ? "where" : "which", ["bicep"], { encoding: "utf8" }).stdout.trim().split("\n")[0] ?? "");
if (bicep && existsSync("infra")) {
  for (const f of ["infra/main.bicep", "infra/subscription-reader-access.bicep"]) step(`Bicep build ${f}`, bicep, ["build", f, "--stdout"]);
  step("Bicep lint infra/main.bicep", bicep, ["lint", "infra/main.bicep"]);
} else {
  fail("Bicep validation", "Bicep CLI not found (set BICEP_BIN or install with `az bicep install`) — templates NOT validated");
}

if (!quick) {
  const built = step("Pilot production build (only *.pilot routes)", npm, ["run", "-s", "build:pilot"]);
  if (built) {
    // 1. The pilot bundle must not contain demo data or demo authentication.
    const markers = ["Priya Raman", "Marcus Hill", "REC-2041", "Local Demo Ticketing", "fcc.demo.v1", "Simulated local sign-in", "SAP S/4HANA"];
    const hits = new Set();
    const walk = (dir) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        const st = statSync(p);
        if (st.isDirectory()) {
          if (e === "node_modules") continue;
          walk(p);
        } else if (/\.(js|html|json|rsc|txt|css)$/.test(e) && st.size < 20_000_000) {
          const text = readFileSync(p, "utf8");
          for (const m of markers) if (text.includes(m)) hits.add(`${m} in ${p}`);
        }
      }
    };
    walk(".next-pilot/static");
    walk(".next-pilot/server");
    if (hits.size) fail("Pilot bundle contains no demo data or demo sign-in", [...hits].slice(0, 5).join("; "));
    else ok("Pilot bundle contains no demo data or demo sign-in", `${markers.length} markers checked`);

    await serverChecks();
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length ? "NOT READY" : "PASSED"} — ${results.length - failed.length}/${results.length} checks passed`);
console.log("Live Azure checks (sign-in, Resource Graph, Cost Management, Advisor, Azure SQL) are NOT covered here; see docs/PILOT_RUNBOOK.md.\n");
process.exit(failed.length ? 1 : 0);

// -------------------------------------------------------------------------------------------------------------
async function serverChecks() {
  const dir = mkdtempSync(join(tmpdir(), "fcc-pilot-"));
  const dbPath = resolve(dir, "pilot.db");
  const TENANT = "00000000-0000-0000-0000-0000000000aa";
  const SUBS = "00000000-0000-0000-0000-00000000000a,00000000-0000-0000-0000-00000000000b";
  const port = 3290;
  const origin = `http://localhost:${port}`;
  const env = {
    APP_MODE: "pilot",
    FCC_BUILD_TARGET: "pilot",
    FCC_AUTH_MODE: "appservice",
    FCC_ENTRA_TENANT_ID: TENANT,
    FCC_AZURE_SUBSCRIPTION_IDS: SUBS,
    FCC_PUBLIC_ORIGIN: origin,
    FCC_DB_DIALECT: "sqlite",
    FCC_ALLOW_LOCAL_SQLITE: "true",
    FCC_SQLITE_PATH: dbPath,
    FCC_LOCAL_VALIDATION: "true",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  if (!step("Local fixture database (migrations + synthetic fixtures via the real sync code)", npm, ["run", "-s", "dev:fixtures"], { ...env, FCC_FIXTURES_CONFIRM: "local-only" })) return;

  const principal = (id, name, roles) => {
    const claims = [
      { typ: "http://schemas.microsoft.com/identity/claims/objectidentifier", val: id },
      { typ: "http://schemas.microsoft.com/identity/claims/tenantid", val: TENANT },
      { typ: "name", val: name },
      ...roles.map((r) => ({ typ: "roles", val: r })),
    ];
    return { "x-ms-client-principal": Buffer.from(JSON.stringify({ auth_typ: "aad", claims, role_typ: "roles" })).toString("base64"), "x-ms-client-principal-idp": "aad" };
  };
  const U = {
    exec: principal("00000000-0000-0000-0000-0000000000a1", "Fixture Executive", ["FCC.Executive"]),
    finops: principal("00000000-0000-0000-0000-0000000000f1", "Fixture FinOps", ["FCC.FinOps"]),
    eng1: principal("00000000-0000-0000-0000-0000000000e1", "Fixture Engineer One", ["FCC.Engineering"]),
    eng2: principal("00000000-0000-0000-0000-0000000000e2", "Fixture Engineer Two", ["FCC.Engineering"]),
    admin: principal("00000000-0000-0000-0000-0000000000d1", "Fixture Admin", ["FCC.Admin"]),
  };

  const start = (extraEnv = {}) => {
    const child = spawn(process.execPath, ["server.js"], { cwd: ".next-pilot/standalone", env: { ...process.env, ...env, ...extraEnv, PORT: String(port), HOSTNAME: "127.0.0.1" }, stdio: "ignore" });
    return child;
  };
  const waitUp = async () => {
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        const r = await fetch(`${origin}/api/health`);
        if (r.status) return true;
      } catch {
        /* not up yet */
      }
    }
    return false;
  };
  const get = (path, who, extra = {}) => fetch(`${origin}${path}`, { headers: { ...(who ?? {}), ...extra }, redirect: "manual" });
  const post = (path, who, body, extra = {}) =>
    fetch(`${origin}${path}`, { method: "POST", headers: { ...(who ?? {}), origin, "content-type": "application/json", "x-fcc-request": "1", ...extra }, body: JSON.stringify(body), redirect: "manual" });
  const check = async (name, fn) => {
    try {
      const detail = await fn();
      ok(name, detail ?? "");
    } catch (e) {
      fail(name, e.message);
    }
  };
  const expect = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };

  let child = start();
  try {
    if (!(await waitUp())) return fail("Pilot server starts", "did not respond on /api/health");
    ok("Pilot server starts (standalone build)");
    await check("Anonymous: liveness only; pages redirect to Entra sign-in; APIs return 401", async () => {
      const h = await get("/api/health");
      expect(h.status === 200 && (await h.text()) === '{"status":"ok"}', "health");
      const p = await get("/overview");
      expect(p.status === 307 && (p.headers.get("location") ?? "").includes("/.auth/login/aad"), `overview → ${p.status} ${p.headers.get("location")}`);
      const a = await get("/api/recommendations/export");
      expect(a.status === 401, `export → ${a.status}`);
      const demo = await get("/login");
      expect(demo.status === 307, "the demo login page must not exist in the pilot");
    });
    await check("Security headers: nonce-based CSP on pages, HSTS, frame denial", async () => {
      const r = await get("/overview", U.exec);
      for (const h of ["content-security-policy", "strict-transport-security", "x-frame-options", "x-content-type-options"]) expect(r.headers.get(h), `missing ${h}`);
      const csp = r.headers.get("content-security-policy");
      const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
      expect(nonce && !csp.includes("'unsafe-inline' 'nonce") && !/script-src[^;]*unsafe-inline/.test(csp), `weak script-src: ${csp}`);
      const html = await r.text();
      const scripts = html.match(/<script[^>]*>/g) ?? [];
      expect(scripts.length > 0 && scripts.every((t) => t.includes(`nonce="${nonce}"`)), `${scripts.filter((t) => !t.includes(nonce)).length} scripts without the nonce`);
      return `${scripts.length} scripts carry the per-request nonce`;
    });
    await check("Executive overview renders live-source labels and no fallback data", async () => {
      const r = await get("/overview", U.exec);
      const t = await r.text();
      expect(r.status === 200, `status ${r.status}`);
      for (const s of ["Executive Overview", "Azure Cost Management", "Verified savings", "Advisor estimate", "USD"]) expect(t.includes(s), `missing "${s}"`);
    });
    let recId = "";
    await check("FinOps sees the portfolio; export is scoped and carries currency-labelled estimates", async () => {
      const r = await get("/api/recommendations/export?stage=", U.finops);
      const csv = await r.text();
      const lines = csv.trim().split(/\r?\n/);
      expect(r.status === 200 && lines.length === 13, `expected 12 rows, got ${lines.length - 1}`);
      expect(lines[0].includes("est_currency"), "est_currency column");
      recId = lines[1].split(",")[0].replace(/^﻿/, "");
      expect(/^[0-9a-f-]{36}$/.test(recId), "rec id");
      return `${lines.length - 1} rows`;
    });
    await check("Role boundaries: executive and admin cannot mutate; FinOps validates and assigns", async () => {
      expect((await post(`/api/recommendations/${recId}/actions`, U.exec, { action: "validate", expectedVersion: 1 })).status === 403, "exec");
      expect((await post(`/api/recommendations/${recId}/actions`, U.admin, { action: "validate", expectedVersion: 1 })).status === 403, "admin");
      expect((await post(`/api/recommendations/${recId}/actions`, U.finops, { action: "validate", expectedVersion: 1 }, { origin: "https://evil.example" })).status === 403, "csrf");
      expect((await post(`/api/recommendations/${recId}/actions`, U.finops, { action: "validate", expectedVersion: 1 })).status === 200, "validate");
      const a = await post(`/api/recommendations/${recId}/actions`, U.finops, { action: "assign", expectedVersion: 2, ownerId: "00000000-0000-0000-0000-0000000000e1" });
      expect(a.status === 200, `assign ${a.status}`);
    });
    await check("Record-level isolation: Engineer Two gets 404 for Engineer One's record (page, API, export)", async () => {
      expect((await post(`/api/recommendations/${recId}/actions`, U.eng2, { action: "start", expectedVersion: 3 })).status === 404, "api");
      expect((await get(`/recommendations/${recId}`, U.eng2)).status === 404, "page");
      const csv = await (await get("/api/recommendations/export?stage=", U.eng2)).text();
      expect(csv.trim().split(/\r?\n/).length === 1, "export not empty");
      expect((await post(`/api/recommendations/${recId}/actions`, U.eng1, { action: "start", expectedVersion: 3 })).status === 200, "owner start");
    });
    await check("Role pages: executive blocked from FinOps workbench; admin sees connector health", async () => {
      expect((await (await get("/finops", U.exec)).text()).includes("Not available for your role"), "exec /finops");
      const t = await (await get("/admin", U.admin)).text();
      expect(t.includes("Connector health by subscription") && t.includes("Connected"), "admin health");
      expect((await (await get("/admin", U.finops)).text()).includes("Not available for your role"), "finops /admin");
    });
    child.kill();
    await new Promise((r) => setTimeout(r, 500));
    child = start();
    if (!(await waitUp())) throw new Error("restart failed");
    await check("Workflow state persists across a server restart", async () => {
      const t = await (await get(`/recommendations/${recId}`, U.eng1)).text();
      expect(t.includes("In progress") && t.includes("Fixture Engineer One"), "stage/owner after restart");
    });
  } finally {
    child.kill();
  }

  // Misconfiguration must fail closed.
  await new Promise((r) => setTimeout(r, 500));
  child = start({ FCC_AZURE_SUBSCRIPTION_IDS: "" });
  try {
    if (await waitUp()) {
      await check("Incomplete configuration fails closed (503, no data, no fallback)", async () => {
        const p = await get("/overview", U.exec);
        const t = await p.text();
        expect(p.status === 503 && t.includes("Pilot configuration is incomplete"), `page ${p.status}`);
        expect((await get("/api/recommendations/export", U.exec)).status === 503, "api");
      });
    } else fail("Incomplete configuration fails closed", "server did not start");
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
}
