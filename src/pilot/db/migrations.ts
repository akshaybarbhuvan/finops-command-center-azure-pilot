// Versioned, append-only schema migrations. Never edit an applied migration: add a new version instead.
// The runner records a checksum per version and refuses to continue if an applied migration was changed.
// Migrations only CREATE / ALTER; none drop tables or data. They run as a separate, explicit operator step
// (`npm run db:migrate`) with an identity that has DDL rights — never at application start-up.
import { createHash } from "node:crypto";
import type { Db } from "./types";

export interface Migration {
  version: number;
  name: string;
  sqlite: string;
  mssql: string;
}

const STAGES = "'identified','validated','assigned','in_progress','submitted','approved','implemented','verified','closed','rejected','deferred'";

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial pilot schema",
    sqlite: `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT,
  roles TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('inventory','cost','advisor')),
  scope TEXT NOT NULL,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('manual','scheduled','cli')),
  triggered_by TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','success','partial','failed','unauthorized')),
  records_read INTEGER NOT NULL DEFAULT 0,
  records_written INTEGER NOT NULL DEFAULT 0,
  error_class TEXT,
  error_detail TEXT
);
CREATE INDEX ix_sync_runs_source ON sync_runs (source, scope, started_at);
CREATE TABLE sync_locks (
  name TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE resources (
  resource_key TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  resource_group TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  location TEXT,
  kind TEXT,
  sku_name TEXT,
  tags_json TEXT,
  is_present INTEGER NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_sync_run_id TEXT NOT NULL
);
CREATE INDEX ix_resources_sub ON resources (subscription_id, is_present);
CREATE INDEX ix_resources_type ON resources (type);
CREATE TABLE cost_daily (
  subscription_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  cost_type TEXT NOT NULL CHECK (cost_type IN ('ActualCost','AmortizedCost')),
  currency TEXT NOT NULL,
  amount_micros INTEGER NOT NULL,
  sync_run_id TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  PRIMARY KEY (subscription_id, usage_date, cost_type, currency)
);
CREATE TABLE cost_windows (
  subscription_id TEXT NOT NULL,
  cost_type TEXT NOT NULL CHECK (cost_type IN ('ActualCost','AmortizedCost')),
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  sync_run_id TEXT NOT NULL,
  PRIMARY KEY (subscription_id, cost_type)
);
CREATE TABLE recommendations (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('azure_advisor')),
  source_key TEXT NOT NULL,
  source_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  resource_id TEXT,
  resource_key TEXT,
  impacted_type TEXT,
  impacted_name TEXT,
  category TEXT NOT NULL,
  impact TEXT,
  problem TEXT NOT NULL,
  solution TEXT,
  recommendation_type_id TEXT,
  learn_more_url TEXT,
  source_last_updated TEXT,
  est_monthly_micros INTEGER,
  est_annual_micros INTEGER,
  est_annual_is_derived INTEGER NOT NULL DEFAULT 0,
  est_currency TEXT,
  source_status TEXT NOT NULL CHECK (source_status IN ('active','not_returned')),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_sync_run_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN (${STAGES})),
  priority TEXT NOT NULL CHECK (priority IN ('Critical','High','Medium','Low')),
  owner_id TEXT REFERENCES users (id),
  due_date TEXT,
  ticket_reference TEXT,
  ticket_url TEXT,
  change_reference TEXT,
  remediation_plan TEXT,
  implemented_by TEXT REFERENCES users (id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source, source_key)
);
CREATE INDEX ix_recs_stage ON recommendations (stage);
CREATE INDEX ix_recs_owner ON recommendations (owner_id, stage);
CREATE INDEX ix_recs_sub ON recommendations (subscription_id);
CREATE TABLE rec_events (
  id TEXT PRIMARY KEY,
  rec_id TEXT NOT NULL REFERENCES recommendations (id),
  rec_version INTEGER NOT NULL,
  at TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT,
  note TEXT,
  data_json TEXT
);
CREATE INDEX ix_rec_events_rec ON rec_events (rec_id, rec_version);
CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  rec_id TEXT NOT NULL REFERENCES recommendations (id),
  submitted_by TEXT NOT NULL REFERENCES users (id),
  submitted_at TEXT NOT NULL,
  implemented_on TEXT NOT NULL,
  summary TEXT NOT NULL,
  url TEXT
);
CREATE INDEX ix_evidence_rec ON evidence (rec_id);
CREATE TABLE verifications (
  id TEXT PRIMARY KEY,
  rec_id TEXT NOT NULL REFERENCES recommendations (id),
  decided_by TEXT NOT NULL REFERENCES users (id),
  decided_at TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('verified','not_verified')),
  currency TEXT,
  baseline_from TEXT,
  baseline_to TEXT,
  baseline_cost_micros INTEGER,
  post_from TEXT,
  post_to TEXT,
  post_cost_micros INTEGER,
  monthly_savings_micros INTEGER,
  method TEXT,
  source_reference TEXT,
  notes TEXT,
  reason TEXT
);
CREATE INDEX ix_verifications_rec ON verifications (rec_id, decided_at);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  detail_json TEXT
);
CREATE INDEX ix_audit_at ON audit_events (at);
`,
    mssql: `
CREATE TABLE dbo.users (
  id NVARCHAR(64) NOT NULL CONSTRAINT pk_users PRIMARY KEY,
  display_name NVARCHAR(256) NOT NULL,
  email NVARCHAR(320) NULL,
  roles NVARCHAR(200) NOT NULL,
  first_seen_at NVARCHAR(40) NOT NULL,
  last_seen_at NVARCHAR(40) NOT NULL
);
CREATE TABLE dbo.sync_runs (
  id NVARCHAR(36) NOT NULL CONSTRAINT pk_sync_runs PRIMARY KEY,
  source NVARCHAR(16) NOT NULL CONSTRAINT ck_sync_runs_source CHECK (source IN ('inventory','cost','advisor')),
  scope NVARCHAR(64) NOT NULL,
  trigger_kind NVARCHAR(16) NOT NULL CONSTRAINT ck_sync_runs_trigger CHECK (trigger_kind IN ('manual','scheduled','cli')),
  triggered_by NVARCHAR(64) NULL,
  started_at NVARCHAR(40) NOT NULL,
  finished_at NVARCHAR(40) NULL,
  status NVARCHAR(16) NOT NULL CONSTRAINT ck_sync_runs_status CHECK (status IN ('running','success','partial','failed','unauthorized')),
  records_read INT NOT NULL CONSTRAINT df_sync_runs_read DEFAULT 0,
  records_written INT NOT NULL CONSTRAINT df_sync_runs_written DEFAULT 0,
  error_class NVARCHAR(32) NULL,
  error_detail NVARCHAR(1000) NULL
);
CREATE INDEX ix_sync_runs_source ON dbo.sync_runs (source, scope, started_at);
CREATE TABLE dbo.sync_locks (
  name NVARCHAR(64) NOT NULL CONSTRAINT pk_sync_locks PRIMARY KEY,
  holder NVARCHAR(36) NOT NULL,
  acquired_at NVARCHAR(40) NOT NULL,
  expires_at NVARCHAR(40) NOT NULL
);
CREATE TABLE dbo.resources (
  resource_key NVARCHAR(64) NOT NULL CONSTRAINT pk_resources PRIMARY KEY,
  resource_id NVARCHAR(2048) NOT NULL,
  subscription_id NVARCHAR(36) NOT NULL,
  resource_group NVARCHAR(128) NULL,
  name NVARCHAR(260) NOT NULL,
  type NVARCHAR(260) NOT NULL,
  location NVARCHAR(64) NULL,
  kind NVARCHAR(128) NULL,
  sku_name NVARCHAR(128) NULL,
  tags_json NVARCHAR(MAX) NULL,
  is_present INT NOT NULL,
  first_seen_at NVARCHAR(40) NOT NULL,
  last_seen_at NVARCHAR(40) NOT NULL,
  last_sync_run_id NVARCHAR(36) NOT NULL
);
CREATE INDEX ix_resources_sub ON dbo.resources (subscription_id, is_present);
CREATE INDEX ix_resources_type ON dbo.resources (type);
CREATE TABLE dbo.cost_daily (
  subscription_id NVARCHAR(36) NOT NULL,
  usage_date NVARCHAR(10) NOT NULL,
  cost_type NVARCHAR(16) NOT NULL CONSTRAINT ck_cost_daily_type CHECK (cost_type IN ('ActualCost','AmortizedCost')),
  currency NVARCHAR(3) NOT NULL,
  amount_micros BIGINT NOT NULL,
  sync_run_id NVARCHAR(36) NOT NULL,
  retrieved_at NVARCHAR(40) NOT NULL,
  CONSTRAINT pk_cost_daily PRIMARY KEY (subscription_id, usage_date, cost_type, currency)
);
CREATE TABLE dbo.cost_windows (
  subscription_id NVARCHAR(36) NOT NULL,
  cost_type NVARCHAR(16) NOT NULL CONSTRAINT ck_cost_windows_type CHECK (cost_type IN ('ActualCost','AmortizedCost')),
  from_date NVARCHAR(10) NOT NULL,
  to_date NVARCHAR(10) NOT NULL,
  retrieved_at NVARCHAR(40) NOT NULL,
  sync_run_id NVARCHAR(36) NOT NULL,
  CONSTRAINT pk_cost_windows PRIMARY KEY (subscription_id, cost_type)
);
CREATE TABLE dbo.recommendations (
  id NVARCHAR(36) NOT NULL CONSTRAINT pk_recommendations PRIMARY KEY,
  source NVARCHAR(32) NOT NULL CONSTRAINT ck_recs_source CHECK (source IN ('azure_advisor')),
  source_key NVARCHAR(64) NOT NULL,
  source_id NVARCHAR(2048) NOT NULL,
  subscription_id NVARCHAR(36) NOT NULL,
  resource_id NVARCHAR(2048) NULL,
  resource_key NVARCHAR(64) NULL,
  impacted_type NVARCHAR(260) NULL,
  impacted_name NVARCHAR(400) NULL,
  category NVARCHAR(64) NOT NULL,
  impact NVARCHAR(16) NULL,
  problem NVARCHAR(2000) NOT NULL,
  solution NVARCHAR(2000) NULL,
  recommendation_type_id NVARCHAR(64) NULL,
  learn_more_url NVARCHAR(1000) NULL,
  source_last_updated NVARCHAR(40) NULL,
  est_monthly_micros BIGINT NULL,
  est_annual_micros BIGINT NULL,
  est_annual_is_derived INT NOT NULL CONSTRAINT df_recs_derived DEFAULT 0,
  est_currency NVARCHAR(3) NULL,
  source_status NVARCHAR(16) NOT NULL CONSTRAINT ck_recs_source_status CHECK (source_status IN ('active','not_returned')),
  first_seen_at NVARCHAR(40) NOT NULL,
  last_seen_at NVARCHAR(40) NOT NULL,
  last_sync_run_id NVARCHAR(36) NOT NULL,
  stage NVARCHAR(24) NOT NULL CONSTRAINT ck_recs_stage CHECK (stage IN (${STAGES})),
  priority NVARCHAR(16) NOT NULL CONSTRAINT ck_recs_priority CHECK (priority IN ('Critical','High','Medium','Low')),
  owner_id NVARCHAR(64) NULL CONSTRAINT fk_recs_owner REFERENCES dbo.users (id),
  due_date NVARCHAR(10) NULL,
  ticket_reference NVARCHAR(128) NULL,
  ticket_url NVARCHAR(1000) NULL,
  change_reference NVARCHAR(128) NULL,
  remediation_plan NVARCHAR(4000) NULL,
  implemented_by NVARCHAR(64) NULL CONSTRAINT fk_recs_implementer REFERENCES dbo.users (id),
  version INT NOT NULL CONSTRAINT df_recs_version DEFAULT 1,
  created_at NVARCHAR(40) NOT NULL,
  updated_at NVARCHAR(40) NOT NULL,
  CONSTRAINT uq_recs_source UNIQUE (source, source_key)
);
CREATE INDEX ix_recs_stage ON dbo.recommendations (stage);
CREATE INDEX ix_recs_owner ON dbo.recommendations (owner_id, stage);
CREATE INDEX ix_recs_sub ON dbo.recommendations (subscription_id);
CREATE TABLE dbo.rec_events (
  id NVARCHAR(36) NOT NULL CONSTRAINT pk_rec_events PRIMARY KEY,
  rec_id NVARCHAR(36) NOT NULL CONSTRAINT fk_rec_events_rec REFERENCES dbo.recommendations (id),
  rec_version INT NOT NULL,
  at NVARCHAR(40) NOT NULL,
  actor_id NVARCHAR(64) NULL,
  action NVARCHAR(40) NOT NULL,
  from_stage NVARCHAR(24) NULL,
  to_stage NVARCHAR(24) NULL,
  note NVARCHAR(4000) NULL,
  data_json NVARCHAR(MAX) NULL
);
CREATE INDEX ix_rec_events_rec ON dbo.rec_events (rec_id, rec_version);
CREATE TABLE dbo.evidence (
  id NVARCHAR(36) NOT NULL CONSTRAINT pk_evidence PRIMARY KEY,
  rec_id NVARCHAR(36) NOT NULL CONSTRAINT fk_evidence_rec REFERENCES dbo.recommendations (id),
  submitted_by NVARCHAR(64) NOT NULL CONSTRAINT fk_evidence_user REFERENCES dbo.users (id),
  submitted_at NVARCHAR(40) NOT NULL,
  implemented_on NVARCHAR(10) NOT NULL,
  summary NVARCHAR(4000) NOT NULL,
  url NVARCHAR(1000) NULL
);
CREATE INDEX ix_evidence_rec ON dbo.evidence (rec_id);
CREATE TABLE dbo.verifications (
  id NVARCHAR(36) NOT NULL CONSTRAINT pk_verifications PRIMARY KEY,
  rec_id NVARCHAR(36) NOT NULL CONSTRAINT fk_verifications_rec REFERENCES dbo.recommendations (id),
  decided_by NVARCHAR(64) NOT NULL CONSTRAINT fk_verifications_user REFERENCES dbo.users (id),
  decided_at NVARCHAR(40) NOT NULL,
  decision NVARCHAR(16) NOT NULL CONSTRAINT ck_verifications_decision CHECK (decision IN ('verified','not_verified')),
  currency NVARCHAR(3) NULL,
  baseline_from NVARCHAR(10) NULL,
  baseline_to NVARCHAR(10) NULL,
  baseline_cost_micros BIGINT NULL,
  post_from NVARCHAR(10) NULL,
  post_to NVARCHAR(10) NULL,
  post_cost_micros BIGINT NULL,
  monthly_savings_micros BIGINT NULL,
  method NVARCHAR(64) NULL,
  source_reference NVARCHAR(1000) NULL,
  notes NVARCHAR(4000) NULL,
  reason NVARCHAR(1000) NULL
);
CREATE INDEX ix_verifications_rec ON dbo.verifications (rec_id, decided_at);
CREATE TABLE dbo.audit_events (
  id NVARCHAR(36) NOT NULL CONSTRAINT pk_audit_events PRIMARY KEY,
  at NVARCHAR(40) NOT NULL,
  actor_id NVARCHAR(64) NULL,
  action NVARCHAR(64) NOT NULL,
  target_type NVARCHAR(32) NOT NULL,
  target_id NVARCHAR(200) NULL,
  detail_json NVARCHAR(MAX) NULL
);
CREATE INDEX ix_audit_at ON dbo.audit_events (at);
`,
  },
];

