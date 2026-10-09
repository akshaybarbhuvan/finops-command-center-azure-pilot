// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatMoney, microsToDecimal, toMicros } from "@/pilot/money";
import { migrate, MIGRATIONS, schemaIsCurrent, MigrationError, type Migration } from "@/pilot/db/migrations";
import { openSqlite } from "@/pilot/db/sqlite";

describe("money", () => {
  it("converts source amounts exactly to micros with half-up rounding", () => {
    expect(toMicros("1234.5678905")).toBe(1_234_567_891n);
    expect(toMicros(0.1)).toBe(100_000n);
    expect(toMicros(0.1) + toMicros(0.2)).toBe(toMicros(0.3)); // no binary drift
    expect(toMicros("-2.0000005")).toBe(-2_000_001n);
    expect(() => toMicros("12abc")).toThrow();
    expect(() => toMicros(Number.NaN)).toThrow();
  });
  it("formats with the explicit currency, never assuming USD", () => {
    expect(formatMoney(1_234_500_000n, "EUR")).toContain("EUR");
    expect(formatMoney(1_234_500_000n, "EUR")).not.toContain("$");
    expect(formatMoney(null, "USD")).toBe("—");
    expect(formatMoney(5n, null)).toBe("—");
    expect(microsToDecimal(1_005_000n)).toBe("1.01");
    expect(microsToDecimal(-1_004_000n)).toBe("-1.00");
  });
});

describe("migrations", () => {
  it("apply once, are recorded, and are idempotent", async () => {
    const db = await openSqlite(":memory:");
    expect(await schemaIsCurrent(db)).toBe(false);
    expect((await migrate(db)).applied).toEqual(MIGRATIONS.map((m) => m.version));
    expect((await migrate(db)).applied).toEqual([]);
    expect(await schemaIsCurrent(db)).toBe(true);
  });
  it("refuse to run when an applied migration was modified", async () => {
    const db = await openSqlite(":memory:");
    await migrate(db);
    const tampered: Migration[] = MIGRATIONS.map((m) => ({ ...m, sqlite: m.sqlite + "\n-- edited" }));
    await expect(migrate(db, tampered)).rejects.toBeInstanceOf(MigrationError);
  });
  it("refuse to run an older application against a newer schema", async () => {
    const db = await openSqlite(":memory:");
    await migrate(db, [...MIGRATIONS, { version: 99, name: "future", sqlite: "CREATE TABLE future_t (x INTEGER);", mssql: "" }]);
    await expect(migrate(db)).rejects.toThrow(/does not know/);
  });
  it("roll back a failing migration completely", async () => {
    const db = await openSqlite(":memory:");
    await migrate(db);
    const bad: Migration[] = [...MIGRATIONS, { version: 2, name: "bad", sqlite: "CREATE TABLE half_done (x INTEGER); INSERT INTO no_such_table VALUES (1);", mssql: "" }];
    await expect(migrate(db, bad)).rejects.toThrow();
    expect(await db.get(`SELECT name FROM sqlite_master WHERE name = 'half_done'`)).toBeUndefined();
    expect(await db.get(`SELECT version FROM schema_migrations WHERE version = 2`)).toBeUndefined();
  });
  it("contain no destructive statements", () => {
    for (const m of MIGRATIONS) for (const sql of [m.sqlite, m.mssql]) expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/i);
  });
});
