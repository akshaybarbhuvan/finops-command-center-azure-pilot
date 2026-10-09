# Leader handoff — FinOps Command Center, single-organization Azure pilot

**Start here.** This page explains what has been built, what is genuinely connected to Azure, what still needs approval, and how to get from this delivery to a go/no-go decision. Supporting detail:
- [ARCHITECTURE](ARCHITECTURE.md)
- [AZURE_SETUP](AZURE_SETUP.md)
- [DEPLOYMENT](DEPLOYMENT.md)
- [SECURITY](SECURITY.md)
- [OPERATIONS](OPERATIONS.md)
- [ROLLBACK_AND_RECOVERY](ROLLBACK_AND_RECOVERY.md)
- [DATA_DICTIONARY](DATA_DICTIONARY.md)
- [PILOT_RUNBOOK](PILOT_RUNBOOK.md)
- [PILOT_READINESS_REPORT](PILOT_READINESS_REPORT.md)
- [DEPLOYMENT_CHECKLIST](DEPLOYMENT_CHECKLIST.md): STOP/GO gates and the human-action checklist for the deployment

> **Current status (2026-10-09): READY AFTER PREREQUISITES. Not deployed, not live-Azure-validated, not approved.**
> - Offline validation passes locally and in GitHub Actions (`ci` green on `main`): `validate:pilot` 19/19, `validate:demo` 9/9.
> - **Production dependencies: no high or critical advisories** (DEP-1 and DEP-4 remediated). Two findings have no patched release and need a recorded decision: DEP-2 (`braces`, high, build tooling only) and DEP-3 (`sprintf-js`, moderate, production; not reachable per the call-site review). See [PILOT_READINESS_REPORT §5a](PILOT_READINESS_REPORT.md).
> - **Not live-Azure-validated.** Entra sign-in, Resource Graph, Cost Management, Advisor and Azure SQL have not been exercised. The `deploy-pilot` workflow has never run.
> - **External settings are not configured or verified**: branch protection, the `pilot` environment, the GitHub variables, the OIDC identity, Entra registration, and Azure access ([DEPLOYMENT_CHECKLIST §3](DEPLOYMENT_CHECKLIST.md)).

## 1. What the pilot delivers

A secure web application for **one organization** (one Microsoft Entra tenant) that reads the organization's **approved Azure subscriptions** and turns Azure Advisor cost recommendations into an accountable, auditable workflow:

- **Visibility.** Actual and amortized cost (Azure Cost Management), resource inventory (Azure Resource Graph), and cost recommendations (Azure Advisor), each with its source, currency, period and freshness.
- **Accountability.** FinOps validates and assigns each opportunity to a named engineering owner.
- **Execution traceability.** The owner records their own ticket and change-approval references, plan and implementation evidence.
- **Realized value.** A FinOps reviewer who is not the owner records a measured before/after verification. Only verified results count as savings; estimates stay labelled as estimates.

The existing local demonstration (synthetic data) is preserved unchanged as a separate build for presentations.

## 2. What is implemented, connected or manual

| Area | Status |
|---|---|
| Entra sign-in (App Service Authentication), 4 roles via Entra app roles, server-side authorization, record-level isolation, separation of duties | **Implemented; tested offline.** Live sign-in pending |
| Azure Resource Graph inventory | **Implemented; tested offline with fixtures.** Live connection pending |
| Azure Cost Management actual + amortized daily cost (previous month + month to date) | **Implemented; tested offline.** Live connection and EA/MCA column confirmation pending |
| Azure Advisor cost recommendations with source identity and estimates (only when Advisor provides them) | **Implemented; tested offline.** Live connection pending |
| Workflow, evidence, verification, audit **stored in Azure SQL** | **Implemented.** Tested on SQLite with the same code; **Azure SQL execution pending** |
| Scheduled and manual refresh with health, freshness and failure reporting | **Implemented; tested offline** |
| Ticket IDs, change approval references, verification amounts | **Manually recorded** by authorized users and labelled as such. No external system is queried |
| Forecasts, budgets, anomalies, governance score, commitments, packaged reports | **Not connected in the pilot.** Pages say so; no synthetic numbers |
| Any change to customer Azure resources | **Not implemented by design.** The application identity is read-only |
| Infrastructure templates (Bicep) and CI/CD workflows | **Written and validated offline** (Bicep build/lint; `ci` green on GitHub). The application deployment workflow (`deploy-pilot`) is gated (confirmation, `main` only, `pilot` environment approval, configuration and target checks) but **has never run**. Infrastructure, Entra, subscription access and database steps are operator-run (DEPLOYMENT.md). CI fails on high/critical production advisories |
| Third-party dependency security | **Production: no high/critical findings.** `postcss` in Next.js (DEP-1) and `postcss-selector-parser` (DEP-4) were remediated with scoped npm overrides. **Open, no patched release exists:** `sprintf-js` via the Azure SQL driver (DEP-3, moderate, production; call-site review found no reachable path) and `braces` via Tailwind CSS/ESLint tooling (DEP-2, high, build only). Both need a recorded decision (D8) |