export const checksum = (sql: string) => createHash("sha256").update(sql.replace(/\r\n/g, "\n").trim()).digest("hex");

const LEDGER = {
  sqlite: `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);`,
  mssql: `IF OBJECT_ID(N'dbo.schema_migrations', N'U') IS NULL CREATE TABLE dbo.schema_migrations (version INT NOT NULL CONSTRAINT pk_schema_migrations PRIMARY KEY, name NVARCHAR(200) NOT NULL, checksum CHAR(64) NOT NULL, applied_at NVARCHAR(40) NOT NULL);`,
};

export interface MigrationReport {
  applied: number[];
  alreadyApplied: number[];
}

export class MigrationError extends Error {}

/** Applies pending migrations in order, each in its own transaction. Safe to re-run. */
export async function migrate(db: Db, migrations: Migration[] = MIGRATIONS): Promise<MigrationReport> {
  await db.exec(LEDGER[db.dialect]);
  const rows = await db.all<{ version: number | bigint; checksum: string }>(`SELECT version, checksum FROM schema_migrations ORDER BY version`);
  const applied = new Map(rows.map((r) => [Number(r.version), r.checksum]));
  const report: MigrationReport = { applied: [], alreadyApplied: [] };
  const known = new Set(migrations.map((m) => m.version));
  for (const v of applied.keys()) {
    if (!known.has(v)) throw new MigrationError(`Database has migration ${v}, which this application version does not know. Deploy a newer application version instead of rolling back.`);
  }
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    const sql = m[db.dialect];
    const sum = checksum(sql);
    const existing = applied.get(m.version);
    if (existing) {
      if (existing.trim() !== sum) throw new MigrationError(`Migration ${m.version} (${m.name}) was modified after it was applied. Restore the original migration and add a new version.`);
      report.alreadyApplied.push(m.version);
      continue;
    }
    await db.tx(async (t) => {
      await t.exec(sql);
      await t.run(`INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (@v, @n, @c, @a)`, { v: m.version, n: m.name, c: sum, a: new Date().toISOString() });
    });
    report.applied.push(m.version);
  }
  return report;
}

/** True when every known migration is recorded. The application refuses to serve data otherwise. */
export async function schemaIsCurrent(db: Db, migrations: Migration[] = MIGRATIONS): Promise<boolean> {
  try {
    const rows = await db.all<{ version: number | bigint }>(`SELECT version FROM schema_migrations`);
    const have = new Set(rows.map((r) => Number(r.version)));
    return migrations.every((m) => have.has(m.version));
  } catch {
    return false;
  }
}
