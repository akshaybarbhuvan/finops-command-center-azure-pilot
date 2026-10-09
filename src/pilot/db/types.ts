export type DbValue = string | number | bigint | null;
export type Params = Record<string, DbValue>;

/**
 * Minimal database interface shared by Azure SQL (mssql) and local SQLite.
 * SQL is written once with `@name` parameters, which both drivers support.
 * Dialect differences are limited to DDL (see migrations.ts) and `paginate`.
 */
export interface Db {
  readonly dialect: "mssql" | "sqlite";
  all<T = Record<string, unknown>>(sql: string, params?: Params): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: Params): Promise<T | undefined>;
  run(sql: string, params?: Params): Promise<{ changes: number }>;
  /** Executes a multi-statement script (migrations only). */
  exec(script: string): Promise<void>;
  /** Runs fn atomically. Nested calls join the outer transaction. */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  /** Returns the pagination clause; requires an ORDER BY in the statement (mandatory on SQL Server). */
  paginate(limitParam: string, offsetParam: string): string;
  close(): Promise<void>;
}

export class DbConflictError extends Error {}
