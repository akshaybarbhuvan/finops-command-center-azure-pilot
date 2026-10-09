# Pilot runbook — role-by-role workflows and acceptance tests

Runs against the **deployed pilot** with real Entra accounts and the approved subscriptions. Every step marked **LIVE** is pending until performed. Offline equivalents run automatically in `npm run validate:pilot` (see the readiness report), and they do not replace these live checks.

Accounts needed: one Executive, two FinOps users (FinOps-A, FinOps-B), two Engineering users (Eng-A, Eng-B), one Administrator, and one user with no FCC role. All are assigned in Entra (AZURE_SETUP §3).

## 1. Role journeys

### Administrator (LIVE)
1. Sign in → lands on **Administration**.
2. *Configuration* shows the approved subscription count, Advisor categories, database = Azure SQL Database, scheduled refresh and deployed release.
3. **Refresh Azure data now** → "Refresh started". Reload after a few minutes. Every source × subscription shows **Connected**, or a status explained in OPERATIONS §2.
4. *Recent refresh runs* lists one run per source and subscription with record counts.
5. *Users seen by FCC* lists signed-in users and their roles. *Audit log* lists `sync.completed`.
6. Open a recommendation: **no workflow buttons** are offered ("No workflow action is available to you").

### Executive (LIVE)
1. Sign in → **Overview**. The data-source panel shows status and the oldest successful refresh per source.
2. *Azure cost*: previous month and current month-to-date, actual and amortized, in the billing currency. The current month is labelled *period to date — incomplete*.
3. *Savings*: verified savings (none at first) shown separately from *Open opportunity — Advisor estimate*, with the overlap note if applicable.
4. **Cost** page: daily chart with gaps only where no data was retrieved. **Resources** page: inventory with full resource IDs.
5. Open `/finops` → "Not available for your role". Opening a recommendation shows no action buttons.

### FinOps (LIVE)
1. Sign in → **FinOps Workbench** with three queues: *To validate*, *To assign*, *Awaiting verification*.
2. Open a recommendation from *To validate* → **Validate opportunity**.
3. **Assign owner** → choose Eng-A (Eng-A must have signed in once) and an optional due date.
4. Recommendations → **Export CSV**: includes the estimate, currency, and whether the annual figure is derived.

### Engineering (LIVE)
1. Eng-A signs in → **My Work** shows only items assigned to Eng-A.
2. Open the item:
   - **Accept work**;
   - **Record ticket reference** (an existing ticket ID; shown as "manually recorded — not verified with an external system");
   - **Submit remediation plan**;
   - **Record change approval reference** (from your change process);
   - after making the change through normal tools, **Submit implementation evidence** (date, summary, optional https link).
3. Eng-B opens the same URL → **Not found** (identical to a non-existent ID). Eng-B's export and lists do not contain it.

### Verification (LIVE)
1. FinOps-A (not the owner) opens the implemented item → **Record savings verification**:
   - baseline window before the implementation date and post-change window after it (each ≥ 7 days);
   - costs from Cost Management cost analysis for the affected resource(s), with currency, method and source reference.
2. Result: stage **Savings verified**. The verification card shows monthly-normalized savings, both windows, method, reviewer and time. The Overview's verified savings increases by that amount.
3. If the billing window is not yet complete: **Record: savings not verified** with a reason. The item stays *Implemented* and no savings are counted.
4. **Close** after verification.

## 2. Acceptance checklist

| # | Check | Action | Expected result | Type | Status |
|---|---|---|---|---|---|
| A1 | Unauthenticated access | Private window → site URL | Redirect to Microsoft sign-in; `/api/recommendations/export` returns 401 | LIVE (offline: ✓ smoke test) | Pending |
| A2 | Other tenant / unassigned user | Sign in with a user not assigned to the app | Entra blocks sign-in; a foreign-tenant principal gets 403 | LIVE (offline: ✓ unit/API tests) | Pending |
| A3 | No FCC role | User with a sign-in but no FCC role (if Assignment required = No in a test) | "No FCC role assigned" page | LIVE | Pending |
| A4 | Executive read-only | Executive tries any workflow action (browser dev tools POST) | 403 | LIVE (offline: ✓) | Pending |
| A5 | FinOps scope | FinOps validates, assigns, verifies; cannot accept or implement on others' items | As described | LIVE (offline: ✓) | Pending |
| A6 | Engineering isolation | Eng-B opens Eng-A's recommendation URL; edits ID in a POST | 404 for both; no details leaked | LIVE (offline: ✓) | Pending |
| A7 | Separation of duties | Eng-A (if also given FinOps) tries to verify own item | 403 "Separation of duties" | LIVE (offline: ✓) | Pending |
| A8 | Inventory scope | Compare resource count for one subscription with Azure portal Resource Graph Explorer (`Resources \| where subscriptionId == '<id>' \| count`) | Equal (allowing for changes between runs) | LIVE | Pending |
| A9 | Cost correctness | Compare previous-month actual cost for one subscription with Azure portal Cost analysis (same scope, month, currency, actual cost) | Equal within rounding | LIVE | Pending |
| A10 | Amortized vs actual | Same comparison with amortized cost view | Equal within rounding | LIVE | Pending |
| A11 | Advisor identity | Pick a recommendation; compare its Advisor ID, impact and savings with the Advisor blade | Identical; no estimate when Advisor shows none | LIVE | Pending |
| A12 | Connector failure | Remove one subscription's Cost Management Reader (test subscription only), refresh | Cost row **Unauthorized**; earlier data still shown with its old timestamp; no fake values | LIVE (offline: ✓) | Pending |
| A13 | Persistence | Complete steps, sign out, sign in, restart the web app | All workflow data present | LIVE (offline: ✓ restart test) | Pending |
| A14 | Verification evidence | Verified item shows windows, amounts, method, source reference, reviewer, time; ledger lists it | Present | LIVE (offline: ✓) | Pending |
| A15 | Secret hygiene | Trigger an error (e.g. invalid action); review the response and Log Analytics | Response has a reference ID only; no tokens or secrets in logs | LIVE (offline: ✓) | Pending |
| A16 | Health and monitoring | `/api/health` 200; Admin health matches the latest runs; logs in Log Analytics | As described | LIVE | Pending |
| A17 | Azure SQL path | DEPLOYMENT step 9 migration + grant script; app pages load | Success | LIVE | **Pending — highest priority** |

Record results (date, tester, screenshot or log reference) in PILOT_READINESS_REPORT.md §6.

## 3. Failure handling during the pilot

- Wrong or stale numbers: check Administration → connector health first. Never correct figures manually in the database.
- Mistaken workflow step: there is no "undo" by design. Record a comment, and use the available transitions (for example, defer or reject with a reason). The audit trail keeps the history.
- Suspected access problem: stop and escalate (ROLLBACK_AND_RECOVERY §8).
