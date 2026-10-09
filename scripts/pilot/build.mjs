#!/usr/bin/env node
// Builds the Azure pilot target (only *.pilot.ts(x) routes) into .next-pilot, as a standalone server bundle
// ready for App Service: .next-pilot/standalone (server.js) + static assets copied alongside.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const env = { ...process.env, FCC_BUILD_TARGET: "pilot", NEXT_TELEMETRY_DISABLED: "1" };
rmSync(".next-pilot", { recursive: true, force: true });
const r = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "build"], { stdio: "inherit", env });
if (r.status !== 0) process.exit(r.status ?? 1);
// Standalone output does not include static assets; App Service needs them next to server.js.
cpSync(".next-pilot/static", ".next-pilot/standalone/.next-pilot/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next-pilot/standalone/public", { recursive: true });
console.log("\nPilot build ready: .next-pilot/standalone (start with `node server.js`, FCC_BUILD_TARGET=pilot)");
