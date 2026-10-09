#!/usr/bin/env node
// Starts the FinOps Command Center in local demo mode with no configuration required.
//   npm run demo        -> development server (hot reload)
//   npm run demo:prod   -> optimized production build, served locally in demo mode
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const mode = process.argv[2] === "prod" ? "prod" : "dev";
const port = process.env.PORT || "3000";
const env = { ...process.env, APP_MODE: "demo", NEXT_TELEMETRY_DISABLED: "1" };

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, ...args], { stdio: "inherit", env });
    const stop = () => child.kill("SIGINT");
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    child.on("exit", (code) => (code === 0 || code === null ? resolve() : reject(new Error(`next ${args[0]} exited with ${code}`))));
  });
}

console.log(`\n  FinOps Command Center — LOCAL DEMO (illustrative data)\n  Open http://localhost:${port}  ·  press Ctrl+C to stop\n`);
try {
  if (mode === "prod") {
    await run(["build"]);
    await run(["start", "-p", port]);
  } else {
    await run(["dev", "-p", port]);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
