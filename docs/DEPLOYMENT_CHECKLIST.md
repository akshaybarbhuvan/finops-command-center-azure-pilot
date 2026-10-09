# Deployment checklist and STOP/GO gates — FCC Azure pilot

**Audience:** the VP who authorizes the pilot deployment, and the role holders who do each step. Technical commands: [DEPLOYMENT.md](DEPLOYMENT.md). Permissions: [AZURE_SETUP.md](AZURE_SETUP.md) §4.

**Status when this checklist was written:** the repository is ready for a controlled pilot deployment **after prerequisites**. Nothing in GitHub or Azure listed below has been configured or verified by the engineering team. No Azure deployment has been run, and the `deploy-pilot` workflow has never run. Every item starts as **not done**: a setting the workflow refers to does not count as configured until its owner has verified it.

## 1. How to use this checklist

1. Work through the gates **in order**. A gate is **GO** only when every item in it is ticked with the evidence named. Otherwise it is **STOP**.
2. Never skip a gate because a later step "will catch it". The post-deployment health check, for example, proves only that the web server answers. It does not prove database, sign-in or data access.
3. Every Azure command targets an explicit tenant, subscription and resource group. Before any change, confirm the context is **not the separate FinThrive pilot**. The tooling refuses FinThrive names and any ID in `FCC_DENY_SUBSCRIPTION_IDS`, but the operator remains responsible.

## 2. Decisions and approvals (record before any Azure change)

| ID | Decision | Owner | Evidence required to close | Status |
|---|---|---|---|---|
| D1 | Pilot scope: tenant, **approved subscriptions** (≤ 25), pilot users, duration | Business sponsor | Signed scope note listing tenant ID, subscription IDs and pilot duration | ☐ Open |
| D2 | Hosting subscription, region, resource group name, monthly budget | Azure subscription owner + sponsor | Written approval naming subscription ID, region, `rg-…` name and budget amount | ☐ Open |
| D3 | Savings-verification policy and metric definitions (DATA_DICTIONARY §5) | FinOps product owner | Approved policy, including single vs second reviewer | ☐ Open |
| D4 | Role model and named role holders | Sponsor + FinOps owner | List of users/groups per FCC role | ☐ Open |
| D5 | Residual risks in SECURITY §6 (public endpoints, "Allow Azure services" SQL firewall, CSP `style-src 'unsafe-inline'`, per-instance rate limits) | Security owner + sponsor | Signed risk decision with review date | ☐ Open |
| D6 | Billing allows cost visibility (EA "AO view charges" / MCA "Azure charges" policy) | Billing administrator | Screenshot or confirmation of the setting | ☐ Open |
| D8 / DEP-2 | `braces` 3.0.3 (high, **build tooling only**; no patched release exists) | Security owner + sponsor | Decision recorded in PILOT_READINESS_REPORT §5a (accept for the build environment / remediate first), with review date | ☐ Open |
| D8 / DEP-3 | `sprintf-js` 1.1.3 (moderate, **production** via the Azure SQL driver; no patched release exists; call-site review found no reachable path) | Security owner + sponsor | Decision recorded in PILOT_READINESS_REPORT §5a, with review date | ☐ Open |
| DEP-1 | `postcss` nested in Next.js (high, production) | Engineering lead | **Remediated in the repository** (npm override to 8.5.29; production audit has no high findings). No acceptance needed; re-check `npm audit --omit=dev` at G2 | ☑ Remediated |
| DEP-4 | `postcss-selector-parser` (moderate, build tooling) | Engineering lead | **Remediated in the repository** (npm override to 7.1.6; compiled CSS byte-identical) | ☑ Remediated |
| D7 | Go / no-go after live acceptance | Business sponsor | PILOT_RUNBOOK §2 results recorded in the readiness report | ☐ Open |

Technical remediation and risk acceptance are separate. Engineering cannot close D5, DEP-2 or DEP-3; only the security owner and business sponsor can.

## 3. Human-action checklist (external settings the repository cannot configure)

Verification is always a read-only look by someone other than the person who made the change, where possible.

