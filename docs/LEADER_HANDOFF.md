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

> **Current status (2026-10-09): locally validated only.**
> - Operator-reported results on Windows (2026-10-09): `npm.cmd run validate:pilot` 19/19 passed, `npm.cmd run validate:demo` 9/9 passed, and `npm.cmd ls` shows no invalid entries.
> - **Not live-Azure-validated.** Entra sign-in, Resource Graph, Cost Management, Advisor and Azure SQL have not been exercised.
> - **Not approved for deployment or production.** `npm audit` reports unresolved vulnerabilities: 14 in the full tree (8 high, 6 moderate) and **5 in production dependencies (1 high, 4 moderate)**. They are neither fixed nor formally risk-accepted. See [PILOT_READINESS_REPORT §5a](PILOT_READINESS_REPORT.md).

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
| Infrastructure templates (Bicep) and CI/CD workflows | **Written and validated** (Bicep build/lint, local CI equivalent). Not deployed; GitHub not yet connected. The CI audit gate fails only on *critical* findings, so it would not stop the current high findings (READINESS §5a) |
| Third-party dependency security | **Open findings, not fixed.** Production: `postcss` 8.4.31 nested in Next.js 15.5.27 (high; included in the deployed package), and `sprintf-js` via the Azure SQL driver (moderate; used at runtime). Build/dev only: `braces` (high) and `postcss-selector-parser` (moderate) via Tailwind CSS and ESLint tooling. `npm audit fix` did not resolve them; the remaining fixes are breaking upgrades |

## 3. Decisions and approvals needed

| # | Decision / approval | Who | Notes |
|---|---|---|---|
| D1 | Approve pilot scope: tenant, **list of approved subscriptions**, pilot users, duration | Business sponsor | ≤ 25 subscriptions |
| D2 | Approve hosting subscription, region, resource group, monthly budget | Azure subscription owner + sponsor | Default sizing: App Service B1, Azure SQL S0 |
| D3 | Approve the **savings-verification policy** (DATA_DICTIONARY §5) and metric definitions | FinOps product owner | Including the 7-day minimum windows; whether one independent FinOps reviewer is enough (current implementation) or a second approver is required; whether engineering owners may reject or defer without FinOps confirmation (currently allowed, and audited) |
| D4 | Approve the role model and named role holders | Sponsor + FinOps owner | Entra app roles |
| D5 | Accept residual risks (SECURITY §6), e.g. public endpoints with Entra-only SQL for the pilot | Security / sponsor | Private networking is a production item |
| D8 | **Formally accept or require remediation of the open dependency vulnerabilities** DEP-1 … DEP-4 (READINESS §5a), above all DEP-1 (high, production). Record decision, justification, compensating controls and review date | Security owner + business sponsor | **Required before any deployment.** No acceptance is recorded today |
| D6 | Confirm billing settings allow cost visibility (EA "AO view charges" / MCA "Azure charges") | Billing administrator | Required for cost data |
| D7 | Go / no-go after the acceptance checklist | Sponsor | PILOT_RUNBOOK §2 |

## 4. Responsibility matrix

| Role | Responsibilities | Needs these permissions |
|---|---|---|
| **Business sponsor / leadership** | D1, D2, D5, D7, D8 (with the security owner); owns pilot acceptance | None in Azure |
| **Security owner** | D5, D8: risk decisions on residual and dependency risks; reviews the readiness report | None in Azure |
| **Git repository administrator** (next phase) | Create the repository; branch protection on `main` (PR required, ≥1 review, CI `ci` required); `pilot` environment with required reviewers; repository variables for OIDC | GitHub org/repo admin |
| **Azure subscription owner / cloud administrator** | Resource group, infrastructure deployment (after what-if), budget; Reader + Cost Management Reader for the app identity on **each** approved subscription | Contributor + User Access Administrator (RG); Owner/UAA on approved subscriptions |
| **Microsoft Entra administrator** | App registration, app roles, client secret (stored in Key Vault), Assignment required = Yes, user and group assignments, SQL admin group, GitHub OIDC identity | Application Administrator |
| **Billing administrator** | D6 | Enterprise Administrator / billing profile owner |
| **Application / deployment engineer** | Parameters, offline validation, migrations, app deployment, smoke tests, operations | Website Contributor; SQL admin group membership |
| **FinOps product owner** | D3; data-quality checks (cost and Advisor reconciliation); verification reviews | FCC FinOps role |
| **Pilot testers** | Execute PILOT_RUNBOOK journeys and record results | FCC roles as assigned |

No single person is assumed to hold all of these permissions.

## 5. Sequence from Git checkout to go/no-go

Git setup is **deferred** for this phase. Steps 1–2 use the delivered folder until the repository exists.

