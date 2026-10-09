# Deployment — FCC Azure pilot

Order: **local validation → approvals → Entra registration → infrastructure preflight (what-if) → infrastructure → secret and redirect URI → subscription access → database → GitHub deployment settings → application → live verification.**

What is automated and what is not:

| Phase | How it runs | Who |
|---|---|---|
| Infrastructure (`infra/main.bicep`) | **Operator commands** in this guide (steps 5–6). Not automated | Cloud administrator |
| Entra app registration, secret, redirect URI, user assignments | **Portal**, by hand (AZURE_SETUP §3, step 7) | Entra administrator |
| Read-only access per approved subscription (`infra/subscription-reader-access.bicep`) | **Operator commands** (step 8) | Owner of each subscription |
| Database schema and application identity grant | **Operator commands** (step 9). Never run by the workflow | SQL admin group member |
| Application package | **GitHub Actions `deploy-pilot`** (step 11, preferred) or workstation fallback | Deployment operator + `pilot` environment approver |

The role-based checklist with STOP/GO gates is [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md). Legend: 🟢 local, changes nothing in Azure · 🔎 reads Azure only · ⚠️ changes Azure or Entra / may incur cost · 🔒 needs an authenticated session with the role listed.

Prerequisites: Node.js **22 LTS** (`.nvmrc`), npm 10+, Git, Azure CLI ≥ 2.60 with Bicep (`az bicep install`), and the roles in [AZURE_SETUP.md](AZURE_SETUP.md) §4.

## Explicit target (every Azure step)

Every Azure command in this guide names its tenant, subscription and resource group explicitly. **Never rely on the Azure CLI's default subscription**, and never run these commands against the separate FinThrive pilot. Set the targets once per shell:

```bash
export FCC_TENANT_ID=<tenant-id>
export FCC_SUBSCRIPTION_ID=<hosting-subscription-id>     # a GUID, not a name
export FCC_RG=rg-fcc-pilot
export FCC_LOCATION=<region>                              # e.g. westeurope
export FCC_DENY_SUBSCRIPTION_IDS=<finthrive-subscription-id>[,<other-protected-id>]   # refused by the preflight
```
```powershell
$env:FCC_TENANT_ID="<tenant-id>"; $env:FCC_SUBSCRIPTION_ID="<hosting-subscription-id>"; $env:FCC_RG="rg-fcc-pilot"; $env:FCC_LOCATION="<region>"
$env:FCC_DENY_SUBSCRIPTION_IDS="<finthrive-subscription-id>"
```
Before every ⚠️ command, confirm the context and stop if anything is unexpected:
```bash
az account show --subscription "$FCC_SUBSCRIPTION_ID" --query "{tenant:tenantId, subscription:name, id:id, user:user.name}" -o table
```

## Step 1 — Clean checkout and dependencies 🟢 (application engineer)

```bash
git clone https://github.com/akshaybarbhuvan/finops-command-center-azure-pilot.git fcc && cd fcc
git checkout main && git pull
npm ci
```
Expected: `added … packages`, no errors. If `better-sqlite3` fails to build, install the platform build tools; it is used only for local validation and tests.

## Step 2 — Offline validation 🟢 (application engineer)

```bash
npm run validate:demo     # demo build: 9 checks
npm run validate:pilot    # pilot: type check, lint, all tests, Bicep, pilot build, bundle scan, server smoke tests
npm audit --omit=dev --audit-level=high   # production dependencies: must report no high or critical
```
Bicep: `validate:pilot` uses `BICEP_BIN` or `bicep` on PATH. After `az bicep install` on a workstation set `BICEP_BIN=$HOME/.azure/bin/bicep` (Windows: `$env:BICEP_BIN = "$HOME\.azure\bin\bicep.exe"`).
Expected: `READY — 9/9` and `PASSED — <n>/<n>` (19 checks today). Any failure is a **STOP**. The same checks run in GitHub Actions (`ci`) on every pull request and push to `main`.

## Step 3 — Organizational decisions and approvals (no Azure change)

Decisions D1–D6 and the dependency decisions DEP-2/DEP-3 must be recorded before any ⚠️ step: [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) §2 and [PILOT_READINESS_REPORT.md](PILOT_READINESS_REPORT.md) §5a.

## Step 4 — Entra registration and parameters file ⚠️🔒 (Entra administrator) / 🟢 (engineer)

