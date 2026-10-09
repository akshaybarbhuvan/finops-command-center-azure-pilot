#!/usr/bin/env node
// Starts the built pilot server locally (for validation). On App Service the startup command is `node server.js`.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
if (!existsSync(".next-pilot/standalone/server.js")) {
  console.error("Run `npm run build:pilot` first.");
  process.exit(1);
}
const child = spawn(process.execPath, ["server.js"], { cwd: ".next-pilot/standalone", stdio: "inherit", env: { ...process.env, FCC_BUILD_TARGET: "pilot", NEXT_TELEMETRY_DISABLED: "1" } });
child.on("exit", (c) => process.exit(c ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
