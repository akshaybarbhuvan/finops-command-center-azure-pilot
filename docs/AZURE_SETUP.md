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

```bash
az login --tenant <tenant-id>
az account set --subscription <hosting-subscription-id>
# Resource providers used by the pilot resources (register if "NotRegistered"):
for p in Microsoft.Web Microsoft.Sql Microsoft.KeyVault Microsoft.OperationalInsights Microsoft.Insights Microsoft.Consumption; do
  az provider show -n $p --query "{provider:namespace, state:registrationState}" -o tsv
done
```
```powershell
az login --tenant <tenant-id>
az account set --subscription <hosting-subscription-id>
"Microsoft.Web","Microsoft.Sql","Microsoft.KeyVault","Microsoft.OperationalInsights","Microsoft.Insights","Microsoft.Consumption" | ForEach-Object { az provider show -n $_ --query "{provider:namespace, state:registrationState}" -o tsv }
```
⚠️ `az provider register -n <namespace>` registers a missing provider (subscription Contributor needed).

Billing prerequisite for cost data (owner: billing administrator). This depends on the agreement type and **must be confirmed**:
- **Enterprise Agreement:** the "Account owners can view charges" (AO view charges) setting must be **On**. An Enterprise Administrator sets it.
- **Microsoft Customer Agreement:** the billing profile's **Azure charges** policy must allow subscription users to view charges. A billing profile owner sets it.
- **Pay-as-you-go:** no extra setting is documented.

## 3. Entra app registration for sign-in (owner: Entra administrator) ⚠️🔒

Microsoft Entra admin center → **Identity → Applications → App registrations → New registration**:

1. **Name:** `FinOps Command Center (pilot)`. **Supported account types:** *Accounts in this organizational directory only (single tenant)*.
2. **Redirect URI** (platform *Web*): `https://<web-app-name>.azurewebsites.net/.auth/login/aad/callback`. The web app name is an output of the infrastructure deployment (DEPLOYMENT.md step 6), so this URI can be added afterwards.
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

| Task | Minimum role | Scope |
|---|---|---|
| Deploy `infra/main.bicep` | Contributor; plus **User Access Administrator** or **Role Based Access Control Administrator** if `assignKeyVaultRole=true` | Pilot resource group |
| Store the Entra secret in Key Vault | Key Vault Secrets Officer (grant temporarily) | Pilot Key Vault |
| Deploy `subscription-reader-access.bicep` | Owner or User Access Administrator | Each approved subscription |
| Run database migrations and the grant script | Member of the SQL admin Entra group; Contributor on the SQL server for the temporary firewall rule | Pilot SQL server |
| Deploy the application (GitHub Actions or CLI) | **Website Contributor** | Pilot web app |
| Register the app, create app roles, assign users | Application Administrator (or Cloud Application Administrator) | Tenant |
| Billing view-charges settings | Enterprise Administrator (EA) / Billing profile owner (MCA) | Billing account |

### 4.3 GitHub Actions deployment identity (OIDC) ⚠️🔒

Create a **separate** identity from the runtime identity (an app registration or a user-assigned managed identity) and add a federated credential:
- Issuer `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`.
- Subject `repo:<github-org>/<repo>:environment:pilot`.

Grant it **Website Contributor** on the pilot web app only. That role can also change app settings and authentication, so treat the identity and the environment approvers as privileged. Then in GitHub → *Settings → Environments → pilot* add **required reviewers**, restrict **Deployment branches** to `main`, and set the variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `PILOT_RESOURCE_GROUP`, `PILOT_WEBAPP_NAME`. No client secret is stored in GitHub.

## 5. Application configuration reference

Created as App Settings by `infra/main.bicep`. Template: `.env.pilot.example`.

| Setting | Purpose | Secret? | Set where | Supplied by | Validate |
|---|---|---|---|---|---|
| `APP_MODE` = `pilot` | Selects pilot behaviour | No | App Settings (Bicep) | Engineer | Admin page loads |
| `FCC_BUILD_TARGET` = `pilot` | Build/start target | No | App Settings, build | Engineer | — |
| `FCC_AUTH_MODE` = `appservice` | Trust App Service Authentication headers | No | App Settings | Engineer | Sign-in works; wrong value → 503 configuration page |
| `FCC_ENTRA_TENANT_ID` | Only this tenant's users are accepted | No | App Settings | Entra admin | Users from other tenants get "Access denied" |
| `FCC_AZURE_SUBSCRIPTION_IDS` | Approved subscriptions (comma separated, ≤ 25) | No (but confidential) | App Settings | Sponsor + subscription owners | Admin page shows count and last 6 characters |
| `FCC_PUBLIC_ORIGIN` | Exact https origin users browse to, used for CSRF checks. Bicep parameter `publicOrigin` (empty = `https://<web-app-name>.azurewebsites.net`). Update it when adding a custom domain, or when App Service assigns a unique default host name | No | App Settings | Engineer | Mutations from other origins get 403 |
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
