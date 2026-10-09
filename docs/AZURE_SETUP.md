# Azure and Microsoft Entra setup — FCC single-organization pilot

This guide lists everything an authorized administrator must configure. **Nothing here has been performed by the implementation team.** No tenant, subscription, app registration or role assignment has been created, and no live Azure request has been made. Every step is *pending organizational approval*.

Conventions: ⚠️ = changes Azure or Entra (may incur cost or grant access). 🔒 = requires an authenticated, authorized session. Placeholders are written `<like-this>`. Never paste real values into files in Git.

## 1. Decisions to make first (owner: business sponsor + cloud administrator)

| Decision | Example placeholder | Who approves |
|---|---|---|
| Entra tenant for the pilot | `<tenant-id>` | Entra administrator |
| Hosting subscription and region | `<hosting-subscription-id>`, `<region>` | Azure subscription owner |
| Resource group name | `rg-fcc-pilot` | Azure subscription owner |
| **Approved subscriptions** whose cost, inventory and Advisor data FCC may read (≤ 25) | `<approved-subscription-id-1>,…` | Owners of each subscription + business sponsor |
| SQL admin Entra group (people allowed to run migrations) | `<sql-admin-group>` | Entra administrator |
| Pilot users and their FCC roles | see §4 | Business sponsor + FinOps product owner |
| Monthly budget for the pilot resource group | `200` (billing currency) | Business sponsor |

## 2. Prerequisite checks (owner: cloud administrator) 🔒

Read-only. Name the subscription explicitly on every command; do not rely on, or change, the CLI default subscription. Confirm that the subscription is the approved hosting subscription and **not the separate FinThrive pilot**.
```bash
az login --tenant <tenant-id>
az account show --subscription <hosting-subscription-id> --query "{tenant:tenantId, subscription:name, state:state}" -o table
# Resource providers used by the pilot resources (register if "NotRegistered"):
for p in Microsoft.Web Microsoft.Sql Microsoft.KeyVault Microsoft.OperationalInsights Microsoft.Insights Microsoft.Consumption; do
  az provider show -n $p --subscription <hosting-subscription-id> --query "{provider:namespace, state:registrationState}" -o tsv
done
```
```powershell
az login --tenant <tenant-id>
az account show --subscription <hosting-subscription-id> --query "{tenant:tenantId, subscription:name, state:state}" -o table
"Microsoft.Web","Microsoft.Sql","Microsoft.KeyVault","Microsoft.OperationalInsights","Microsoft.Insights","Microsoft.Consumption" | ForEach-Object { az provider show -n $_ --subscription <hosting-subscription-id> --query "{provider:namespace, state:registrationState}" -o tsv }
```
⚠️ `az provider register -n <namespace> --subscription <hosting-subscription-id>` registers a missing provider (subscription Contributor needed). `npm run preflight:azure` (DEPLOYMENT step 5) repeats all of these checks and the what-if in one read-only run.

Billing prerequisite for cost data (owner: billing administrator). This depends on the agreement type and **must be confirmed**:
- **Enterprise Agreement:** the "Account owners can view charges" (AO view charges) setting must be **On**. An Enterprise Administrator sets it.
- **Microsoft Customer Agreement:** the billing profile's **Azure charges** policy must allow subscription users to view charges. A billing profile owner sets it.
- **Pay-as-you-go:** no extra setting is documented.

## 3. Entra app registration for sign-in (owner: Entra administrator) ⚠️🔒

Microsoft Entra admin center → **Identity → Applications → App registrations → New registration**:

1. **Name:** `FinOps Command Center (pilot)`. **Supported account types:** *Accounts in this organizational directory only (single tenant)*.
2. **Redirect URI** (platform *Web*): `<webAppUrl>/.auth/login/aad/callback`, where `webAppUrl` is an output of the infrastructure deployment (DEPLOYMENT.md step 6), so this URI is added afterwards. Use the output, not a URL built from the app name: App Service may assign a unique default host name.
3. **Authentication:** under *Implicit grant and hybrid flows*, select **ID tokens** (App Service Authentication sign-in).
4. **App roles → Create app role**, four times. *Allowed member types* = Users/Groups. The **Value** must match exactly:

