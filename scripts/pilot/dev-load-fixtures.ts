// LOCAL VALIDATION ONLY. Loads the deterministic, clearly synthetic test fixtures ("FIXTURE:" descriptions,
// all-zero subscription GUIDs) into a LOCAL SQLite database through the real sync code path, so the pilot
// build can be exercised end-to-end without Azure. It refuses to run against Azure SQL or on App Service,
// and requires an explicit confirmation variable. This is never part of a deployment.
//   FCC_FIXTURES_CONFIRM=local-only FCC_SQLITE_PATH=./.data/pilot-local.db npm run -s dev:fixtures
import { openSqlite } from "../../src/pilot/db/sqlite";
import { migrate } from "../../src/pilot/db/migrations";
import { loadPilotConfig } from "../../src/pilot/config";
import { createArmClient } from "../../src/pilot/azure/arm";
import { runSync } from "../../src/pilot/sync/service";
import { touchUser } from "../../src/pilot/session";
import { fakeAzureFetch, SUB_A, SUB_B, TENANT } from "../../tests/pilot/fixtures/azure";

async function main() {
  if (process.env.FCC_FIXTURES_CONFIRM !== "local-only") throw new Error("Set FCC_FIXTURES_CONFIRM=local-only to confirm this is a local validation database");
  if (process.env.WEBSITE_SITE_NAME) throw new Error("Refusing to run on App Service");
  const path = process.env.FCC_SQLITE_PATH ?? "";
  if (!path || path === ":memory:") throw new Error("FCC_SQLITE_PATH must point to a local file");
  const cfg = loadPilotConfig({
    APP_MODE: "pilot",
    FCC_ENTRA_TENANT_ID: TENANT,
    FCC_AZURE_SUBSCRIPTION_IDS: `${SUB_A},${SUB_B}`,
    FCC_PUBLIC_ORIGIN: "http://localhost:3000",
    FCC_DB_DIALECT: "sqlite",
    FCC_ALLOW_LOCAL_SQLITE: "true",
    FCC_SQLITE_PATH: path,
    FCC_LOCAL_VALIDATION: "true",
  });
  if (!cfg.ok) throw new Error(cfg.problems.join("; "));
  const db = await openSqlite(path);
  await migrate(db);
  const client = createArmClient({ getToken: async () => "fixture-token", fetch: fakeAzureFetch({ resourcesPerSub: 40, advisorPerSub: 6 }), sleep: async () => {} });
  const r = await runSync({ db, config: cfg.config, client }, { trigger: "cli" });
  // Fixture users so FinOps can assign work locally (object IDs are obviously fake).
  const users = [
    { id: "00000000-0000-0000-0000-0000000000e1", name: "Fixture Engineer One", roles: ["engineering"] },
    { id: "00000000-0000-0000-0000-0000000000e2", name: "Fixture Engineer Two", roles: ["engineering"] },
  ] as const;
  for (const u of users) await touchUser(db, { id: u.id, tenantId: TENANT, name: u.name, email: null, roles: [...u.roles] });
  console.log(JSON.stringify({ loaded: r.outcomes.map((o) => `${o.source}:${o.status}`) }));
  await db.close();
}
main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
