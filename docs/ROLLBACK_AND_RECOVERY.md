# Rollback and recovery — FCC Azure pilot

Three layers are rolled back differently. Every command names the subscription explicitly (`$FCC_SUBSCRIPTION_ID`, `$FCC_RG`: DEPLOYMENT.md "Explicit target"); confirm with `az account show --subscription "$FCC_SUBSCRIPTION_ID"` that it is the FCC pilot and **not the FinThrive pilot** before any change. **Never reset, drop or recreate the pilot database as a recovery step.** It holds the only copy of workflow decisions, evidence, verifications and audit history.

## 1. Identify what is deployed

| Item | Where |
|---|---|
| Application release | Administration page → *Deployed release* (from `.fcc-version`, written by the deploy workflow or DEPLOYMENT step 10) |
| Deployment history | App Service → *Deployment Center → Logs*; GitHub → *Actions → deploy-pilot* runs |
| Release artifacts | GitHub artifact `fcc-pilot-<commit>` (30 days) or the retained `fcc-pilot.zip` files |
| Database schema version | `SELECT version, name, applied_at FROM schema_migrations ORDER BY version` |
| Infrastructure | `az deployment group list --subscription "$FCC_SUBSCRIPTION_ID" -g "$FCC_RG" -o table` |

## 2. Stop a bad release

1. GitHub: cancel the running *deploy-pilot* run, or reject the `pilot` environment approval.
2. If a broken version is live and users are affected: *App Service → Stop* (users get an error page; no data changes). Or proceed directly to §3.
3. Tell pilot users. Record the time, release and symptoms (see §7).

## 3. Application rollback (safe, routine) ⚠️🔒 Website Contributor

Redeploy the previous good package:
```bash
az webapp deploy --subscription "$FCC_SUBSCRIPTION_ID" --resource-group "$FCC_RG" --name <webAppName> --src-path <previous fcc-pilot.zip> --type zip
node scripts/pilot/check-deployment.mjs --base-url "<webAppUrl>"
```
Or re-run *deploy-pilot* for the previous good commit: the workflow deploys only `main`, so revert the bad change on `main` through a reviewed pull request, then run it (same `pilot` approval). Then confirm the *Deployed release* on the Administration page.

**Check first:** did the bad release apply a **new migration**? Migrations only add tables, columns and indexes, so an older application normally keeps working against the newer schema. However, the older version's migration runner will refuse to run ("Database has migration N, which this application version does not know"), and an older version cannot use the new objects. If the new migration changed behaviour the old version depends on, fix forward (§4) instead of rolling back.

## 4. Failed or problematic migration ⚠️🔒 SQL admin group

- Each migration runs in a transaction. A failed migration leaves the schema unchanged and records nothing. Read the error from `npm run db:migrate`, fix the cause (permissions, firewall, SQL error), and re-run.
- "Migration N was modified after it was applied": someone edited an applied migration. Restore the original text from version control. Never edit applied migrations. Add a new version instead.
- A migration applied but the new release is faulty: keep the schema (migrations only add objects) and fix forward with a corrected application release. Down-migrations are deliberately not provided.

## 5. Database restore (data corruption or erroneous bulk change) ⚠️🔒 SQL server Contributor

Use point-in-time restore to a **new** database. Never overwrite in place:
```bash
az sql db restore --subscription "$FCC_SUBSCRIPTION_ID" --resource-group "$FCC_RG" --server <sql-server-name> --name fcc --dest-name fcc-restore-<yyyymmddhhmm> --time "<UTC ISO time before the incident>"
```
Then:
1. Compare the restored database with the live one (affected recommendations, `audit_events` around the incident).
2. Decide with the FinOps product owner whether to (a) copy specific rows back, or (b) switch `FCC_SQL_DATABASE` to the restored database. Option (b) loses changes made after the restore point: get approval and record which records are affected.
3. Re-run `grant-app-identity.sql` on the restored database before switching.

Retention: `sqlBackupRetentionDays` (default 7 days). Agree a longer retention if the pilot must keep evidence longer.

## 6. Partial or failed synchronization

