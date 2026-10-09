# FinOps Command Center

**Enterprise FinOps Governance & Optimization Platform**

This repository contains **two separate builds of one codebase**:

| Build | What it is | Data | Sign-in |
|---|---|---|---|
| **Azure pilot** (`npm run build:pilot`) | Single-organization pilot for one Microsoft Entra tenant and approved Azure subscriptions | Azure Resource Graph, Cost Management and Advisor → Azure SQL | Microsoft Entra ID (App Service Authentication), four FCC roles |
| **Local demo** (`npm run demo`) | Offline leadership demonstration | Deterministic **synthetic** data in the browser | Simulated local account picker |

A pilot build cannot contain or fall back to demo data or demo sign-in: only `*.pilot.ts(x)` route files are compiled into it.

## Start here (Azure pilot)

1. [docs/LEADER_HANDOFF.md](docs/LEADER_HANDOFF.md) — what is delivered, approvals, responsibilities, sequence to go/no-go
2. [docs/AZURE_SETUP.md](docs/AZURE_SETUP.md) — Entra app registration, roles, minimum Azure permissions, configuration reference
3. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — step-by-step deployment (local validation → preflight/what-if → infra → access → database → app)
   - [docs/DEPLOYMENT_CHECKLIST.md](docs/DEPLOYMENT_CHECKLIST.md) — STOP/GO gates, approvals and the GitHub/Azure settings to configure and verify
4. [docs/SECURITY.md](docs/SECURITY.md) — authentication, authorization, controls, residual risks
5. [docs/OPERATIONS.md](docs/OPERATIONS.md) — refresh, health, troubleshooting, monitoring, backup
6. [docs/ROLLBACK_AND_RECOVERY.md](docs/ROLLBACK_AND_RECOVERY.md) — application, database and infrastructure recovery
7. [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) — every metric's source, formula, currency, period and caveats
8. [docs/PILOT_RUNBOOK.md](docs/PILOT_RUNBOOK.md) — role journeys and acceptance checklist
9. [docs/PILOT_READINESS_REPORT.md](docs/PILOT_READINESS_REPORT.md) — evidence, review findings, release status

Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Changes from the original demo: [docs/CHANGE_MANIFEST.md](docs/CHANGE_MANIFEST.md).

### Pilot quick reference

| Purpose | Command | Effect |
|---|---|---|
| Install | `npm ci` | local |
| Full offline validation (type check, lint, tests, Bicep, pilot build, bundle scan, server smoke tests) | `npm run validate:pilot` | local; set `BICEP_BIN` if `bicep` is not on PATH |
| Tests only | `npm test` (all) · `npm run test:pilot` | local |
| Build the pilot | `npm run build:pilot` → `.next-pilot/standalone` | local |
| Validate the deployment parameters file | `npm run preflight:azure -- --params-only --parameters infra/main.parameters.json` | local |
| Infrastructure preflight (explicit tenant/subscription/resource group, providers, FinThrive guard, what-if) | `npm run preflight:azure -- --tenant … --subscription … --resource-group … --location … --parameters …` | 🔎 reads Azure only; never deploys |
| Deploy the application | GitHub → *Actions → deploy-pilot → Run workflow* on `main`, confirm `DEPLOY`, then approve the `pilot` environment | ⚠️ deploys to the pilot web app |
| Apply database migrations | `npm run db:migrate` | ⚠️ changes the target database |
| One refresh from a workstation | `npm run sync:pilot` | reads Azure with your CLI sign-in; writes the FCC database |
| Local validation database with synthetic fixtures | `FCC_FIXTURES_CONFIRM=local-only FCC_SQLITE_PATH=./.data/pilot-local.db npm run dev:fixtures` | local only; refused on App Service and Azure SQL |

Requirements for the pilot: Node.js 22 LTS (`.nvmrc`), Azure CLI with Bicep for infrastructure work. Pilot settings: `.env.pilot.example` (placeholders only).

---

# Local demo edition

A fully offline, deterministic demo of the FinOps Command Center for senior-leadership and enterprise-client walkthroughs. It shows how an organization moves from Azure spend *visibility* to *accountability*: who owns each saving, where each action stands, and what has actually been realized.

> **LOCAL DEMO • ILLUSTRATIVE DATA.** All cost, savings, resource, budget, anomaly and utilization figures are synthetic. Nothing connects to Azure, a client tenant, a ticketing system or an identity provider. See [docs/Demo-Data-Disclosure.md](docs/Demo-Data-Disclosure.md).

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | **20.9 or later** for the demo (Node 22 LTS recommended; `.nvmrc` = 22; the pilot requires 22) |
| npm | 10+ (ships with Node) |
| Browser | Current Chrome, Edge, Safari or Firefox |
| Internet | Only for `npm install`. The app runs fully offline afterwards. |

