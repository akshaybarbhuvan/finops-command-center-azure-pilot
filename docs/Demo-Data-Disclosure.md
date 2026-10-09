# Demo Data Disclosure

FinOps Command Center — local demo edition · data as of Oct 7, 2026

This document states plainly what in the demo is real, what is illustrative, and what is not connected. Share it with any audience that receives the demo package.

## REAL — working product behavior

- **Application functionality** — every page, filter, sort, search, export and dialog works.
- **Navigation** — every navigation item opens a working page; breadcrumbs and back navigation work.
- **Role behavior** — five synthetic demo accounts (Executive, FinOps, two Engineering owners, Administrator) get different navigation, home pages, permitted actions and row-level visibility. The two engineers are fictional people on the same fictional team.
- **Workflow mechanics** — the recommendation lifecycle (Identified → Validated → Assigned → In Progress → Submitted → Approved → Implemented → Savings Verified → Closed, plus Rejected and Deferred) enforces valid transitions and role permissions, keeps an audit trail and syncs linked tickets.
- **Calculations** — every KPI, chart, insight sentence, report and copilot answer is computed from the underlying records by one shared selector layer.
- **UI** — the complete interface, including accessibility features, exports and print layouts.
- **Demo-state interactions** — changes you make persist in the browser for the session and can be reset to the deterministic seed.

## ILLUSTRATIVE — synthetic, deterministic data

Generated from a fixed seed (`20261007`); identical on every machine and every run. Sized to resemble a large enterprise Azure estate. **Not real data for any organization, including any client named in the header.**

- Cost data (monthly history, daily month-to-date, run-rate, forecasts)
- Savings estimates, verified savings and realized-to-date figures
- Resources, subscriptions, resource groups, SKUs and regions
- Budgets and budget thresholds
- Anomalies, baselines and root causes
- Utilization and technical evidence (labelled “Illustrative evidence”)
- Recommendation quantities, priorities, confidence and SLA status
- Users, teams and business units (fictional names, `@demo.fcc.local` addresses)
- Reservations, savings plans and policy exceptions

“Savings Verified” in the demo records the estimate as realized; in production, verification compares a full post-change billing cycle.

## NOT CONNECTED

- **Live Azure** — no Cost Management, Resource Graph, Advisor, Event Grid or billing APIs are called.
- **Live client environment** — no client tenant, subscription or data source is accessed.
- **Production ticketing** — tickets are created in local demo state only; no ServiceNow, Jira or Azure DevOps calls.
- **Production identity** — the demo login is a simulated local sign-in, not Microsoft Entra ID. Entra ID / SSO is required outside demo mode, where the demo login, account switcher and demo data are not served.

## Copilot

The demo copilot is deterministic: it matches questions to calculations over the demo dataset and cites the records used. It does not call any language model or external service.

## Simulated in this demo
- **Sign-in:** local account picker, not Microsoft Entra ID; available only in demo mode.
- **Ticketing:** a local store named *Local Demo Ticketing*; no external system is contacted.
- **Change approval:** the reference (e.g. *CHG-DEMO-2041*) is recorded locally and marked simulated.
- **Savings verification:** FinOps verification copies the estimate into realized savings; no billing data is read.
- **Data isolation:** enforced in the browser on a role-scoped view of the dataset. The full illustrative dataset is held in browser storage so the demo runs offline. Production enforces isolation on the server.

