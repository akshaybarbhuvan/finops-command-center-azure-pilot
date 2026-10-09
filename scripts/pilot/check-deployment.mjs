#!/usr/bin/env node
// Post-deployment anonymous checks against the deployed pilot. Exits non-zero, with the reason, if either fails.
//   node scripts/pilot/check-deployment.mjs --base-url https://<default-host-name> [--attempts 30] [--interval-ms 10000]
// 1. Liveness: GET /api/health returns 200 {"status":"ok"} (retried while the app starts).
// 2. Sign-in gate: an anonymous GET /overview is redirected to Microsoft Entra sign-in (/.auth/login/aad) or refused (401),
//    proving App Service Authentication is in front of the pages.
// These checks do NOT prove that database migrations ran, that Entra sign-in succeeds for a real user, or that
// Azure data connectors work. Those are the live acceptance checks in docs/PILOT_RUNBOOK.md §2.

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};
const fail = (msg) => {
  console.log(`::error::${msg}`);
  process.exit(1);
};

const baseUrl = arg("base-url", "");
const attempts = Number(arg("attempts", "30"));
const intervalMs = Number(arg("interval-ms", "10000"));
const timeoutMs = Number(arg("timeout-ms", "10000"));

let base;
try {
  base = new URL(baseUrl);
} catch {
  fail(`--base-url "${baseUrl}" is not a valid URL.`);
}
const local = ["localhost", "127.0.0.1"].includes(base.hostname);
if (base.protocol !== "https:" && !(local && base.protocol === "http:")) fail(`--base-url must use https (got ${base.protocol}).`);
if (!Number.isInteger(attempts) || attempts < 1 || !Number.isFinite(intervalMs) || intervalMs < 0) fail("--attempts must be a positive integer and --interval-ms a non-negative number.");

const get = (path) => fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { "cache-control": "no-cache" } });

let last = "no response";
let healthy = false;
for (let i = 1; i <= attempts && !healthy; i++) {
  try {
    const r = await get("/api/health");
    const body = await r.text();
    let status;
    try {
      status = JSON.parse(body)?.status;
    } catch {
      status = undefined;
    }
    if (r.status === 200 && status === "ok") healthy = true;
    else last = `HTTP ${r.status}${status === undefined ? " (body is not the expected health JSON)" : ""}`;
  } catch (e) {
    last = e?.cause?.code ?? e?.name ?? String(e);
  }
  if (!healthy && i < attempts) await new Promise((r) => setTimeout(r, intervalMs));
}
if (!healthy) fail(`Health check failed: ${new URL("/api/health", base)} did not return 200 {"status":"ok"} after ${attempts} attempt(s); last result: ${last}.`);
console.log(`✓ Liveness: ${new URL("/api/health", base)} returned 200 {"status":"ok"}`);

let gate;
try {
  gate = await get("/overview");
} catch (e) {
  fail(`Sign-in gate check failed: request to /overview errored (${e?.cause?.code ?? e?.name ?? e}).`);
}
const location = gate.headers.get("location") ?? "";
if (gate.status >= 300 && gate.status < 400 && location.includes("/.auth/login/aad")) console.log(`✓ Sign-in gate: anonymous /overview → HTTP ${gate.status} to Microsoft Entra sign-in`);
else if (gate.status === 401) console.log("✓ Sign-in gate: anonymous /overview → HTTP 401");
else fail(`Sign-in gate check failed: anonymous /overview returned HTTP ${gate.status}${location ? ` → ${location}` : ""}. Pages must redirect to /.auth/login/aad; check App Service Authentication (authsettingsV2) before letting users in.`);

console.log("Anonymous post-deployment checks passed. Database migrations, real sign-in and Azure data connectors are NOT verified by this check (docs/PILOT_RUNBOOK.md §2).");
