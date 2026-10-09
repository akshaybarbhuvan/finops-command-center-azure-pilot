# Deployment — FCC Azure pilot

Order: **local validation → infrastructure preview → infrastructure → secrets → subscription access → database → application → verification.** Infrastructure provisioning and application deployment are separate steps.

Legend: 🟢 safe local command (changes nothing in Azure) · ⚠️ changes Azure / may incur cost · 🔒 needs an authenticated Azure session with the role listed.

Prerequisites: Node.js **22 LTS** (`.nvmrc`), npm 10+, Git (from the next phase), Azure CLI ≥ 2.60 with Bicep (`az bicep install`), and access per [AZURE_SETUP.md](AZURE_SETUP.md) §4.

## Step 1 — Clean checkout and dependencies 🟢 (application engineer)

Git is introduced in the next phase. Until then, start from the delivered folder or ZIP.
```bash
git clone <repo-url> fcc && cd fcc        # next phase; for now: unzip and cd into the folder
npm ci
```
Expected: `added … packages`, no errors. If `better-sqlite3` fails to build, install the platform build tools; it is used only for local validation and tests.

## Step 2 — Offline validation 🟢 (application engineer)

```bash
npm run validate:demo     # demo build: 9 checks
npm run validate:pilot    # pilot: type check, lint, all tests, Bicep, pilot build, bundle scan, server smoke tests
```
Windows: run the same commands in PowerShell. For Bicep set `$env:BICEP_BIN = "$HOME\.azure\bin\bicep.exe"` after `az bicep install`.
Expected: `READY — 9/9` and `PASSED — 19/19`. A failure blocks deployment. Fix it or record it in the readiness report.

## Step 3 — Organizational decisions and Entra registration ⚠️🔒

Complete [AZURE_SETUP.md](AZURE_SETUP.md) §1–§3. Owners: business sponsor, Entra administrator.

## Step 4 — Parameters file 🟢 (application engineer)

```bash
cp infra/main.parameters.example.json infra/main.parameters.json      # PowerShell: Copy-Item infra/main.parameters.example.json infra/main.parameters.json
```
Fill in the placeholders. The file contains IDs but no secrets. Keep it out of public repositories (decide in the Git phase whether to commit it).

## Step 5 — Resource group and deployment preview ⚠️🔒 (cloud administrator; Contributor on the subscription to create the RG)

```bash
az login --tenant <tenant-id>
az account set --subscription <hosting-subscription-id>
az group create --name rg-fcc-pilot --location <region>
az deployment group what-if --resource-group rg-fcc-pilot --template-file infra/main.bicep --parameters @infra/main.parameters.json
```
Expected what-if: create Log Analytics, Application Insights, Key Vault, App Service plan, Web App (with `authsettingsV2`, publishing-credential policies, diagnostic settings), SQL server, firewall rule (if enabled), auditing settings, database, backup policy, Key Vault role assignment, and the budget if enabled. **Stop if anything is modified or deleted outside this resource group.**

## Step 6 — Deploy infrastructure ⚠️🔒 (cloud administrator: Contributor + User Access Administrator on the RG)

```bash
az deployment group create --resource-group rg-fcc-pilot --name fcc-pilot-infra --template-file infra/main.bicep --parameters @infra/main.parameters.json
az deployment group show --resource-group rg-fcc-pilot --name fcc-pilot-infra --query properties.outputs -o json
```
Record the outputs `webAppName`, `webAppUrl`, `webAppPrincipalId`, `sqlServerFqdn`, `sqlDatabaseName` and `keyVaultName`. Cost: the B1 plan, S0 database, Log Analytics ingestion and Key Vault operations are billed from now on.
Failure symptoms: `AuthorizationFailed` on the role assignment → deploy again with `assignKeyVaultRole=false` and ask an administrator to assign *Key Vault Secrets User* manually. Name conflicts → change `namePrefix`.

## Step 7 — Entra secret and redirect URI ⚠️🔒 (Entra administrator + Key Vault Secrets Officer)

1. Key Vault `<keyVaultName>` → *Secrets → Generate/Import*: name `entra-auth-client-secret`, value = the client secret from AZURE_SETUP §3.5. Use the portal so the value never enters shell history.
2. App registration → *Authentication*: add the redirect URI `<webAppUrl>/.auth/login/aad/callback`.
3. Web app → *Settings → Environment variables*: `MICROSOFT_PROVIDER_AUTHENTICATION_SECRET` shows a **resolved** Key Vault reference.

## Step 8 — Grant read-only access to each approved subscription ⚠️🔒 (owner of each subscription)

