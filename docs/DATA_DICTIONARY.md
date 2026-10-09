# Data dictionary and source of truth — Azure pilot

Every figure on a pilot screen comes from one of three origins: an **Azure source** (retrieved by the application identity), a **calculation** over stored data, or a **manual entry** by an authorized user. Nothing is synthetic. Where data is missing the UI shows "No data" / "—", never zero.

Money: stored as integer micro-units (×1,000,000) **per ISO currency**; totals are computed per currency and never added across currencies. Display uses the explicit currency code (e.g. `USD 1,234.56`). Dates are UTC calendar days.

## 1. Cost (Azure Cost Management)

| Item | Source / API | Scope | Basis | Period | Formula | Missing / error behaviour |
|---|---|---|---|---|---|---|
| Daily cost | `POST /subscriptions/{id}/providers/Microsoft.CostManagement/query?api-version=2023-11-01`, `type` = `ActualCost` / `AmortizedCost`, `granularity` = Daily, aggregation `Sum` of `FCC_COST_AGGREGATION_COLUMN` (default `Cost`) | Each approved subscription | Actual = as billed; Amortized = reservation/savings-plan purchases spread over term | First day of previous month → refresh day (UTC) | Rows summed per (day, currency) across pages | Column missing, unknown currency or out-of-window date → run fails (`invalid_response`); previous data kept |
| **Previous month** (Overview, Cost) | `cost_daily` | Approved subscriptions with data | Actual and Amortized shown separately | Calendar month | Σ daily amounts per currency | "Coverage incomplete" if the stored window does not cover the whole month |
| **Current month to date** | `cost_daily` | Same | Same | 1st of month → today | Σ daily amounts per currency | Always labelled "period to date — incomplete" |
| Coverage | `cost_windows` + latest day with data | Per subscription & cost type | — | Window of last complete fetch | Days inside the window, up to the latest day Azure returned data for that cost type, without rows = 0 cost; days after that (Azure lag) and outside the window = no data | Chart gaps = no data |
| Last retrieved | `cost_windows.retrieved_at` | — | — | — | Latest across approved subscriptions | "Never" |

Caveats shown in the UI: Azure cost data is not real-time, and recent days can be restated (FCC re-fetches the window on each refresh). Only subscription-scope charges are included; charges not attributed to an approved subscription (for example some billing-account-level charges) are outside the view. **No forecast** is shown: the forecast API is not connected.

*Pending live validation:* whether `Cost` or `PreTaxCost` is the correct aggregation column for the organization's agreement type (EA vs MCA). The parser accepts either name, and a wrong setting fails visibly, never silently.

## 2. Inventory (Azure Resource Graph)

| Item | Source | Formula / rule |
|---|---|---|
| Resource | `POST /providers/Microsoft.ResourceGraph/resources?api-version=2024-04-01`, query `Resources \| project id, name, type, location, resourceGroup, subscriptionId, kind, skuName = tostring(sku.name), tags \| order by id asc`, one subscription per query, pages of 1,000 (`$skipToken`) | Identity = SHA-256 of the lower-cased full resource ID (never the name) |
| Present resources | `resources.is_present = 1` | Seen in the latest **complete** run for its subscription |
| No longer returned | `is_present = 0` | Not seen in a complete run (deleted, moved to another resource group or subscription, or access lost). Partial runs never mark resources absent |
| Subscription visibility | `ResourceContainers` query | Not visible → run `unauthorized` (Resource Graph returns empty results rather than 403) |
| Limit | `FCC_MAX_RESOURCES` (default 50,000 per subscription) | Exceeded → run `failed` with `limit_exceeded`, no truncation presented as complete |

## 3. Recommendations (Azure Advisor) and FCC workflow

| Field | Origin | Notes |
|---|---|---|
| Source ID | Advisor recommendation ARM ID | Unique key (`source`, SHA-256 of ID). Re-sync updates in place; never duplicates |
| Category, impact, problem, solution, impacted resource, recommendation type, learn-more link, last updated | Advisor | Only `https://` links are kept |
| **Estimated monthly savings** | Advisor `extendedProperties.savingsAmount` + `savingsCurrency` | Recorded only when **both** are present. Microsoft's Advisor sample queries treat `savingsAmount` as monthly |
| **Estimated annual savings** | Advisor `annualSavingsAmount`, else **derived** = monthly × 12 | UI and export label which one applies |
| Source status | FCC | `active`, or `not_returned` when absent from a complete refresh |
| Stage, priority, owner, due date | FCC (manual, FinOps/owner) | Priority defaults from Advisor impact |
| Ticket reference / URL, change approval reference, remediation plan | FCC (manual entry by owner) | Labelled "manually recorded — not verified with an external system" |
| Implementation evidence | FCC (manual, owner) | Summary, implementation date, optional https link |