| # | Item | Where / command | Responsible | Inputs | Expected result | How to verify |
|---|---|---|---|---|---|---|
| H1 | `main` branch protection | GitHub → *Settings → Branches → Add branch ruleset* (or *Branch protection rule*) for `main` | Repository administrator | — | Pull request required; ≥ 1 approving review; status checks `validate` and `dependency-audit` (workflow `ci`) required; force pushes and deletion blocked | *Settings → Branches* shows the rule. Optional: `gh api repos/akshaybarbhuvan/finops-command-center-azure-pilot/branches/main --jq .protected` returns `true` |
| H2 | `pilot` environment | GitHub → *Settings → Environments → New environment* `pilot` | Repository administrator | Names of ≥ 2 approvers (not the operator alone) | *Required reviewers* set; *Prevent self-review* on; *Deployment branches and tags* = **Selected branches: `main`** | Environment page shows reviewers and the branch rule. Optional: `gh api repos/akshaybarbhuvan/finops-command-center-azure-pilot/environments/pilot` |
| H3 | Five deployment variables (not secrets) | *Settings → Environments → pilot → Environment variables* (preferred; repository variables also work) | Repository administrator | `AZURE_CLIENT_ID` (deployment identity client ID), `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (hosting), `PILOT_RESOURCE_GROUP`, `PILOT_WEBAPP_NAME` (`webAppName` output) | Five variables present; **no** Azure secrets stored anywhere in GitHub | The environment page lists the five names. The workflow's `Check deployment configuration` step fails with the missing name if one is absent |
| H4 | OIDC deployment identity + federated credential | Entra admin center → *App registrations → New registration* (or a user-assigned managed identity) → *Certificates & secrets → Federated credentials → Add* → *GitHub Actions deploying Azure resources* | Entra administrator | Organization `akshaybarbhuvan`, repository `finops-command-center-azure-pilot`, entity **Environment** `pilot` | Issuer `https://token.actions.githubusercontent.com`, subject `repo:akshaybarbhuvan/finops-command-center-azure-pilot:environment:pilot`, audience `api://AzureADTokenExchange`. **No client secret** | The federated credential page shows exactly that subject. No secrets exist on the identity |
| H5 | Deployment identity role | Azure portal → web app → *Access control (IAM) → Add role assignment* → **Website Contributor** → the H4 identity | Owner / User Access Administrator on the web app or resource group | `webAppName` | One assignment, scoped to the **web app only** (not the resource group or subscription) | `az role assignment list --assignee <client-id> --all -o table` shows only Website Contributor on the web app |
| H6 | Tenant, hosting subscription, region, resource group | Decisions D1/D2; DEPLOYMENT step 5 | Cloud administrator | IDs from D1/D2 | Dedicated resource group tagged `fcc-workload=finops-command-center-azure-pilot` | `npm run preflight:azure` passes the context, tag and region checks |
| H7 | Resource providers | `az provider show --namespace <ns> --subscription <id>` for Microsoft.Web, Sql, KeyVault, OperationalInsights, Insights, Consumption | Cloud administrator (register: subscription Contributor) | Hosting subscription ID | All `Registered` | Preflight step "Resource providers registered" |
| H8 | Regional capacity / quota | Preflight what-if; *Subscriptions → Usage + quotas* | Cloud administrator | Region, SKUs (B1 App Service, S0 SQL) | No capacity or quota error | Preflight what-if succeeds |
| H9 | Entra app registration for sign-in | AZURE_SETUP §3 | Entra administrator (Application Administrator) | Tenant; app name | Single tenant; ID tokens; 4 app roles with exact values `FCC.Executive`, `FCC.FinOps`, `FCC.Engineering`, `FCC.Admin`; *Assignment required = Yes* | App roles page lists the 4 values; enterprise app *Properties* shows assignment required |
| H10 | Client secret in Key Vault; redirect URI | DEPLOYMENT step 7 | Entra administrator + temporary Key Vault Secrets Officer | `keyVaultName`, `webAppUrl` | Secret `entra-auth-client-secret` exists; redirect `<webAppUrl>/.auth/login/aad/callback`; temporary Secrets Officer removed | Web app → *Environment variables* shows the Key Vault reference **resolved**; secret expiry date in the operations calendar |
| H11 | User assignments | Enterprise application → *Users and groups* | Entra administrator | D4 list | Each pilot user/group has its FCC role | Sign-in tests A1–A7 |
| H12 | Read-only access per approved subscription | DEPLOYMENT step 8 | Owner / User Access Administrator of each subscription | `webAppPrincipalId`, each approved subscription ID | Reader + Cost Management Reader for the web app identity, nothing else | `az role assignment list --assignee <webAppPrincipalId> --subscription <id> -o table` |
| H13 | Billing visibility | EA portal / *Cost Management + Billing → Billing profile → Policies* | Billing administrator | Agreement type | View charges allowed | D6 evidence; live cost refresh shows *Connected* |
| H14 | Database schema + app identity grant | DEPLOYMENT step 9 | SQL admin group member | `sqlServerFqdn`, `webAppName`, operator IP | `applied:[1]`; grant SELECT lists `db_datareader`, `db_datawriter`; temporary firewall rule **deleted** | `az sql server firewall-rule list --subscription … -g … -s …` shows no `operator-migration` rule |
| H15 | Dependency risk decisions | PILOT_READINESS_REPORT §5a table | Security owner + business sponsor | DEP-2, DEP-3 | Decision, justification, compensating controls, review date, names | Table filled in and committed through a reviewed pull request |

