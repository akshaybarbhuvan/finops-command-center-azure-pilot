#!/usr/bin/env node
// Pre-demo readiness check. Non-destructive: reads files, runs checks, starts temporary local servers, then stops them.
//   npm run validate:demo               full check (tests, typecheck, lint, build, route smoke test, pilot-mode gate)
//   npm run validate:demo -- --quick    skips the production build and route checks
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const quick = process.argv.includes("--quick");
const results = [];
const ok = (name, detail = "") => (results.push({ name, ok: true, detail }), console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`));
const fail = (name, detail = "") => (results.push({ name, ok: false, detail }), console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };

function step(name, cmd, args, extraEnv = {}) {
  const r = spawnSync(cmd, args, { stdio: "pipe", env: { ...env, ...extraEnv }, shell: process.platform === "win32", encoding: "utf8" });
  if (r.status === 0) ok(name);
  else fail(name, (r.stdout + r.stderr).split("\n").filter(Boolean).slice(-8).join(" | "));
  return r.status === 0;
}

console.log("\nFinOps Command Center — demo readiness check\n");

// 1. Environment
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj > 20 || (maj === 20 && min >= 9)) ok("Node.js version", process.versions.node);
else fail("Node.js version", `${process.versions.node} (requires >= 20.9)`);
if (existsSync("node_modules/next")) ok("Dependencies installed");
else fail("Dependencies installed", "run `npm install`");
for (const f of [".env", ".env.local"]) {
  if (!existsSync(f)) continue;
  const text = readFileSync(f, "utf8");
  const m = text.match(/^\s*APP_MODE\s*=\s*(\w+)/m);
  if (m && m[1] !== "demo") fail(`${f} APP_MODE`, `is "${m[1]}" — \`npm run dev\` would not start in demo mode (npm run demo still forces demo)`);
  if (/(SECRET|PASSWORD|TOKEN|CLIENT_SECRET|CONNECTION_STRING)\s*=/i.test(text)) fail(`${f} secrets`, "secret-like variables found; the demo needs none");
}
ok("Demo mode", "npm run demo forces APP_MODE=demo; no secrets required");

// 2. Static quality gates
if (!existsSync("node_modules/next")) {
  console.log("\nStopping: dependencies are missing.");
  process.exit(1);
}
step("Seed data validation & unit/UI tests", npm, ["run", "-s", "test"]);
step("Type check", npm, ["run", "-s", "typecheck"]);
step("Lint", npm, ["run", "-s", "lint"]);

// 3. Build + route smoke test + pilot gate
const ROUTES = ["/", "/login", "/overview", "/finops", "/engineering", "/admin", "/cost", "/budgets", "/anomalies", "/optimization", "/recommendations", "/recommendations/REC-2041", "/savings", "/governance", "/resources", "/tickets", "/reports", "/roadmap"];

async function serve(mode, port) {
  const nextBin = require.resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "start", "-p", String(port)], { env: { ...env, APP_MODE: mode }, stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/overview`);
      if (res.status) return child; // any HTTP response means the server is up (pilot answers 401)
    } catch {
      /* not ready yet */
    }
  }
  child.kill();
  throw new Error(`server (${mode}) did not start on port ${port}`);
}

let demoChunks = [];
if (!quick && step("Production build", npm, ["run", "-s", "build"])) {
  let child;
  try {
    child = await serve("demo", 3199);
    const bad = [];
    for (const r of ROUTES) {
      const res = await fetch(`http://127.0.0.1:3199${r}`);
      const html = await res.text();
      if (!res.ok || !html.includes("FinOps Command Center")) bad.push(`${r} (${res.status})`);
    }
    // Remember the demo login page's JavaScript so the pilot check can prove it is not served there.
    const loginHtml = await (await fetch("http://127.0.0.1:3199/login")).text();
    demoChunks = [...new Set(loginHtml.match(/\/_next\/static\/[^"]+\.js/g) ?? [])];
    if (bad.length) fail("All routes respond in demo mode", bad.join(", "));
    else ok("All routes respond in demo mode", `${ROUTES.length} routes`);
  } catch (e) {
    fail("Demo server", e.message);
  } finally {
    child?.kill();
  }
  try {
    child = await serve("pilot", 3198);
    const leaks = [];
    for (const r of ["/overview", "/login", "/login?reset=1", "/finops", "/engineering", "/recommendations/REC-2041"]) {
      const html = await (await fetch(`http://127.0.0.1:3198${r}`)).text();
      if (/Demo account|Simulated local sign-in|Switch demo user|Local Demo Persona|Engineering Owner|Assigned workload|Priya Raman|Marcus Hill|Alex Morgan|Jordan Lee/.test(html) || !html.includes("single sign-on")) leaks.push(r);
    }
    let served = 0;
    for (const js of demoChunks) {
      const res = await fetch(`http://127.0.0.1:3198${js}`);
      const body = await res.text();
      if (res.ok || /Marcus Hill|Priya Raman|Simulated local sign-in/.test(body)) served++;
    }
    if (!demoChunks.length) leaks.push("(no demo chunks captured)");
    else if (served) leaks.push(`${served} of ${demoChunks.length} demo JavaScript chunks served`);
    if (!leaks.length) ok("No demo login or bypass in pilot mode", "no demo sign-in or demo accounts on /overview, /login, /login?reset=1, /finops, /engineering, /recommendations/REC-2041; SSO gate shown; demo JavaScript not served");
    else fail("No demo login or bypass in pilot mode", `demo sign-in exposed with APP_MODE=pilot: ${leaks.join(", ")}`);
  } catch (e) {
    fail("Pilot gate", e.message);
  } finally {
    child?.kill();
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length ? "NOT READY" : "READY"} — ${results.length - failed.length}/${results.length} checks passed\n`);
process.exit(failed.length ? 1 : 0);