1. Complete [AZURE_SETUP.md](AZURE_SETUP.md) §3 (app registration, app roles, client secret held for step 7, assignment required).
2. Create the parameters file (git-ignored; contains IDs, no secrets):
   ```bash
   cp infra/main.parameters.example.json infra/main.parameters.json      # PowerShell: Copy-Item …
   ```
   Fill in every `<placeholder>`. `namePrefix`: 3–16 characters, lowercase letters, digits and single hyphens, starting with a letter. Optionally add `"tags": { "value": { "costCenter": "…" } }`; the `fcc-workload` tag is always added.
3. Validate it offline:
   ```bash
   npm run preflight:azure -- --params-only --parameters infra/main.parameters.json
   ```
   Expected: `GO — parameters file is valid`.

## Step 5 — Resource group and read-only preflight 🔎 / ⚠️ (cloud administrator)

1. Sign in to the **pilot tenant**: `az login --tenant "$FCC_TENANT_ID"`.
2. ⚠️ Create a **dedicated** resource group with the workload tag (Contributor on the subscription). Skip if it already exists and is tagged:
   ```bash
   az group create --subscription "$FCC_SUBSCRIPTION_ID" --name "$FCC_RG" --location "$FCC_LOCATION" --tags fcc-workload=finops-command-center-azure-pilot
   ```
3. 🔎 Run the preflight. It is read-only: it checks the signed-in tenant and subscription, the FinThrive deny rules, resource-provider registration, the resource group's region and tag, and the parameters. It then runs `what-if` and saves the result:
   ```bash
   npm run preflight:azure -- --tenant "$FCC_TENANT_ID" --subscription "$FCC_SUBSCRIPTION_ID" \
     --resource-group "$FCC_RG" --location "$FCC_LOCATION" --parameters infra/main.parameters.json \
     --what-if-out fcc-preflight-what-if.json
   ```
   Expected: `GO for human review`. Any `STOP` line blocks the deployment. The script explains each STOP: unregistered providers (`az provider register --namespace <ns> --subscription "$FCC_SUBSCRIPTION_ID"`, after approval), untagged or wrong-region resource group, a protected target, deletions, or changes outside the resource group. If what-if fails with a capacity or quota message (for example `SubscriptionIsOverQuotaForSku`, or "location is not accepting creation of new … servers"), choose another region or SKU, or request quota.
4. **Human review (GATE G3):** read `fcc-preflight-what-if.json` (git-ignored) or re-run `az deployment group what-if` interactively. Expected on a first deployment: **Create** only, for Log Analytics, Application Insights, Key Vault, App Service plan, Web App (with its `appsettings` and `authsettingsV2` configuration, publishing-credential policies, diagnostic settings), SQL server, firewall rule (if enabled), auditing settings, database, backup policy, the Key Vault role assignment, and the budget if enabled. On a re-deployment, read every **Modify** line. **Stop if anything would be deleted, or if anything outside this resource group would change.**

## Step 6 — Deploy infrastructure ⚠️🔒 (cloud administrator: Contributor + User Access Administrator or RBAC Administrator on the resource group)

Only after G3 is approved:
```bash
az deployment group create --subscription "$FCC_SUBSCRIPTION_ID" --resource-group "$FCC_RG" --name fcc-pilot-infra \
  --template-file infra/main.bicep --parameters @infra/main.parameters.json
az deployment group show --subscription "$FCC_SUBSCRIPTION_ID" --resource-group "$FCC_RG" --name fcc-pilot-infra --query properties.outputs -o json
```
Record the outputs `webAppName`, `webAppUrl`, `publicOriginConfigured`, `webAppPrincipalId`, `sqlServerFqdn`, `sqlDatabaseName` and `keyVaultName`. **Use `webAppUrl` as the address, and never build the URL from the app name**: depending on the subscription and region, App Service assigns either `<name>.azurewebsites.net` or a unique default host name (`<name>-<hash>.<region>-01.azurewebsites.net`). With `publicOrigin` left empty, the template sets `FCC_PUBLIC_ORIGIN` from the host name Azure actually assigned. **Check that `publicOriginConfigured` equals `webAppUrl`**, or your custom domain if you set `publicOrigin`. The deploy workflow also checks this before every application deployment, and stops if they differ, because every change would otherwise be rejected as cross-site.
Cost: the B1 plan, S0 database, Log Analytics ingestion and Key Vault operations are billed from now on.
Failure symptoms: `AuthorizationFailed` on `Microsoft.Authorization/roleAssignments/write` means the deployer lacks the privileged role. Deploy again with `"assignKeyVaultRole": { "value": false }` and ask an administrator to assign *Key Vault Secrets User* on the vault to `webAppPrincipalId`. A name conflict means you should change `namePrefix`. `MissingSubscriptionRegistration` means a provider must be registered (step 5).