| Display name | Value | Grants in FCC |
|---|---|---|
| FCC Executive | `FCC.Executive` | Read-only portfolio: overview, cost, resources, recommendations, verified savings |
| FCC FinOps | `FCC.FinOps` | Validate, assign, prioritize, defer/reject (before assignment), reopen, verify savings, close; trigger refresh |
| FCC Engineering | `FCC.Engineering` | Only recommendations assigned to them: accept, decline/defer, record ticket and change references, submit plan and evidence |
| FCC Administrator | `FCC.Admin` | Connector health, users, audit log, configuration summary, trigger refresh. **No** workflow or savings decisions |

5. **Certificates & secrets → New client secret.** Copy the value once and store it **only** in the pilot Key Vault (DEPLOYMENT.md step 7). Record the expiry date in the operations calendar; rotate before it expires (OPERATIONS.md).
6. **Enterprise applications → FinOps Command Center (pilot) → Properties → Assignment required? = Yes.** Users without an assignment cannot sign in.
7. **Users and groups → Add user/group:** assign each pilot user or group one or more FCC roles. Assigning roles to groups requires Microsoft Entra ID P1 or higher.
8. Record the **Application (client) ID** and the **Directory (tenant) ID** for the deployment parameters.

Notes:
- FCC maps **only** these four role values. Email domains and other claims never grant access.
- A user who holds FinOps and Engineering roles still cannot verify savings on a change they own or implemented (enforced in code).
- Engineering users appear in FinOps's *Assign owner* list **after their first sign-in**. FCC does not query Microsoft Graph.

## 4. Minimum Azure permissions

### 4.1 Runtime: web app system-assigned managed identity

| Scope | Role | Why | How it is granted |
|---|---|---|---|
| Each approved subscription | **Reader** (`acdd72a7-3385-48ef-bd42-f606fba81ae7`) | Resource Graph inventory; Advisor recommendations | `infra/subscription-reader-access.bicep` (subscription owner) |
| Each approved subscription | **Cost Management Reader** (`72fafb9e-0641-4937-9268-a91bfd8191a3`) | Cost Management query API (Microsoft documents Cost Management Reader for subscription-scope cost access) | same template |
| Pilot Key Vault | **Key Vault Secrets User** (`4633458b-17de-408a-b874-0445c86b69e6`) | Resolves the App Service Authentication secret reference | `infra/main.bicep` (`assignKeyVaultRole=true`) |
| FCC database | `db_datareader`, `db_datawriter`; UPDATE/DELETE **denied** on history tables; no DDL | Workflow persistence | `scripts/pilot/sql/grant-app-identity.sql` |

No Owner, Contributor or write role on any customer subscription is needed or requested. FCC performs no remediation.

### 4.2 People and pipelines

**Ordinary resource deployment and operation** (creates or changes resources; grants nothing to anyone):

| Task | Minimum role | Scope |
|---|---|---|
| Create the resource group; register resource providers | Contributor | Hosting subscription |
| Run `npm run preflight:azure` / `what-if` | Reader is enough for the context checks; `what-if` needs Contributor-level deployment permission (`Microsoft.Resources/deployments/whatIf/action`) | Pilot resource group |
| Deploy `infra/main.bicep` with `assignKeyVaultRole=false` | Contributor | Pilot resource group |
| Temporary SQL firewall rule for migrations | Contributor (or SQL Server Contributor) | Pilot SQL server |
| Run database migrations | Member of the SQL admin Entra group | FCC database |
| Deploy the application (GitHub Actions identity or a person) | **Website Contributor** | Pilot web app only |
| Billing view-charges settings | Enterprise Administrator (EA) / Billing profile owner (MCA) | Billing account |

**Privileged: operations that grant access to other identities.** Each one needs its own approval and should be done by a different person from the one who deploys:

