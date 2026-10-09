# Operations — FCC Azure pilot

## 1. Data refresh

| Trigger | How | Who |
|---|---|---|
| Scheduled | `FCC_SYNC_INTERVAL_MINUTES` (default 360 in Bicep; 0 = off). First run one minute after start-up. Requires **Always On** (set by Bicep) | System |
| Manual | *FinOps Workbench* or *Administration* → **Refresh Azure data now** (runs in the background; returns at once) | FinOps, Admin |
| CLI | `npm run sync:pilot [-- inventory cost advisor]` with the same `FCC_*` settings and an Azure CLI sign-in holding the same read roles | Operator |

Each refresh runs inventory → cost → Advisor for every approved subscription. A lease lock per source (60-minute lease, 45-minute hard stop) prevents overlapping runs across instances. A second request while a source is running returns *already running*.

Policies:
- A **failed** run changes no stored data. The UI shows *Failed — showing cached data* with the last successful time.
- A **partial** run stores what was valid but **does not** mark resources absent or recommendations *not returned*.
- Cost windows are re-fetched each time (first day of previous month → today) and replaced atomically per subscription and cost type, so Azure restatements are picked up.
- Runs interrupted by a restart are closed as `failed / interrupted` at the next refresh.

## 2. Health and freshness

**Administration → Connector health by subscription** shows, per source and subscription: status, last attempt, last success, duration, records written, and a sanitized error. Status meanings: [DATA_DICTIONARY.md](DATA_DICTIONARY.md) §6. The Overview shows the worst status per source.

| Symptom | Likely cause | Action |
|---|---|---|
| Inventory **Unauthorized**: "subscription is not visible to the application identity" | Reader not assigned, or wrong subscription ID | Re-run AZURE_SETUP §4.1 for that subscription; wait for RBAC propagation; refresh |
| Cost **Unauthorized** (`forbidden`) | Cost Management Reader missing, or EA/MCA view-charges setting off | AZURE_SETUP §2 billing prerequisite |
| Cost **failed** `invalid_response … no 'Cost' column` | Agreement uses `PreTaxCost` | Set `FCC_COST_AGGREGATION_COLUMN=PreTaxCost`, restart, refresh |
| Any **throttled** | Azure rate limits | Retries are automatic and bounded; lower refresh frequency |
| **Stale** | Scheduler off, app sleeping, or repeated failures | Check Always On, `FCC_SYNC_INTERVAL_MINUTES`, recent runs |
| `limit_exceeded` | More resources than `FCC_MAX_RESOURCES` | Raise the limit deliberately, or narrow the approved scope |
| Page says **Pilot configuration is incomplete** | Missing or invalid `FCC_*` setting | The page lists variable names; fix the App Settings |
| Page says **Database not ready** | Migrations not applied for this version | DEPLOYMENT step 9 |
| Users see **No FCC role assigned** | No Entra app-role assignment | Assign a role (AZURE_SETUP §3.7) |
| Engineer missing from *Assign owner* | Has not signed in yet, or lacks `FCC.Engineering` | Ask them to sign in once |

## 3. Logs and monitoring

- Application logs are JSON lines on stdout/stderr (events: `pilot.start`, `config.incomplete`, `sync.run`, `sync.scheduled_complete`, `api.unhandled` with a request ID). They are collected by App Service → Log Analytics (`AppServiceConsoleLogs`), and HTTP logs by `AppServiceHTTPLogs`. Application Insights uses auto-instrumentation.
- Useful query (Log Analytics):
  `AppServiceConsoleLogs | where ResultDescription has "sync.run" | project TimeGenerated, ResultDescription | order by TimeGenerated desc`
- Recommended alerts (to configure; not created by Bicep): any `failed` or `unauthorized` sync run in 24 hours; `/api/health` availability; HTTP 5xx rate.
- Database: SQL auditing goes to Log Analytics (`SQLSecurityAuditEvents`). Point-in-time restore retention is `sqlBackupRetentionDays` (default 7).

## 4. Routine tasks

| Task | Frequency | Owner |
|---|---|---|
| Review connector health | Daily during the pilot | FinOps |
| Rotate the Entra client secret (new secret → update Key Vault → verify sign-in → delete old) | Before expiry | Entra admin |
| Review Entra role assignments | Monthly | Business sponsor + Entra admin |
| Review the audit log for unexpected actions | Weekly | Admin |
| Review pilot cost against budget | Monthly | Sponsor |
| Dependency audit (`npm audit` for the full tree and `npm audit --omit=dev` for production), update the register in PILOT_READINESS_REPORT §5a, and patch | Monthly | Engineering |

## 5. Backup and recovery

Azure SQL automated backups with point-in-time restore. Restore procedure: [ROLLBACK_AND_RECOVERY.md](ROLLBACK_AND_RECOVERY.md). Azure-sourced data (inventory, cost, Advisor) can always be re-fetched. Workflow, evidence, verification and audit records exist only in the database, so the backup retention must meet the organization's policy.

## 6. Cost of the pilot and clean-up

Billed resources: App Service plan (B1 default), Azure SQL database (S0 default), Log Analytics ingestion/retention, Application Insights, Key Vault operations. Enable the budget (`deployBudget=true`). Clean-up after the pilot, once records are exported and retention is agreed: delete the resource group ⚠️, remove the subscription role assignments, and delete the Entra app registration. Key Vault purge protection keeps the vault name reserved for the soft-delete period.

## 7. Responsibilities

| Area | Owner |
|---|---|
| Connector health and data quality | FinOps product owner |
| Platform (App Service, SQL, Key Vault, logs) | Application/deployment engineer |
| Identity and role assignments | Entra administrator |
| Subscription access grants | Subscription owners |
| Incident escalation | see LEADER_HANDOFF.md responsibility matrix |