Workflow stages: `identified → validated → assigned → in_progress → submitted → approved → implemented → verified → closed`, plus `rejected`, `deferred`. Permitted transitions and actors: `src/pilot/workflow/rules.ts` (tested).

## 4. Savings concepts (kept separate, never added together)

| Concept | Definition | Where shown |
|---|---|---|
| Estimated opportunity (open) | Σ Advisor monthly estimate of recommendations in an open stage (`identified` … `implemented`) that Advisor still returns (`source_status = active`), per currency, approved subscriptions only | Overview "Open opportunity — Advisor estimate" |
| Unassigned estimate | … in `identified`, `validated` | Overview |
| Assigned / in-delivery estimate | … in `assigned`, `in_progress`, `submitted`, `approved` | Overview |
| Implemented, awaiting verification | … in `implemented` (still an **estimate**) | Overview |
| **Verified savings** | Σ of the **latest** `verified` decision's measured monthly savings, one per recommendation in stage `verified` or `closed`, per currency | Overview, Verified Savings ledger |
| Not verified | `verifications.decision = 'not_verified'` with reason; contributes nothing | Recommendation detail, ledger |
| Rejected / deferred | Stage; contributes nothing | Pipeline counts |

**Overlap:** Advisor estimates can overlap (rightsizing vs reservations vs savings plans). The Overview warns when more than one open recommendation targets the same resource. Reservation and savings-plan recommendations are usually scoped to a subscription rather than a resource, so they overlap with resource rightsizing **without** triggering that warning. Treat the estimate total as an upper-bound indication, not additive savings.

**Scope:** every portfolio figure (pipeline, verified savings, inventory, lists, exports, cost) is limited to the subscriptions currently in `FCC_AZURE_SUBSCRIPTION_IDS`. Removing a subscription removes its records from all views; the data stays in the database.

## 5. Savings-verification policy (enforced in code)

A FinOps reviewer records a verification on an `implemented` recommendation:

1. **Separation of duties.** The reviewer must hold `FCC.FinOps` and must not be the recommendation owner or the user who submitted the implementation evidence. Administrators and executives cannot verify.
2. **Windows.** A baseline window ending **before** the implementation date, and a post-change window starting **after** it and not ending in the future. Each covers at least **7 days**.
3. **Inputs.** Baseline cost and post-change cost for the affected resource(s) in each window, the ISO currency (must match the recommendation's estimate currency when one exists), the method (`cost_management_before_after`, `invoice_comparison` or `other_documented`), a source evidence reference (e.g. a Cost Management saved view or export), and optional notes.
4. **Formula.** `monthly savings = (baseline cost ÷ baseline days − post cost ÷ post days) × 30.4375`, computed in integer micro-units.
5. **Outcome.** Only a positive result can be recorded as `verified`. Otherwise the reviewer records **not verified** with a reason (e.g. billing window incomplete), and the item stays `implemented`.
6. **Audit.** Reviewer identity, timestamps, windows, amounts, method and reference are stored in `verifications` and `audit_events`. Both are append-only (UPDATE/DELETE denied to the application's database user).

What this does **not** do: FCC does not fetch resource-level cost automatically for verification, and it does not reconcile the entered figures with billing. Verified savings are therefore **FinOps-attested** (the UI says so), with the reviewer accountable for the figures and the source reference. FCC also does not normalize for usage growth, price changes or other confounders; reviewers document those in notes. The FinOps product owner should confirm before go-live whether a single independent reviewer is sufficient, or whether a second approver is required (a future change; see LEADER_HANDOFF.md D3).

## 6. Operational indicators

| Indicator | Definition |
|---|---|
| Connector status per (source, subscription) | `connected` (latest run succeeded within threshold) · `stale` (older than `FCC_STALE_AFTER_HOURS_*`: inventory 26 h, cost 48 h, Advisor 48 h by default) · `partial` · `unauthorized` · `failed_using_cached` (latest failed; earlier data shown with its own timestamp) · `unavailable` (never succeeded) · `running` · `not_run` |
| Overview source status | Worst status across approved subscriptions, with the **oldest** last-success time |
| Last success | Latest run with status `success` or `partial` |