## Step 7 — Entra secret and redirect URI ⚠️🔒 (Entra administrator + Key Vault Secrets Officer, granted temporarily)

1. Key Vault `<keyVaultName>` → *Secrets → Generate/Import*: name `entra-auth-client-secret`, value = the client secret from AZURE_SETUP §3.5. Use the portal so the value never enters shell history. Then remove the temporary Key Vault Secrets Officer assignment.
2. App registration → *Authentication*: add the redirect URI `<webAppUrl>/.auth/login/aad/callback` (use the actual `webAppUrl` output).
3. Web app → *Settings → Environment variables*: `MICROSOFT_PROVIDER_AUTHENTICATION_SECRET` shows a **resolved** Key Vault reference (green tick).

## Step 8 — Grant read-only access to each approved subscription ⚠️🔒 (Owner or User Access Administrator of **that** subscription)

This step **grants access to another identity**. Run it once per subscription listed in `approvedSubscriptionIds`, after the owner has reviewed the what-if:
```bash
APPROVED=<approved-subscription-id>
az account show --subscription "$APPROVED" --query "{tenant:tenantId, subscription:name}" -o table   # confirm: not FinThrive
az deployment sub what-if --subscription "$APPROVED" --location "$FCC_LOCATION" --template-file infra/subscription-reader-access.bicep --parameters principalId=<webAppPrincipalId>
az deployment sub create  --subscription "$APPROVED" --location "$FCC_LOCATION" --name fcc-pilot-reader --template-file infra/subscription-reader-access.bicep --parameters principalId=<webAppPrincipalId>
```
Expected what-if: exactly two role-assignment **Create** lines (Reader, Cost Management Reader) for that principal, and nothing else. RBAC propagation can take several minutes.

## Step 9 — Database schema and application identity ⚠️🔒 (member of the SQL admin group)

Run this **before** the application is deployed or opened to users. The application's health check does **not** test the database. Run from a workstation signed in with `az login --tenant "$FCC_TENANT_ID"` as a member of the SQL admin group. Open the firewall for your IP only, temporarily:
```bash
MYIP=<your-public-ip>
SQLSERVER=<sql-server-name>          # the first label of sqlServerFqdn
az sql server firewall-rule create --subscription "$FCC_SUBSCRIPTION_ID" -g "$FCC_RG" -s "$SQLSERVER" -n operator-migration --start-ip-address "$MYIP" --end-ip-address "$MYIP"
FCC_DB_DIALECT=mssql FCC_SQL_SERVER=<sqlServerFqdn> FCC_SQL_DATABASE=fcc npm run db:migrate
```
```powershell
$env:FCC_DB_DIALECT="mssql"; $env:FCC_SQL_SERVER="<sqlServerFqdn>"; $env:FCC_SQL_DATABASE="fcc"; npm run db:migrate
```
Expected: `{"result":"ok","dialect":"mssql","applied":[1],...}`. Running it again prints `"applied":[]` (idempotent).
Then run `scripts/pilot/sql/grant-app-identity.sql` (replace `<WEB_APP_NAME>` with `webAppName`) in the portal **Query editor** for database `fcc`, signed in with Entra. The final SELECT must list `db_datareader` and `db_datawriter`.
**Always** remove the firewall rule afterwards, even if a step failed:
```bash
az sql server firewall-rule delete --subscription "$FCC_SUBSCRIPTION_ID" -g "$FCC_RG" -s "$SQLSERVER" -n operator-migration
```
Failures: `Login failed for user '<token-identified principal>'` means you are not in the SQL admin group. A `checksum` error means an applied migration was edited; restore it (ROLLBACK_AND_RECOVERY.md §4).