| # | Step | Owner | Guide | Type |
|---|---|---|---|---|
| 1 | Create the repository from the delivered folder; branch protection; CI | Git admin | §7 below | Git |
| 2 | Clean checkout, `npm ci`, `npm run validate:demo`, `npm run validate:pilot` | Engineer | DEPLOYMENT 1–2 | Safe, local |
| 3 | Approvals D1–D6 and **D8 (dependency risk acceptance or remediation; deployment blocked until done)** | Sponsor, security owner, owners | §3, READINESS §5a | Organizational |
| 4 | Entra app registration and roles | Entra admin | AZURE_SETUP §3 | Tenant change |
| 5 | Resource group + **what-if** review | Cloud admin | DEPLOYMENT 5 | Preview |
| 6 | Deploy infrastructure | Cloud admin | DEPLOYMENT 6 | **Creates paid resources** |
| 7 | Store the Entra secret; add the redirect URI | Entra admin | DEPLOYMENT 7 | Change |
| 8 | Read-only access per approved subscription (what-if first) | Subscription owners | DEPLOYMENT 8 | **Grants access** |
| 9 | Database migration + app identity grant | SQL admin group member | DEPLOYMENT 9 | Change |
| 10 | Deploy the application | Engineer / GitHub workflow with approval | DEPLOYMENT 10 | Change |
| 11 | Verify sign-in and roles | Entra admin + testers | RUNBOOK A1–A7 | Live test |
| 12 | Verify live inventory, cost and Advisor | FinOps owner | RUNBOOK A8–A12 | Live test |
| 13 | Verify workflow persistence and audit | Testers | RUNBOOK A13–A14 | Live test |
| 14 | Security and operational smoke tests | Engineer | RUNBOOK A15–A17 | Live test |
| 15 | Record results; decide go/no-go; assign open issues | Sponsor | READINESS §6 | Decision |

## 6. Acceptance criteria (summary)

The pilot is accepted when:
- every RUNBOOK §2 check passes or has an agreed owner and disposition;
- cost totals reconcile with the Azure portal for at least one subscription and month;
- at least one recommendation completes the full workflow, including an independent verification;
- no critical or high issues are open. This includes the dependency findings in READINESS §5a, unless the security owner and sponsor have formally risk-accepted a specific finding (D8). **This criterion is not met today:** one high production finding (DEP-1) and one high build-tool finding (DEP-2) are open.

## 7. Git setup for the next phase (operator commands)

```bash
cd fcc-pilot                      # the delivered folder
git init -b main
git add -A
git status                        # review: no .env files, no *.db, no .next*, no node_modules, no ZIPs
git commit -m "FCC single-organization Azure pilot: Entra auth, Azure connectors, persistence, IaC, docs"
git remote add origin <approved-repository-url>
git push -u origin main           # only after approval
```
Then configure branch protection and the `pilot` environment (AZURE_SETUP §4.3).

## 8. Current risks and blockers

See [PILOT_READINESS_REPORT.md](PILOT_READINESS_REPORT.md) for the release status and the full issue table. The most important open items:
1. **Nothing has been executed against live Azure or Entra yet.** All Azure behaviour is verified only with offline fixtures.
2. **Azure SQL** code path not yet run against a real database (DEPLOYMENT step 9 is the first live gate).
3. Cost Management aggregation column (`Cost` vs `PreTaxCost`) and view-charges settings depend on the billing agreement.
4. **Unresolved dependency vulnerabilities** (READINESS §5a):
   - **Production:** `postcss` 8.4.31 nested in Next.js (**high**). It is included in the deployed package, and whether it runs at runtime is not established; FCC processes no user-supplied CSS.
   - **Production:** `sprintf-js` in the Azure SQL driver (moderate). It is used at runtime; the call sites inspected use fixed format strings.
   - **Build/dev tooling only:** `braces` (high) and `postcss-selector-parser` (moderate).

   `npm audit fix` did not resolve them. The remaining fixes are breaking upgrades (Next.js 16 and others) that need their own tested change. **Formal risk acceptance or remediation is required before deployment (D8).** The earlier description of the PostCSS issue as "build-time only" was inaccurate.
5. Public network endpoints for the pilot (Entra-only SQL); private networking recommended before production.

## 9. Where the evidence is

- Test suites: `tests/` (demo) and `tests/pilot/` (pilot), run with `npm test`.
- End-to-end offline validation: `npm run validate:pilot`. Demo validation: `npm run validate:demo`.
- Change manifest: [CHANGE_MANIFEST.md](CHANGE_MANIFEST.md).
- Readiness report with observed results, including the dependency vulnerability register: [PILOT_READINESS_REPORT.md](PILOT_READINESS_REPORT.md).