| Task | What it grants | Minimum role | Scope |
|---|---|---|---|
| Deploy `infra/main.bicep` with `assignKeyVaultRole=true` (default) | Web app identity → Key Vault Secrets User | **User Access Administrator** or **Role Based Access Control Administrator**, in addition to Contributor | Pilot resource group |
| Deploy `subscription-reader-access.bicep` | Web app identity → Reader + Cost Management Reader | **Owner** or **User Access Administrator** | Each approved subscription |
| Assign Website Contributor to the deployment identity | GitHub workflow → deploy rights on the web app | Owner / User Access Administrator | Pilot web app |
| Store the Entra secret in Key Vault | (Uses a temporary grant to the administrator) | Key Vault Secrets Officer, granted temporarily and removed afterwards | Pilot Key Vault |
| Run `grant-app-identity.sql` | Web app identity → database read/write | Member of the SQL admin Entra group | FCC database |
| Create the GitHub OIDC federated credential | GitHub `pilot` environment → the deployment identity | Application Administrator (or owner of that app registration) | Tenant |
| Register the app, create app roles, assign users | Users → FCC roles | Application Administrator (or Cloud Application Administrator) | Tenant |

Website Contributor can also change the web app's settings and authentication configuration. Treat the deployment identity and the `pilot` environment approvers as privileged.

### 4.3 GitHub Actions deployment identity (OIDC) ⚠️🔒

The application is deployed by `.github/workflows/deploy-pilot.yml`. Infrastructure, Entra, subscription access and database steps are **not** in the workflow. Settings to create (step-by-step, with verification: [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) §3, H1–H5):

1. A **separate** identity from the runtime identity (an app registration or a user-assigned managed identity), with **no client secret**.
2. A federated credential on it: issuer `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`, subject **`repo:akshaybarbhuvan/finops-command-center-azure-pilot:environment:pilot`**. The deploy job runs in the `pilot` environment, so a branch-based subject does not match.
3. **Website Contributor** on the pilot **web app only**.
4. GitHub → *Settings → Environments → pilot*: **required reviewers** (*Prevent self-review* on); **Deployment branches and tags** = selected branch `main`.
5. GitHub → *Settings → Environments → pilot → Environment variables* (preferred) or repository variables: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `PILOT_RESOURCE_GROUP`, `PILOT_WEBAPP_NAME`. These are variables, not secrets, and no Azure secret is stored in GitHub.
6. GitHub → *Settings → Branches*: protect `main` (pull request + review + `ci` checks). Anyone who can push to `main` can edit the workflow, so the environment's branch rule and reviewers are the controls that cannot be bypassed from a branch.

Before deploying, the workflow checks that the five variables are well-formed and that the signed-in tenant and subscription match them. It also requires the target web app to carry the tag `fcc-workload=finops-command-center-azure-pilot` (set by `main.bicep`), and refuses FinThrive names. Missing settings fail the run with the name of what to fix.

## 5. Application configuration reference

Created as App Settings by `infra/main.bicep`. Template: `.env.pilot.example`.