```bash
az deployment sub what-if --subscription <approved-subscription-id> --location <region> --template-file infra/subscription-reader-access.bicep --parameters principalId=<webAppPrincipalId>
az deployment sub create  --subscription <approved-subscription-id> --location <region> --name fcc-pilot-reader --template-file infra/subscription-reader-access.bicep --parameters principalId=<webAppPrincipalId>
```
Expected what-if: exactly two role assignments (Reader, Cost Management Reader) for that principal. Repeat for every subscription listed in `FCC_AZURE_SUBSCRIPTION_IDS`. RBAC propagation can take several minutes.

## Step 9 — Database schema and application identity ⚠️🔒 (member of the SQL admin group)

Run from a workstation signed in with `az login` as a member of the SQL admin group. Open the firewall for your IP only, temporarily:
```bash
MYIP=<your-public-ip>
az sql server firewall-rule create -g rg-fcc-pilot -s <sql-server-name> -n operator-migration --start-ip-address $MYIP --end-ip-address $MYIP
FCC_DB_DIALECT=mssql FCC_SQL_SERVER=<sqlServerFqdn> FCC_SQL_DATABASE=fcc npm run db:migrate
```
```powershell
$env:FCC_DB_DIALECT="mssql"; $env:FCC_SQL_SERVER="<sqlServerFqdn>"; $env:FCC_SQL_DATABASE="fcc"; npm run db:migrate
```
Expected: `{"result":"ok","dialect":"mssql","applied":[1],...}`. Running it again prints `"applied":[]` (idempotent).
Then run `scripts/pilot/sql/grant-app-identity.sql` (replace `<WEB_APP_NAME>`) in the portal **Query editor** for database `fcc`, signed in with Entra. The final SELECT must list `db_datareader` and `db_datawriter`.
Finally remove the firewall rule:
```bash
az sql server firewall-rule delete -g rg-fcc-pilot -s <sql-server-name> -n operator-migration
```
Failures: `Login failed for user '<token-identified principal>'` → you are not in the SQL admin group. `checksum` error → an applied migration was edited; restore it (ROLLBACK_AND_RECOVERY.md §4).

> **Pending live validation:** the Azure SQL code path (`src/pilot/db/mssql.ts`, T-SQL migration) has been tested only against a mocked driver, not a real Azure SQL database. Run this step first in the pilot and report any error before continuing.

## Step 10 — Build and deploy the application ⚠️🔒 (application engineer: Website Contributor on the web app)

**Option A — GitHub Actions (preferred, next phase):** *Actions → deploy-pilot → Run workflow*, type `DEPLOY`, then approve the `pilot` environment. The workflow builds, tests, packages `.next-pilot/standalone`, deploys over OIDC and checks `/api/health`.

**Option B — from a workstation:**
```bash
npm ci && npm run build:pilot
git rev-parse HEAD > .next-pilot/standalone/.fcc-version 2>/dev/null || date -u +%Y%m%dT%H%MZ > .next-pilot/standalone/.fcc-version
(cd .next-pilot/standalone && zip -qr ../../fcc-pilot.zip .)
az webapp deploy --resource-group rg-fcc-pilot --name <webAppName> --src-path fcc-pilot.zip --type zip
```
```powershell
npm ci; npm run build:pilot
(Get-Date -AsUTC -Format "yyyyMMddTHHmmZ") | Set-Content .next-pilot/standalone/.fcc-version
Compress-Archive -Path (Get-ChildItem -Force .next-pilot/standalone).FullName -DestinationPath fcc-pilot.zip -Force
az webapp deploy --resource-group rg-fcc-pilot --name <webAppName> --src-path fcc-pilot.zip --type zip
```
Expected: deployment succeeds, and `curl -s https://<webAppName>.azurewebsites.net/api/health` returns `{"status":"ok"}`. Keep each `fcc-pilot.zip` as the release artifact for rollback.

## Step 11 — Smoke tests (live) ⚠️🔒 (application engineer + pilot testers)

Follow [PILOT_RUNBOOK.md](PILOT_RUNBOOK.md) §2 (acceptance checklist). Minimum before go/no-go:
1. Sign-in as each role.
2. Admin → *Refresh Azure data now* → every source × subscription shows *Connected* or a correctly explained status.
3. Cost totals reconcile with the Azure portal for one subscription and month.
4. One recommendation completes validate → assign → accept → ticket → plan → change reference → evidence → verification by a different FinOps user.
5. Audit log shows each step.
6. Engineer B cannot open Engineer A's recommendation by URL.

## Rollback

See [ROLLBACK_AND_RECOVERY.md](ROLLBACK_AND_RECOVERY.md). Application rollback = redeploy the previous `fcc-pilot.zip`. Database changes are forward-only; never reset the database.
