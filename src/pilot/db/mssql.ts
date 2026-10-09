// Azure SQL Database adapter. Authenticates with Microsoft Entra ID (managed identity on App Service,
// developer / CI identity elsewhere) — no SQL passwords are used or accepted.
// NOTE: not executed against a live Azure SQL database in the implementation workspace; see PILOT_READINESS_REPORT.md.
import type { Db, DbValue, Params } from "./types";

type MssqlModule = typeof import("mssql");
type Pool = import("mssql").ConnectionPool;
type Tx = import("mssql").Transaction;

function addInputs(sql: MssqlModule, req: import("mssql").Request, params?: Params) {
  for (const [name, v] of Object.entries(params ?? {})) addInput(sql, req, name, v);
}
function addInput(sql: MssqlModule, req: import("mssql").Request, name: string, v: DbValue) {
  if (v === null) req.input(name, sql.NVarChar(sql.MAX), null);
  else if (typeof v === "bigint") req.input(name, sql.BigInt, v.toString());
  else if (typeof v === "number") req.input(name, Number.isInteger(v) ? sql.BigInt : sql.Float, v);
  // Bounded NVARCHAR for normal values so comparisons with indexed NVARCHAR(n) key columns can use index seeks.
  else req.input(name, v.length <= 4000 ? sql.NVarChar(4000) : sql.NVarChar(sql.MAX), v);
}

export interface MssqlOptions {
  server: string;
  database: string;
  managedIdentityClientId?: string;
}

export async function openMssql(opts: MssqlOptions): Promise<Db> {
  const sql: MssqlModule = (await import("mssql")).default as unknown as MssqlModule;
  const pool: Pool = new sql.ConnectionPool({
    server: opts.server,
    database: opts.database,
    authentication: {
      type: "azure-active-directory-default",
      options: opts.managedIdentityClientId ? { clientId: opts.managedIdentityClientId } : {},
    },
    options: { encrypt: true, trustServerCertificate: false },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 30000,
    requestTimeout: 30000,
  } as import("mssql").config);
  await pool.connect();

  const make = (tx: Tx | null): Db => {
    const request = () => (tx ? new sql.Request(tx) : new sql.Request(pool));
    const db: Db = {
      dialect: "mssql",
      async all<T>(text: string, params?: Params) {
        const req = request();
        addInputs(sql, req, params);
        const r = await req.query(text);
        return r.recordset as T[];
      },
      async get<T>(text: string, params?: Params) {
        const rows = await db.all<T>(text, params);
        return rows[0];
      },
      async run(text: string, params?: Params) {
        const req = request();
        addInputs(sql, req, params);
        const r = await req.query(text);
        return { changes: r.rowsAffected.reduce((a, b) => a + b, 0) };
      },
      async exec(script: string) {
        await request().batch(script);
      },
      async tx<T>(fn: (d: Db) => Promise<T>): Promise<T> {
        if (tx) return fn(db);
        const t = new sql.Transaction(pool);
        await t.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
        try {
          const result = await fn(make(t));
          await t.commit();
          return result;
        } catch (e) {
          try {
            await t.rollback();
          } catch {
            /* rollback after a server-aborted transaction can fail; the original error is what matters */
          }
          throw e;
        }
      },
      paginate(limitParam: string, offsetParam: string) {
        return `OFFSET @${offsetParam} ROWS FETCH NEXT @${limitParam} ROWS ONLY`;
      },
      async close() {
        if (!tx) await pool.close();
      },
    };
    return db;
  };
  return make(null);
}