| Setting | Purpose | Secret? | Set where | Supplied by | Validate |
|---|---|---|---|---|---|
| `APP_MODE` = `pilot` | Selects pilot behaviour | No | App Settings (Bicep) | Engineer | Admin page loads |
| `FCC_BUILD_TARGET` = `pilot` | Build/start target | No | App Settings, build | Engineer | — |
| `FCC_AUTH_MODE` = `appservice` | Trust App Service Authentication headers | No | App Settings | Engineer | Sign-in works; wrong value → 503 configuration page |
| `FCC_ENTRA_TENANT_ID` | Only this tenant's users are accepted | No | App Settings | Entra admin | Users from other tenants get "Access denied" |
| `FCC_AZURE_SUBSCRIPTION_IDS` | Approved subscriptions (comma separated, ≤ 25) | No (but confidential) | App Settings | Sponsor + subscription owners | Admin page shows count and last 6 characters |
| `FCC_PUBLIC_ORIGIN` | Exact https origin users browse to, used for CSRF checks. Bicep parameter `publicOrigin`: leave it empty to use the default host name Azure assigns to the web app (read from the deployed site; it may be `<name>.azurewebsites.net` or a unique `<name>-<hash>.<region>-01.azurewebsites.net`). Set it only for a custom domain bound to the app. `deploy-pilot` refuses to deploy if it is not exactly an https origin on one of the app's host names | No | App Settings | Engineer | Mutations from other origins get 403 |
| `FCC_DB_DIALECT` = `mssql`, `FCC_SQL_SERVER`, `FCC_SQL_DATABASE` | Azure SQL connection (Entra auth, no password) | No | App Settings | Engineer | Pages load; else "Database not ready" |
| `FCC_ADVISOR_CATEGORIES` | Advisor categories (default `Cost`) | No | App Settings | FinOps owner | Admin page |
| `FCC_SYNC_INTERVAL_MINUTES` | Scheduled refresh (0 = off, 60–1440) | No | App Settings | FinOps owner | Admin → recent runs show `scheduled` |
| `FCC_COST_AGGREGATION_COLUMN` | `Cost` (default) or `PreTaxCost` | No | App Settings | Engineer, after the live cost test | Cost runs succeed |
| `FCC_STALE_AFTER_HOURS_INVENTORY/COST/ADVISOR` | Freshness thresholds (26/48/48) | No | App Settings | FinOps owner | Status badges |
| `FCC_MAX_RESOURCES` | Per-subscription inventory bound (default 50,000) | No | App Settings | Engineer | — |
| `FCC_ORG_LABEL` | Header label | No | App Settings | Sponsor | Header |
| `MICROSOFT_PROVIDER_AUTHENTICATION_SECRET` | Entra client secret for App Service Authentication | **Yes** | **Key Vault reference** only | Entra admin | Sign-in works; App Service → Environment variables shows the reference resolved (green) |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Telemetry | Low | App Settings (Bicep) | Bicep | Logs appear |

**Local validation only** (never set on App Service; the configuration refuses them there):

| Setting | Purpose |
|---|---|
| `FCC_LOCAL_VALIDATION=true` | Allows `FCC_AUTH_MODE=appservice` off App Service **with a localhost origin only**, so the offline smoke tests can simulate the App Service identity header. Without it the app refuses to trust that header outside App Service |
| `FCC_DB_DIALECT=sqlite`, `FCC_ALLOW_LOCAL_SQLITE=true`, `FCC_SQLITE_PATH` | Local SQLite database |
| `FCC_AUTH_MODE=development`, `FCC_DEV_PRINCIPAL_JSON` | `next dev` only. JSON `{"id":"<guid>","name":"…","roles":["FCC.FinOps"]}` |
| `FCC_FIXTURES_CONFIRM=local-only` | Required by `npm run dev:fixtures` |

Scope: the pilot targets the **Azure public cloud** (`management.azure.com`, `*.database.windows.net`). Sovereign clouds are not supported in this release.

## 6. Verification checklist after setup (live — pending)

| # | Check | Expected result | Owner |
|---|---|---|---|
| 1 | Open the site in a private window | Redirect to Microsoft sign-in for the pilot tenant | Engineer |
| 2 | Sign in as a user without an assignment | Entra blocks sign-in ("assignment required") | Entra admin |
| 3 | Sign in as each role | Lands on its home page; navigation matches the role | Pilot testers |
| 4 | Admin → *Refresh Azure data now*, wait, reload | Each source × subscription shows **Connected** with a recent *Last success* | Admin |
| 5 | Remove Cost Management Reader from one test subscription (if permitted) and refresh | That cost row shows **Unauthorized**; previously stored data remains with its timestamp | Admin |
| 6 | Compare Cost → previous month actual with the Azure portal Cost analysis for the same subscription, month and currency | Totals match within rounding; differences explained by refresh timing | FinOps owner |
| 7 | Compare an Advisor recommendation with the Azure portal Advisor blade | Same recommendation ID, impact and savings/currency | FinOps owner |
