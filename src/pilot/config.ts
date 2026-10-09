// Pilot configuration. Read from the server environment only; validated once per process and fail-closed.
// Nothing here is ever sent to the browser except the safe summary returned by `describeScope`.

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DbDialect = "mssql" | "sqlite";

export interface PilotConfig {
  appMode: "pilot" | "production";
  authMode: "appservice" | "development";
  tenantId: string;
  subscriptionIds: string[];
  publicOrigin: string;
  orgLabel: string;
  db: { dialect: "mssql"; server: string; database: string } | { dialect: "sqlite"; path: string };
  managedIdentityClientId?: string;
  advisorCategories: string[];
  costAggregationColumn: "Cost" | "PreTaxCost";
  syncIntervalMinutes: number; // 0 = scheduled sync disabled
  staleAfterHours: { inventory: number; cost: number; advisor: number };
  maxResources: number;
}

export type ConfigResult = { ok: true; config: PilotConfig } | { ok: false; problems: string[] };

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const intIn = (v: string | undefined, def: number, min: number, max: number) => {
  if (v === undefined || v.trim() === "") return def;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
};

/** Pure: validates an environment object. Problems name the variable only, never echo values. */
export function loadPilotConfig(env: Record<string, string | undefined>): ConfigResult {
  const problems: string[] = [];
  const appMode = (env.APP_MODE ?? "").trim().toLowerCase();
  if (appMode !== "pilot" && appMode !== "production") problems.push("APP_MODE must be 'pilot' or 'production' for the pilot build");

  const onAppService = !!env.WEBSITE_SITE_NAME;
  const isDevServer = env.NODE_ENV === "development";

  let authMode: PilotConfig["authMode"] = "appservice";
  const requestedAuth = (env.FCC_AUTH_MODE ?? "appservice").trim().toLowerCase();
  if (requestedAuth === "development") {
    // A development principal is only ever honoured by `next dev` on a workstation.
    if (!isDevServer || onAppService) problems.push("FCC_AUTH_MODE=development is only allowed with `next dev` outside App Service");
    authMode = "development";
  } else if (requestedAuth !== "appservice") {
    problems.push("FCC_AUTH_MODE must be 'appservice'");
  } else if (onAppService) {
    if (env.WEBSITE_AUTH_ENABLED !== "True") problems.push("App Service Authentication is not enabled (WEBSITE_AUTH_ENABLED is not True)");
  } else if (env.FCC_LOCAL_VALIDATION !== "true") {
    // The X-MS-CLIENT-PRINCIPAL header is only trustworthy behind App Service Authentication. Anywhere else
    // (VM, container, workstation exposed on a network) it could be forged, so refuse to start.
    problems.push("FCC_AUTH_MODE=appservice requires Azure App Service with Authentication enabled (set FCC_LOCAL_VALIDATION=true only for local validation on localhost)");
  }

  const tenantId = (env.FCC_ENTRA_TENANT_ID ?? "").trim();
  if (!GUID.test(tenantId)) problems.push("FCC_ENTRA_TENANT_ID must be the pilot tenant GUID");

  const subscriptionIds = list(env.FCC_AZURE_SUBSCRIPTION_IDS).map((s) => s.toLowerCase());
  if (!subscriptionIds.length) problems.push("FCC_AZURE_SUBSCRIPTION_IDS must list at least one approved subscription GUID");
  else if (subscriptionIds.length > 25) problems.push("FCC_AZURE_SUBSCRIPTION_IDS supports at most 25 subscriptions in this pilot");
  else if (subscriptionIds.some((s) => !GUID.test(s))) problems.push("FCC_AZURE_SUBSCRIPTION_IDS contains a value that is not a subscription GUID");
  else if (new Set(subscriptionIds).size !== subscriptionIds.length) problems.push("FCC_AZURE_SUBSCRIPTION_IDS contains duplicates");

  const publicOrigin = (env.FCC_PUBLIC_ORIGIN ?? "").trim().replace(/\/$/, "");
  let originOk = false;
  try {
    const u = new URL(publicOrigin);
    originOk = u.origin === publicOrigin && (u.protocol === "https:" || (!onAppService && ["localhost", "127.0.0.1"].includes(u.hostname)));
  } catch {
    originOk = false;
  }
  if (!originOk) problems.push("FCC_PUBLIC_ORIGIN must be the https origin of the application (http://localhost is accepted only off App Service)");
  if (!onAppService && env.FCC_LOCAL_VALIDATION === "true" && originOk && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(publicOrigin)) {
    problems.push("FCC_LOCAL_VALIDATION=true is only allowed with a localhost FCC_PUBLIC_ORIGIN");
  }

  const dialect = (env.FCC_DB_DIALECT ?? "").trim().toLowerCase();
  let db: PilotConfig["db"] | null = null;
  if (dialect === "mssql") {
    const server = (env.FCC_SQL_SERVER ?? "").trim();
    const database = (env.FCC_SQL_DATABASE ?? "").trim();
    if (!/^[a-z0-9-]+\.database\.windows\.net$/i.test(server)) problems.push("FCC_SQL_SERVER must be an Azure SQL logical server host name (Azure public cloud)");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(database)) problems.push("FCC_SQL_DATABASE must be a database name");
    db = { dialect: "mssql", server, database };
  } else if (dialect === "sqlite") {
    if (onAppService) problems.push("FCC_DB_DIALECT=sqlite is not allowed on App Service; use mssql");
    if (env.FCC_ALLOW_LOCAL_SQLITE !== "true") problems.push("FCC_DB_DIALECT=sqlite requires FCC_ALLOW_LOCAL_SQLITE=true (local validation only)");
    const path = (env.FCC_SQLITE_PATH ?? "").trim();
    if (!path) problems.push("FCC_SQLITE_PATH is required with FCC_DB_DIALECT=sqlite");
    db = { dialect: "sqlite", path };
  } else {
    problems.push("FCC_DB_DIALECT must be 'mssql' (Azure SQL) or 'sqlite' (local validation only)");
  }

  const mi = (env.FCC_MANAGED_IDENTITY_CLIENT_ID ?? "").trim();
  if (mi && !GUID.test(mi)) problems.push("FCC_MANAGED_IDENTITY_CLIENT_ID must be a GUID when set");

  const ADVISOR = ["Cost", "HighAvailability", "Performance", "Security", "OperationalExcellence"];
  const advisorCategories = list(env.FCC_ADVISOR_CATEGORIES ?? "Cost");
  if (!advisorCategories.length || advisorCategories.some((c) => !ADVISOR.includes(c))) problems.push(`FCC_ADVISOR_CATEGORIES must be a subset of ${ADVISOR.join(", ")}`);

  const col = (env.FCC_COST_AGGREGATION_COLUMN ?? "Cost").trim();
  if (col !== "Cost" && col !== "PreTaxCost") problems.push("FCC_COST_AGGREGATION_COLUMN must be 'Cost' or 'PreTaxCost'");

  const syncIntervalMinutes = intIn(env.FCC_SYNC_INTERVAL_MINUTES, 0, 0, 1440);
  if (Number.isNaN(syncIntervalMinutes) || (syncIntervalMinutes > 0 && syncIntervalMinutes < 60)) problems.push("FCC_SYNC_INTERVAL_MINUTES must be 0 (disabled) or between 60 and 1440");

  const stale = {
    inventory: intIn(env.FCC_STALE_AFTER_HOURS_INVENTORY, 26, 1, 720),
    cost: intIn(env.FCC_STALE_AFTER_HOURS_COST, 48, 1, 720),
    advisor: intIn(env.FCC_STALE_AFTER_HOURS_ADVISOR, 48, 1, 720),
  };
  if (Object.values(stale).some(Number.isNaN)) problems.push("FCC_STALE_AFTER_HOURS_* must be whole hours between 1 and 720");

  const maxResources = intIn(env.FCC_MAX_RESOURCES, 50000, 1000, 500000);
  if (Number.isNaN(maxResources)) problems.push("FCC_MAX_RESOURCES must be between 1000 and 500000");

  const orgLabel = (env.FCC_ORG_LABEL ?? "").trim().slice(0, 60) || "Azure pilot";

  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    config: {
      appMode: appMode as PilotConfig["appMode"],
      authMode,
      tenantId: tenantId.toLowerCase(),
      subscriptionIds,
      publicOrigin,
      orgLabel,
      db: db!,
      managedIdentityClientId: mi || undefined,
      advisorCategories,
      costAggregationColumn: col as PilotConfig["costAggregationColumn"],
      syncIntervalMinutes,
      staleAfterHours: stale,
      maxResources,
    },
  };
}

let cached: ConfigResult | null = null;
/** Process-wide configuration (re-read only in tests via resetPilotConfig). */
export function pilotConfig(): ConfigResult {
  if (!cached) cached = loadPilotConfig(process.env);
  return cached;
}
export function resetPilotConfig() {
  cached = null;
}
export function requireConfig(): PilotConfig {
  const r = pilotConfig();
  if (!r.ok) throw new ConfigError(r.problems);
  return r.config;
}
export class ConfigError extends Error {
  constructor(public problems: string[]) {
    super("Pilot configuration is incomplete");
  }
}

/** Safe, non-secret description of the approved scope for display. */
export function describeScope(c: PilotConfig) {
  return {
    subscriptions: c.subscriptionIds.map((s) => `…${s.slice(-6)}`),
    subscriptionCount: c.subscriptionIds.length,
    advisorCategories: c.advisorCategories,
    database: c.db.dialect === "mssql" ? "Azure SQL Database" : "Local SQLite (validation only)",
    scheduledSync: c.syncIntervalMinutes ? `every ${c.syncIntervalMinutes} minutes` : "disabled (manual refresh only)",
  };
}

export const _test = { GUID };