No Azure credentials, secrets, Key Vault, Entra ID or Azure DevOps access are needed.

## Install & run

```bash
npm install
npm run dev          # http://localhost:3000 — demo mode by default for local development
```

Recommended for presenting:

```bash
npm run demo         # dev server with APP_MODE=demo forced, telemetry off
npm run demo:prod    # optimized production build served locally in demo mode (fastest page loads)
```

Use another port with `PORT=4000 npm run demo` (PowerShell: `$env:PORT=4000; npm run demo`).

## Before you present

```bash
npm run validate:demo          # full readiness check (≈ 1–2 min)
npm run validate:demo -- --quick
```

Windows: `./scripts/validate-demo.ps1` (or `-Quick`).

The check verifies Node, dependencies, environment, seed-data validation (21 integrity checks), all tests, type check, lint, production build, every route in demo mode, and that **the demo bypass is disabled in pilot mode**. It changes nothing on disk except the `.next` build folder.

## Demo sign-in (local demo only)

Open `http://localhost:3000` → you are sent to **/login**. Pick one of five demo accounts and click **Sign in**. Engineering cards show the account's assigned workload. This is a **simulated local sign-in, not Microsoft Entra ID**; it exists only when `APP_MODE=demo`. There is no auto-login and no role dropdown, and every protected route redirects to `/login` when nobody is signed in.

| Demo account | Demo user | Lands on | Can do |
|---|---|---|---|
| Executive / Leadership | Alex Morgan, CIO | `/overview` | Read-only portfolio, savings drill-down (product → owner → recommendation), export |
| FinOps Practitioner | Jordan Lee, Director Cloud FinOps | `/finops` | Validate, route to owner, prioritize, categorize, tag, share, comment, track, verify and close. **Not** the change approver |
| Engineering Owner | Priya Raman, Principal Engineer (ERP Platform) | `/engineering` | Only recommendations where she is the owner: accept, reject or defer with a reason, create/link ticket, submit plan, record a simulated change approval reference, implement with evidence. Owner of hero REC-2041 once FinOps routes it |
| Engineering Owner (second account) | Marcus Hill, Senior Engineer (ERP Platform) | `/engineering` | Same permissions, different assigned records (41, 27 open). Used to show that one engineer cannot see another's work — see `docs/Access-Control-Demo.md` |
| Administrator | Sam Patel, Platform Administrator | `/admin` | Users, audit, health, portfolio view, reset demo data. No workflow actions |

**Account menu** (your name, top right): identity and role, **Switch demo user**, **Log out** (and **Reset demo data** for Administrator). Logging out ends the session only — workflow changes are kept for the next sign-in.

**Row-level authorization** is central (`src/lib/demo/access.ts`): every page, search, filter option, count, chart, export and detail URL reads a role-scoped dataset. An engineer opening another owner's recommendation gets the same “not available” page as a non-existent ID.

**Bulk actions** (Recommendations, FinOps Workbench, Engineering Work Queue): select rows on the page or *all filtered results*, choose an action, review a per-record compatibility preview, confirm. Each record is re-authorized and audited individually, then a summary shows what applied and what was skipped. FinOps: route, priority, category, tag, comment, share. Engineering: accept, tag, comment, create tickets. Leadership and Administrator: none. Approve, implement and verify are never bulk actions.

## Reset demo data

Workflow changes persist in this browser's `localStorage` (`fcc.demo.v1`); the signed-in account is kept separately (`fcc.demo.session.v1`). To restore the deterministic seed:

- Open **`http://localhost:3000/login?reset=1&focus=1`** — restores the seed, ends any session (it never signs anyone in), turns on Focus mode and shows the login page, or
- Sign in as **Administrator** → **Administration → Reset demo data** (or account menu → **Reset demo data**).

**Storage limits:** state lives only in this browser profile — it is not shared across browsers, devices or private windows, is lost if site data is cleared, and is capped by the browser's per-origin storage quota (the demo state is well under 1 MB). If storage is blocked, the demo still runs but changes last only until refresh.

## Recording the 5-minute executive video