## 4. Role-based runbook

**Security owner + business sponsor**
1. Close D1, D2, D4, D5 and DEP-2/DEP-3 (H15) in writing. Until then: **STOP at G1**.
2. After live acceptance, decide D7 (go / no-go).

**Repository administrator**
1. H1 branch protection; H2 `pilot` environment; H3 variables (the web app name comes after G4).
2. Do not add Azure secrets to GitHub. Do not let one person be both the only operator and the only approver.

**Microsoft Entra administrator**
1. H9 app registration and roles; record the client ID and tenant ID for the parameters file.
2. H4 deployment identity with the federated credential (no secret).
3. After infrastructure: H10 secret and redirect URI; H11 user assignments.

**Cloud / subscription administrator**
1. H6–H8: dedicated tagged resource group, providers, preflight with what-if; hand the what-if to the reviewers (G3).
2. After G3 approval: DEPLOYMENT step 6; give the outputs to the Entra admin, SQL admin and repository admin.
3. H5 Website Contributor for the deployment identity on the web app only.
4. Subscription owners: H12 for each approved subscription (what-if first).

**SQL administrator (member of the SQL admin Entra group)**
1. H14 migrations and grant script, **before** the application is opened to users; delete the temporary firewall rule.

**Deployment operator**
1. Runs `deploy-pilot` from `main` with `confirm = DEPLOY` (G6).
2. Watches the run, records the run URL and commit SHA, and starts live verification (G7).

**Pilot approver (`pilot` environment reviewer)**
1. Approves the `deploy` job only if G0–G5 are GO and the run is for the expected commit on `main`.

## 5. STOP/GO gates

| Gate | GO only when | Evidence |
|---|---|---|
| **G0 Repository** | `ci` is green on the `main` commit to be deployed; `npm run validate:pilot` passes locally; `npm audit --omit=dev --audit-level=high` passes | CI run URL; local output |
| **G1 Approvals** | D1, D2, D4, D5, D6 and DEP-2/DEP-3 decisions recorded (§2) | Signed records; readiness report §5a filled in |
| **G2 Identity and GitHub** | H1–H4 and H9 done and independently verified | Screenshots / read-only `gh` and portal checks |
| **G3 Infrastructure preview** | `npm run preflight:azure` returns GO; the what-if shows only Create (first run) or reviewed Modify lines, no Delete, nothing outside the resource group; reviewed and approved by the cloud administrator **and** one reviewer | Saved `fcc-preflight-what-if.json`, reviewer names |
| **G4 Infrastructure** | `az deployment group create` succeeded; outputs recorded; `webAppUrl` checked against `publicOrigin` (DEPLOYMENT step 6) | Deployment name `fcc-pilot-infra`; outputs |
| **G5 Access and data** | H5, H10, H12, H13, H14 done; Key Vault reference resolved; migrations applied; firewall rule removed | Portal checks; migration output |
| **G6 Application deploy** | `deploy-pilot` run on `main`, approved in the `pilot` environment; all jobs green, including the post-deployment checks (liveness **and** sign-in redirect) | Run URL |
| **G7 Live acceptance** | PILOT_RUNBOOK §2 A1–A17 pass or have an agreed owner; cost reconciles; full workflow with independent verification; isolation holds | Results table in the readiness report; then D7 |

**Rollback criteria (any one means roll back or stop the app):** users can reach pages without signing in; users see another user's restricted records; the admin page shows the wrong database or release; repeated 5xx errors after deployment; data shown for a subscription that is not approved. Procedure: ROLLBACK_AND_RECOVERY §2–§3. Stop the app first if data exposure is suspected.

## 6. Cleanup (end of pilot or abandoned deployment)

Follow ROLLBACK_AND_RECOVERY §9. Key consequences to plan for:
- Key Vault has **purge protection**: after deletion it stays soft-deleted for 90 days, cannot be purged early, and its name cannot be reused during that time (re-deploying with the same `namePrefix` into the same resource group would collide; use a new `namePrefix` or recover the vault).
- Export the audit log and any evidence that must be retained **before** deleting the database. Deleted-database restore is possible only within the retention window, and not after the SQL server itself is deleted.
- Remove the per-subscription Reader / Cost Management Reader assignments, the deployment identity's federated credential and role, and the GitHub variables, so nothing can access Azure on the pilot's behalf afterwards.
