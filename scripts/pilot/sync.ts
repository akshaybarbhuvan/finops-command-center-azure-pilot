// Runs one refresh of the configured Azure sources from an operator workstation (uses your Azure CLI sign-in,
// which must hold the same read-only roles as the application identity). Reads the same FCC_* settings as the app.
//   npm run sync:pilot                 -> all sources
//   npm run sync:pilot -- cost advisor -> selected sources
import { loadPilotConfig } from "../../src/pilot/config";
import { openDb } from "../../src/pilot/db";
import { schemaIsCurrent } from "../../src/pilot/db/migrations";
import { createArmClient } from "../../src/pilot/azure/arm";
import { armTokenProvider, createCredential } from "../../src/pilot/azure/token";
import { runSync, SYNC_SOURCES, type SyncSource } from "../../src/pilot/sync/service";

async function main() {
  const cfg = loadPilotConfig(process.env);
  if (!cfg.ok) throw new Error(`Configuration incomplete:\n - ${cfg.problems.join("\n - ")}`);
  const sources = process.argv.slice(2).filter((a): a is SyncSource => (SYNC_SOURCES as string[]).includes(a));
  const db = await openDb(cfg.config);
  try {
    if (!(await schemaIsCurrent(db))) throw new Error("Database schema is not current. Run `npm run db:migrate` first.");
    const client = createArmClient({ getToken: armTokenProvider(createCredential(process.env, cfg.config.managedIdentityClientId)) });
    const ctl = new AbortController();
    const deadline = setTimeout(() => ctl.abort(), 45 * 60_000); // same hard stop as the application; lock lease is 60 minutes
    const report = await runSync({ db, config: cfg.config, client, signal: ctl.signal }, { sources: sources.length ? sources : undefined, trigger: "cli", triggeredBy: null });
    clearTimeout(deadline);
    for (const o of report.outcomes) console.log(JSON.stringify(o));
    for (const s of report.skipped) console.log(JSON.stringify({ skipped: s.source, reason: s.reason }));
    if (report.outcomes.some((o) => o.status === "failed" || o.status === "unauthorized")) process.exitCode = 2;
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
