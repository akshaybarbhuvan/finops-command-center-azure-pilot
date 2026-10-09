// Local SQLite adapter — for automated tests and local validation of the pilot build only.
// Configuration refuses this dialect on App Service (see config.ts).
import type { Db, Params } from "./types";

type Sqlite = import("better-sqlite3").Database;

function bind(params?: Params) {
  if (!params) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) out[k] = v;
  return out;
}

class Mutex {
  private last: Promise<void> = Promise.resolve();
  async lock(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const prev = this.last;
    this.last = prev.then(() => next);
    await prev;
    return release;
  }
}

export async function openSqlite(path: string): Promise<Db> {
  const { default: Database } = await import("better-sqlite3");
  const raw: Sqlite = new Database(path);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  raw.pragma("busy_timeout = 5000");
  raw.defaultSafeIntegers(true); // BIGINT money values come back as bigint, never lossy numbers
  const mutex = new Mutex();
  let depth = 0;

  const make = (inTx: boolean): Db => {
    const db: Db = {
      dialect: "sqlite",
      async all<T>(sql: string, params?: Params) {
        return raw.prepare(sql).all(bind(params)) as T[];
      },
      async get<T>(sql: string, params?: Params) {
        return raw.prepare(sql).get(bind(params)) as T | undefined;
      },
      async run(sql: string, params?: Params) {
        const r = raw.prepare(sql).run(bind(params));
        return { changes: Number(r.changes) };
      },
      async exec(script: string) {
        raw.exec(script);
      },
      async tx<T>(fn: (d: Db) => Promise<T>): Promise<T> {
        if (inTx) return fn(db);
        const release = await mutex.lock();
        depth++;
        raw.exec("BEGIN IMMEDIATE");
        try {
          const result = await fn(make(true));
          raw.exec("COMMIT");
          return result;
        } catch (e) {
          if (raw.inTransaction) raw.exec("ROLLBACK");
          throw e;
        } finally {
          depth--;
          release();
        }
      },
      paginate(limitParam: string, offsetParam: string) {
        return `LIMIT @${limitParam} OFFSET @${offsetParam}`;
      },
      async close() {
        if (depth === 0) raw.close();
      },
    };
    return db;
  };
  return make(false);
}