## 3. Decisions and approvals needed

| # | Decision / approval | Who | Notes |
|---|---|---|---|
| D1 | Approve pilot scope: tenant, **list of approved subscriptions**, pilot users, duration | Business sponsor | ≤ 25 subscriptions |
| D2 | Approve hosting subscription, region, resource group, monthly budget | Azure subscription owner + sponsor | Default sizing: App Service B1, Azure SQL S0 |
| D3 | Approve the **savings-verification policy** (DATA_DICTIONARY §5) and metric definitions | FinOps product owner | Including the 7-day minimum windows; whether one independent FinOps reviewer is enough (current implementation) or a second approver is required; whether engineering owners may reject or defer without FinOps confirmation (currently allowed, and audited) |
| D4 | Approve the role model and named role holders | Sponsor + FinOps owner | Entra app roles |
| D5 | Accept residual risks (SECURITY §6), e.g. public endpoints with Entra-only SQL for the pilot | Security / sponsor | Private networking is a production item |
| D8 | **Decide on the two open dependency findings** DEP-2 (high, build tooling only) and DEP-3 (moderate, production; not reachable). DEP-1 and DEP-4 are remediated. Record decision, justification, compensating controls and review date (READINESS §5a) | Security owner + business sponsor | **Required before any deployment.** No decision is recorded today |
| D6 | Confirm billing settings allow cost visibility (EA "AO view charges" / MCA "Azure charges") | Billing administrator | Required for cost data |
| D7 | Go / no-go after the acceptance checklist | Sponsor | PILOT_RUNBOOK §2 |

## 4. Responsibility matrix

| Role | Responsibilities | Needs these permissions |
|---|---|---|
| **Business sponsor / leadership** | D1, D2, D5, D7, D8 (with the security owner); owns pilot acceptance | None in Azure |
| **Security owner** | D5, D8: risk decisions on residual and dependency risks; reviews the readiness report | None in Azure |
| **Repository administrator** | Branch protection on `main` (PR required, ≥1 review, `ci` checks required); `pilot` environment with required reviewers and `main`-only deployments; the five deployment variables (DEPLOYMENT_CHECKLIST H1–H3) | GitHub repository admin |
| **Azure subscription owner / cloud administrator** | Resource group, infrastructure deployment (after what-if), budget; Reader + Cost Management Reader for the app identity on **each** approved subscription | Contributor + User Access Administrator (RG); Owner/UAA on approved subscriptions |
| **Microsoft Entra administrator** | App registration, app roles, client secret (stored in Key Vault), Assignment required = Yes, user and group assignments, SQL admin group, GitHub OIDC identity | Application Administrator |
| **Billing administrator** | D6 | Enterprise Administrator / billing profile owner |
| **Application / deployment engineer (deployment operator)** | Parameters, offline validation, read-only preflight, runs `deploy-pilot`, smoke tests, operations | None for the workflow run itself (the OIDC identity deploys); Website Contributor only for the workstation fallback |
| **Pilot approver** (`pilot` environment reviewer) | Approves the `deploy` job only when gates G0–G5 are GO | GitHub environment reviewer |
| **SQL administrator** | Migrations and the app identity grant (DEPLOYMENT step 9) | SQL admin Entra group member; temporary firewall rule |
| **FinOps product owner** | D3; data-quality checks (cost and Advisor reconciliation); verification reviews | FCC FinOps role |
| **Pilot testers** | Execute PILOT_RUNBOOK journeys and record results | FCC roles as assigned |

No single person is assumed to hold all of these permissions.

## 5. Sequence from checkout to go/no-go

Gates G0–G7 and the evidence for each are in [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) §5.