| File | Purpose |
|---|---|
| [docs/5-Minute-Executive-Demo.md](docs/5-Minute-Executive-Demo.md) | 5:00 script, 4:35 backup, storyboard, click path, titles, executive Q&A |
| [docs/5-Minute-Cheat-Sheet.md](docs/5-Minute-Cheat-Sheet.md) | One-page presenter sheet |
| [docs/5-Minute-Recording-Plan.md](docs/5-Minute-Recording-Plan.md) | Browser setup, reset, recording, voiceover, editing |
| [docs/Demo-Fallback.md](docs/Demo-Fallback.md) | Recover in under 10 seconds |
| `docs/demo-script.srt` / `docs/demo-script.txt` | Timed captions and plain voiceover (regenerate with `python3 scripts/video/build-captions.py`) |
| `docs/video/title-card.png`, `end-card.png` | 1920×1080 opening and closing cards (source: `docs/video/cards.html`) |

## Demo walkthrough

The 10-minute script, talk track, key numbers and Q&A are in **[docs/Demo-Guide.md](docs/Demo-Guide.md)**. The hero journey follows recommendation **REC-2041** (SAP HANA rightsizing, $1.08M/yr) from *Validated* to *Savings Verified* across Executive → Engineering → FinOps.

Handy shortcuts: **/** (or Ctrl/⌘ K) global search · **Copilot** button for computed answers · **Focus mode** (expand icon) hides navigation chrome for presenting; **Esc** exits.

## Pages

Executive Overview · FinOps Workbench · Engineering Work Queue · Cost & Spend (incl. Allocation & Showback) · Budgets & Forecast · Anomalies · Optimization (Overview, Compute, Storage, Commitments) · Recommendations (table + lifecycle board) · Recommendation Detail · Savings · Governance · Resources · Tickets · Reports (5 leadership reports, CSV + print/PDF) · Roadmap · Administration.

## Tests & quality gates

```bash
npm test             # Vitest: data validation, lifecycle/hero journey, RBAC, pilot-mode gate, filters, copilot, UI smoke
npm run typecheck
npm run lint         # zero warnings allowed
npm run build
npm run validate:data
```

## Environment variables

Copy `.env.example` to `.env.local` only if you want to change defaults. Nothing is required.

| Variable | Default | Meaning |
|---|---|---|
| `APP_MODE` | `demo` under `next dev`; **`pilot` for any production build** | `demo` enables the simulated local sign-in, synthetic data and local ticketing. `pilot` / `production` render an SSO-required gate and never mount demo features. Unknown values fail closed to `pilot`. |
| `DEMO_CLIENT_LABEL` | `Enterprise Client Demo` | Text shown as “Prepared for …” in the header. Keep generic unless naming the client is approved. |
| `PORT` | `3000` | Port for `npm run demo` / `demo:prod`. |

## Security notes

- No secrets, tokens, credentials or production endpoints anywhere in the repository; `.env*` files are git-ignored.
- **Demo build:** demo mode is resolved at request time on the server. If a *demo build* is started with `APP_MODE=pilot` or `production` (or an unknown value, or unset in a production server), `src/middleware.ts` answers **every** request — pages and `/_next` JavaScript alike — with a static single sign-on notice (HTTP 401), so no demo code, accounts or data are downloaded. The root layout's SSO gate is a second, independent layer (covered by tests and by `validate:demo`). The real Azure pilot is the separate pilot build described at the top of this README.
- No outbound network calls at runtime: no Azure APIs, no ticketing APIs, no fonts/CDNs, telemetry disabled by the demo scripts.
- Demo users are synthetic (`@demo.fcc.local`). No real personal data.
- CSV exports neutralize spreadsheet formula injection. Security headers (nosniff, frame deny, referrer and permissions policies) are set in `next.config.mjs`.

## Project structure

```
src/
  app/                    routes (thin server wrappers + metadata)
  components/
    shell/                app shell, account menu, global search, copilot, attention center, pilot gate
    pages/                page views (Executive Overview, Recommendation Detail, Savings, …)
    recommendations/      grid, quick-view drawer, lifecycle actions, filters
    charts/               spend trend, funnel, waterfall, aging, budget bars, score ring
    data/                 MetricCard, KpiGrid, DataTable, InsightPanel, badges, PageHeader, EmptyState
    ui/                   primitives (Button, Badge, Tabs, Select…), Modal, Drawer, Toasts
  lib/
    demo/                 seed (deterministic generator), org data, selectors (all metrics), workflow,
                          validation, insights, copilot, filters, ticketing client, client store
    rbac.ts, app-mode.ts, format.ts, csv.ts
tests/                    Vitest suites
scripts/                  run-demo.mjs, validate-demo.mjs, validate-demo.ps1
docs/                     Demo guide, data disclosure, leadership one-pager, release notes
```

All metrics are computed by `src/lib/demo/selectors.ts` from the records generated in `src/lib/demo/seed.ts`; no UI component hard-codes a figure.
