import "server-only";
import type { PilotConfig } from "../config";
import { schemaIsCurrent } from "./migrations";
import type { Db } from "./types";

export type { Db } from "./types";

export async function openDb(c: Pick<PilotConfig, "db" | "managedIdentityClientId">): Promise<Db> {
  if (c.db.dialect === "mssql") {
    const { openMssql } = await import("./mssql");
    return openMssql({ server: c.db.server, database: c.db.database, managedIdentityClientId: c.managedIdentityClientId });
  }
  const { openSqlite } = await import("./sqlite");
  return openSqlite(c.db.path);
}

export class SchemaNotReadyError extends Error {
  constructor() {
    super("Database schema is not at the version this application requires. Run `npm run db:migrate` (see docs/DEPLOYMENT.md).");
  }
}

let shared: Promise<Db> | null = null;
let schemaChecked = false;

/** Process-wide connection. Refuses to serve data until migrations have been applied by an operator. */
export async function getDb(c: PilotConfig): Promise<Db> {
  if (!shared) {
    shared = openDb(c).catch((e) => {
      shared = null;
      throw e;
    });
  }
  const db = await shared;
  if (!schemaChecked) {
    if (!(await schemaIsCurrent(db))) throw new SchemaNotReadyError();
    schemaChecked = true;
  }
  return db;
}

/** Test hook: replace the shared connection. */
export function setDbForTests(db: Db | null) {
  shared = db ? Promise.resolve(db) : null;
  schemaChecked = false;
}
