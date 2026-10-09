// Applies pending database migrations. Run by an operator with an identity that has DDL rights on the database.
//   Azure SQL:  FCC_DB_DIALECT=mssql FCC_SQL_SERVER=<server>.database.windows.net FCC_SQL_DATABASE=<db> npm run db:migrate
//               (authenticates with your Azure CLI / Entra sign-in; no SQL passwords)
//   Local:      FCC_DB_DIALECT=sqlite FCC_SQLITE_PATH=./.data/pilot.db npm run db:migrate
// Safe to re-run: applied migrations are skipped; a modified applied migration stops the run.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openDb } from "../../src/pilot/db";
import { migrate, MIGRATIONS } from "../../src/pilot/db/migrations";

async function main() {
  const dialect = (process.env.FCC_DB_DIALECT ?? "").trim();
  let db;
  if (dialect === "mssql") {
    const server = process.env.FCC_SQL_SERVER ?? "";
    const database = process.env.FCC_SQL_DATABASE ?? "";
    if (!server || !database) throw new Error("FCC_SQL_SERVER and FCC_SQL_DATABASE are required");
    db = await openDb({ db: { dialect: "mssql", server, database }, managedIdentityClientId: process.env.FCC_MANAGED_IDENTITY_CLIENT_ID || undefined });
  } else if (dialect === "sqlite") {
    if (process.env.WEBSITE_SITE_NAME) throw new Error("SQLite is not allowed on App Service");
    const path = process.env.FCC_SQLITE_PATH ?? "";
    if (!path) throw new Error("FCC_SQLITE_PATH is required");
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    db = await openDb({ db: { dialect: "sqlite", path } });
  } else {
    throw new Error("Set FCC_DB_DIALECT to 'mssql' or 'sqlite'");
  }
  try {
    const r = await migrate(db);
    console.log(JSON.stringify({ result: "ok", dialect, applied: r.applied, alreadyApplied: r.alreadyApplied, latest: Math.max(...MIGRATIONS.map((m) => m.version)) }));
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(JSON.stringify({ result: "failed", error: (e as Error).message }));
  process.exit(1);
});