- No action is needed to protect data: failed runs change nothing, and partial runs skip reconciliation.
- Fix the cause (OPERATIONS §2), then refresh. Runs stuck as `running` after a crash are closed automatically at the next refresh (`failed / interrupted`); the lease expires after 60 minutes.
- To force a full re-read of one source: `npm run sync:pilot -- cost` (or `inventory`, `advisor`). Writes are idempotent.

## 7. Infrastructure recovery ⚠️🔒

- Re-deploying `infra/main.bicep` with the same parameters is idempotent and restores settings drift (App Settings, authentication, diagnostics). Review `what-if` first.
- Deleted web app: redeploy the infrastructure, then the application (§3). Data is unaffected.
- Deleted Key Vault: recover from soft delete (`az keyvault recover --subscription "$FCC_SUBSCRIPTION_ID" --name <keyVaultName>`). Purge protection means it **cannot** be purged early; see §9.
- Deleted SQL database: restore the deleted database from the portal (*SQL server → Deleted databases*) within the retention period.
- Lost subscription access: re-run `subscription-reader-access.bicep`.

## 8. Escalation

| Situation | Escalate to | Evidence to provide |
|---|---|---|
| Users cannot sign in | Entra administrator | Time, user, error page text, App Service auth logs |
| Data wrong or missing | FinOps product owner, then engineer | Connector health screenshot, run IDs, the Azure portal comparison |
| Suspected unauthorized access or data exposure | Security contact + business sponsor; stop the app if exposure is ongoing | Audit log export, App Service HTTP logs, timeline |
| Migration or restore decision | Engineer + FinOps product owner + sponsor approval | Error output, schema version, the restore point chosen |

## 9. Decommissioning and cleanup ⚠️🔒

Use this at the end of the pilot, or to abandon a deployment. Every step needs the approval of the business sponsor and the role listed. Work in this order, so that nothing keeps access after its resources are gone.

1. **Retain evidence first** (SQL admin group, FinOps product owner): export the audit log (Administration → *Audit log* export, or `SELECT * FROM audit_events`) and any evidence or verification records that must be kept. After the SQL server is deleted, its databases **cannot** be restored.
2. **Stop deployments** (repository administrator): delete or disable the five `pilot` environment variables, or the `pilot` environment itself.
3. **Remove the deployment identity's access** (Entra administrator + Owner/UAA): delete the Website Contributor assignment and the federated credential (or the whole deployment app registration / managed identity).
4. **Remove read access to approved subscriptions** (owner of each subscription):
   ```bash
   az role assignment delete --subscription <approved-subscription-id> --assignee <webAppPrincipalId> --role "Reader" --scope /subscriptions/<approved-subscription-id>
   az role assignment delete --subscription <approved-subscription-id> --assignee <webAppPrincipalId> --role "Cost Management Reader" --scope /subscriptions/<approved-subscription-id>
   ```
   Do this **before** deleting the web app: once the managed identity is deleted, its assignments remain as orphaned "Identity not found" entries that must be cleaned up by hand.
5. **Delete the resource group** (cloud administrator). Check the name and the tag first:
   ```bash
   az group show --subscription "$FCC_SUBSCRIPTION_ID" --name "$FCC_RG" --query "{name:name, tags:tags}" -o json   # must show fcc-workload=finops-command-center-azure-pilot
   az resource list --subscription "$FCC_SUBSCRIPTION_ID" -g "$FCC_RG" -o table                                      # only FCC resources
   az group delete --subscription "$FCC_SUBSCRIPTION_ID" --name "$FCC_RG"
   ```
6. **Key Vault purge protection (expected, not an error):** the vault stays soft-deleted for 90 days (`softDeleteRetentionInDays`). It **cannot be purged** during that time, and its name cannot be reused. A new deployment into a resource group with the same name and `namePrefix` produces the same vault name and fails. Use a new `namePrefix`, or `az keyvault recover` to reuse the old vault. `az keyvault list-deleted --subscription "$FCC_SUBSCRIPTION_ID"` shows it and its scheduled purge date. The Entra client secret inside it is unusable once the app registration is deleted.
7. **Entra** (Entra administrator): delete the sign-in app registration (this also invalidates its client secret) and, if no longer needed, the SQL admin group.
8. **Billing**: the budget (if deployed) is deleted with the resource group. Confirm cost stops in Cost Management after the next billing refresh.