> **Pending live validation:** the Azure SQL code path (`src/pilot/db/mssql.ts`, T-SQL migration) has been tested only against a mocked driver, not a real Azure SQL database. This step is the first live gate (G5). Report any error before continuing.

## Step 10 — GitHub deployment settings ⚠️🔒 (repository administrator + Entra administrator)

Configure, then verify, everything in [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) §3 (H1–H6): `main` branch protection; the `pilot` environment with required reviewers and deployment branches limited to `main`; the OIDC deployment identity with federated subject `repo:akshaybarbhuvan/finops-command-center-azure-pilot:environment:pilot` and **Website Contributor on the web app only**; and the five environment variables. The workflow refers to these settings but cannot create them, and referring to them does not mean they exist.

## Step 11 — Deploy the application ⚠️🔒

**Option A — GitHub Actions (preferred).** *Actions → deploy-pilot → Run workflow*, branch **main**, input `confirm` = `DEPLOY`. Then a `pilot` environment reviewer approves the `deploy` job (*Review deployments → Approve*). The workflow:

| Job | What it does | Fails when |
|---|---|---|
| `guard` | Checks the confirmation and the branch | `confirm` is not exactly `DEPLOY`, or the branch is not `main` (the run fails, it is not silently skipped) |
| `build` | `npm ci`, production `npm audit` (high), typecheck, lint, tests, `build:pilot`, packages `.next-pilot/standalone` with `.fcc-version`, uploads artifact `fcc-pilot-<sha>` (30 days) | any check fails, or the package is incomplete |
| `deploy` (`pilot` environment, approval required) | Validates the five variables. Signs in with OIDC. Confirms the signed-in tenant and subscription match. Confirms the web app exists, is HTTPS-only and carries `fcc-workload=finops-command-center-azure-pilot`, and that `FCC_PUBLIC_ORIGIN` is one of its real host names. Refuses FinThrive names and denied IDs. Deploys the zip. Then runs anonymous checks against the web app's **actual** default host name: `/api/health` → 200 `{"status":"ok"}`, and `/overview` → redirect to `/.auth/login/aad` | any variable is missing or malformed, the context does not match, the target is untagged or protected, the configured origin is wrong, the deployment fails, health does not respond within ~5 minutes, or pages are reachable without sign-in |

**What the post-deployment check does NOT prove:** that migrations ran, that a real user can sign in, or that the Azure data connectors work. Those checks are step 12.

**Option B — workstation fallback** (Website Contributor on the web app; use only if Actions is unavailable, and with the same approvals):
```bash
npm ci && npm run build:pilot
git rev-parse HEAD > .next-pilot/standalone/.fcc-version
(cd .next-pilot/standalone && zip -qr ../../fcc-pilot.zip .)
az webapp show --subscription "$FCC_SUBSCRIPTION_ID" -g "$FCC_RG" -n <webAppName> --query "{host:defaultHostName, tags:tags}" -o json   # confirm the fcc-workload tag
az webapp deploy --subscription "$FCC_SUBSCRIPTION_ID" --resource-group "$FCC_RG" --name <webAppName> --src-path fcc-pilot.zip --type zip
node scripts/pilot/check-deployment.mjs --base-url "<webAppUrl>"
```
Keep each `fcc-pilot.zip` as the release artifact for rollback.

## Step 12 — Live verification ⚠️🔒 (application engineer + pilot testers)

Follow [PILOT_RUNBOOK.md](PILOT_RUNBOOK.md) §2 (acceptance checklist). Minimum before go/no-go:
1. Sign-in as each role; a user without an assignment is blocked.
2. Admin → *Configuration* shows the deployed release (the commit SHA) and database = Azure SQL Database.
3. Admin → *Refresh Azure data now* → every source × subscription shows *Connected* or a correctly explained status.
4. Cost totals reconcile with the Azure portal for one subscription and month.
5. One recommendation completes validate → assign → accept → ticket → plan → change reference → evidence → verification by a different FinOps user.
6. The audit log shows each step.
7. Engineer B cannot open Engineer A's recommendation by URL.

## Rollback and cleanup

See [ROLLBACK_AND_RECOVERY.md](ROLLBACK_AND_RECOVERY.md). Application rollback means redeploying the previous `fcc-pilot.zip` or re-running `deploy-pilot` on the previous commit. Database changes are forward-only; never reset the database. Full decommissioning, including the Key Vault purge-protection consequences, is in §9.