| # | Step | Owner | Guide | Type | Gate |
|---|---|---|---|---|---|
| 1 | Clean checkout of `main`, `npm ci`, `npm run validate:demo`, `npm run validate:pilot`, production audit | Engineer | DEPLOYMENT 1–2 | Safe, local | G0 |
| 2 | Approvals D1–D6 and **D8 (DEP-2/DEP-3 decisions; deployment blocked until done)** | Sponsor, security owner, owners | §3, READINESS §5a | Organizational | G1 |
| 3 | Branch protection, `pilot` environment, OIDC identity, Entra app registration and roles | Repository admin, Entra admin | DEPLOYMENT_CHECKLIST H1–H4, H9 | GitHub / tenant change | G2 |
| 4 | Tagged resource group + read-only `preflight:azure` (what-if) and human review | Cloud admin + reviewer | DEPLOYMENT 5 | Preview | G3 |
| 5 | Deploy infrastructure | Cloud admin | DEPLOYMENT 6 | **Creates paid resources** | G4 |
| 6 | Store the Entra secret; add the redirect URI; Website Contributor for the deployment identity; GitHub variables | Entra admin, cloud admin, repository admin | DEPLOYMENT 7, 10 | Change | G5 |
| 7 | Read-only access per approved subscription (what-if first) | Subscription owners | DEPLOYMENT 8 | **Grants access** | G5 |
| 8 | Database migration + app identity grant | SQL admin group member | DEPLOYMENT 9 | Change | G5 |
| 9 | Run `deploy-pilot` (confirm `DEPLOY`), approve in the `pilot` environment | Deployment operator + pilot approver | DEPLOYMENT 11 | Change | G6 |
| 10 | Verify sign-in and roles | Entra admin + testers | RUNBOOK A1–A7 | Live test | G7 |
| 11 | Verify live inventory, cost and Advisor | FinOps owner | RUNBOOK A8–A12 | Live test | G7 |
| 12 | Verify workflow persistence and audit | Testers | RUNBOOK A13–A14 | Live test | G7 |
| 13 | Security and operational smoke tests | Engineer | RUNBOOK A15–A17 | Live test | G7 |
| 14 | Record results; decide go/no-go; assign open issues | Sponsor | READINESS §6 | Decision | D7 |

## 6. Acceptance criteria (summary)

The pilot is accepted when:
- every RUNBOOK §2 check passes or has an agreed owner and disposition;
- cost totals reconcile with the Azure portal for at least one subscription and month;
- at least one recommendation completes the full workflow, including an independent verification;
- no critical or high issues are open. This includes the dependency findings in READINESS §5a, unless the security owner and sponsor have formally decided on a specific finding (D8). **This criterion is not met today:** the high build-tool finding DEP-2 is open pending decision (production dependencies have no high or critical findings).

## 7. Repository settings

The code is in `akshaybarbhuvan/finops-command-center-azure-pilot`. The settings the repository cannot configure itself are listed, with how to verify each, in [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) §3 (H1–H5): `main` branch protection, the `pilot` environment (required reviewers, `main` only), the five deployment variables, and the OIDC federated credential. As of this writing, `main` is **not protected** and none of these settings has been verified.

## 8. Current risks and blockers

See [PILOT_READINESS_REPORT.md](PILOT_READINESS_REPORT.md) for the release status and the full issue table. The most important open items:
1. **Nothing has been executed against live Azure or Entra yet.** All Azure behaviour is verified only with offline fixtures.
2. **Azure SQL** code path not yet run against a real database (DEPLOYMENT step 9 is the first live gate).
3. Cost Management aggregation column (`Cost` vs `PreTaxCost`) and view-charges settings depend on the billing agreement.
4. **Dependency findings without a patched release** (READINESS §5a): DEP-2 `braces` (high, build tooling only, not deployed) and DEP-3 `sprintf-js` (moderate, production; all 12 driver call sites use fixed format strings, so not reachable). **A recorded decision is required before deployment (D8).** DEP-1 and DEP-4 are remediated. The earlier description of the PostCSS issue as "build-time only" was inaccurate and has been removed from CI.
5. **External settings unverified** (DEPLOYMENT_CHECKLIST §3) and **`deploy-pilot` never run**: the first run is itself a test of the OIDC federation and the environment configuration.
6. Public network endpoints for the pilot (Entra-only SQL); private networking recommended before production.

## 9. Where the evidence is

- Test suites: `tests/` (demo) and `tests/pilot/` (pilot), run with `npm test`.
- End-to-end offline validation: `npm run validate:pilot`. Demo validation: `npm run validate:demo`.
- Change manifest: [CHANGE_MANIFEST.md](CHANGE_MANIFEST.md).
- Readiness report with observed results, including the dependency vulnerability register: [PILOT_READINESS_REPORT.md](PILOT_READINESS_REPORT.md).
