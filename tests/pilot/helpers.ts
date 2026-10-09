// Offline test helpers for the pilot. Uses a real SQLite database with the real migrations.
import { openSqlite } from "@/pilot/db/sqlite";
import { migrate } from "@/pilot/db/migrations";
import type { Db } from "@/pilot/db/types";
import { loadPilotConfig, type PilotConfig } from "@/pilot/config";
import { createArmClient } from "@/pilot/azure/arm";
import { touchUser } from "@/pilot/session";
import type { Actor, PilotRole } from "@/pilot/auth/principal";
import { fakeAzureFetch, SUB_A, SUB_B, TENANT, type FakeAzureOptions } from "./fixtures/azure";

export const BASE_ENV: Record<string, string> = {
  APP_MODE: "pilot",
  NODE_ENV: "production",
  FCC_AUTH_MODE: "appservice",
  FCC_ENTRA_TENANT_ID: TENANT,
  FCC_AZURE_SUBSCRIPTION_IDS: `${SUB_A},${SUB_B}`,
  FCC_PUBLIC_ORIGIN: "http://localhost:3000",
  FCC_DB_DIALECT: "sqlite",
  FCC_ALLOW_LOCAL_SQLITE: "true",
  FCC_SQLITE_PATH: ":memory:",
  FCC_LOCAL_VALIDATION: "true",
};

export function testConfig(over: Record<string, string | undefined> = {}): PilotConfig {
  const r = loadPilotConfig({ ...BASE_ENV, ...over });
  if (!r.ok) throw new Error(r.problems.join("; "));
  return r.config;
}

export async function testDb(): Promise<Db> {
  const db = await openSqlite(":memory:");
  await migrate(db);
  return db;
}

export function fakeClient(o: FakeAzureOptions = {}) {
  return createArmClient({ getToken: async () => "fixture-token", fetch: fakeAzureFetch(o), sleep: async () => {}, timeoutMs: 2000 });
}

let n = 0;
export function actor(roles: PilotRole[], name = `User ${++n}`): Actor {
  const hex = (++n).toString(16).padStart(12, "0");
  return { id: `00000000-0000-0000-0000-${hex}`, tenantId: TENANT, name, email: `${name.toLowerCase().replace(/\s+/g, ".")}@fixture.invalid`, roles };
}

export async function seedUsers(db: Db, ...actors: Actor[]) {
  for (const a of actors) await touchUser(db, a, new Date(Date.now() + Math.random() * 1e9)); // bypass throttle with distinct times
}

/** App Service Authentication header for an actor (what App Service injects after Entra sign-in). */
export function easyAuthHeader(a: { id: string; name: string; roles: string[] }, tenant = TENANT) {
  const claims = [
    { typ: "http://schemas.microsoft.com/identity/claims/objectidentifier", val: a.id },
    { typ: "http://schemas.microsoft.com/identity/claims/tenantid", val: tenant },
    { typ: "name", val: a.name },
    { typ: "preferred_username", val: `${a.name.replace(/\s+/g, ".").toLowerCase()}@fixture.invalid` },
    ...a.roles.map((r) => ({ typ: "roles", val: r })),
  ];
  return Buffer.from(JSON.stringify({ auth_typ: "aad", claims, name_typ: "name", role_typ: "roles" })).toString("base64");
}

export const ROLE_VALUE: Record<PilotRole, string> = { executive: "FCC.Executive", finops: "FCC.FinOps", engineering: "FCC.Engineering", admin: "FCC.Admin" };
export { SUB_A, SUB_B, TENANT };
