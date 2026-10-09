// @vitest-environment node
// Azure SQL adapter against a MOCKED mssql driver. This checks parameter typing, pagination syntax,
// transaction handling and authentication settings; it is NOT a test against a real Azure SQL database.
import { describe, expect, it, vi } from "vitest";

const log: { kind: string; detail?: unknown }[] = [];
let failNext = false;

vi.mock("mssql", () => {
  class Request {
    inputs: Record<string, { type: unknown; value: unknown }> = {};
    constructor(public owner: unknown) {}
    input(name: string, type: unknown, value: unknown) {
      this.inputs[name] = { type, value };
      return this;
    }
    async query(text: string) {
      log.push({ kind: "query", detail: { text, inputs: this.inputs, inTx: this.owner instanceof Transaction } });
      if (failNext) {
        failNext = false;
        throw new Error("boom");
      }
      return { recordset: [{ c: 1 }], rowsAffected: [1] };
    }
    async batch(text: string) {
      log.push({ kind: "batch", detail: text });
      return {};
    }
  }
  class Transaction {
    constructor(public pool: unknown) {}
    async begin(level: unknown) {
      log.push({ kind: "begin", detail: level });
    }
    async commit() {
      log.push({ kind: "commit" });
    }
    async rollback() {
      log.push({ kind: "rollback" });
    }
  }
  class ConnectionPool {
    constructor(public config: unknown) {
      log.push({ kind: "config", detail: config });
    }
    async connect() {}
    async close() {
      log.push({ kind: "close" });
    }
  }
  const t = (name: string) => Object.assign((n?: unknown) => ({ name, n }), { typeName: name });
  const mod = { ConnectionPool, Request, Transaction, NVarChar: t("NVarChar"), BigInt: { typeName: "BigInt" }, Float: { typeName: "Float" }, MAX: "MAX", ISOLATION_LEVEL: { READ_COMMITTED: "RC" } };
  return { default: mod, ...mod };
});

import { openMssql } from "@/pilot/db/mssql";

describe("Azure SQL adapter (mocked driver)", () => {
  it("uses Entra authentication with encryption and no password", async () => {
    log.length = 0;
    await openMssql({ server: "fcc-sql.database.windows.net", database: "fcc", managedIdentityClientId: "11111111-1111-1111-1111-111111111111" });
    const cfg = log.find((l) => l.kind === "config")!.detail as Record<string, unknown>;
    expect(cfg).toMatchObject({ server: "fcc-sql.database.windows.net", database: "fcc", authentication: { type: "azure-active-directory-default", options: { clientId: "11111111-1111-1111-1111-111111111111" } }, options: { encrypt: true, trustServerCertificate: false } });
    expect(JSON.stringify(cfg)).not.toMatch(/password/i);
  });
  it("binds bigint money as BigInt, strings as NVarChar, nulls explicitly, and paginates with OFFSET/FETCH", async () => {
    log.length = 0;
    const db = await openMssql({ server: "s.database.windows.net", database: "fcc" });
    await db.all(`SELECT id FROM t ORDER BY id ${db.paginate("lim", "off")}`, { a: 12_345_678n, s: "x", n: null, lim: 25, off: 50 });
    const q = log.find((l) => l.kind === "query")!.detail as { text: string; inputs: Record<string, { type: { typeName?: string; name?: string }; value: unknown }> };
    expect(q.text).toContain("OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY");
    expect(q.inputs.a).toMatchObject({ type: { typeName: "BigInt" }, value: "12345678" });
    expect(q.inputs.s.type).toMatchObject({ name: "NVarChar", n: 4000 });
    expect(q.inputs.n.value).toBeNull();
  });
  it("commits on success and rolls back on failure, routing statements through the transaction", async () => {
    log.length = 0;
    const db = await openMssql({ server: "s.database.windows.net", database: "fcc" });
    await db.tx(async (t) => {
      await t.run("UPDATE x SET a = 1");
      await t.tx(async (inner) => inner.run("UPDATE y SET b = 2")); // nested joins the outer transaction
    });
    expect(log.map((l) => l.kind)).toEqual(["config", "begin", "query", "query", "commit"]);
    expect(log.filter((l) => l.kind === "query").every((l) => (l.detail as { inTx: boolean }).inTx)).toBe(true);
    log.length = 0;
    failNext = true;
    await expect(db.tx(async (t) => t.run("UPDATE x SET a = 1"))).rejects.toThrow("boom");
    expect(log.map((l) => l.kind)).toEqual(["begin", "query", "rollback"]);
  });
});
