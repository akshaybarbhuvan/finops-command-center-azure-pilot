# FinOps Command Center — Leadership Demo Guide

> For the recorded **5-minute executive video**, use `docs/5-Minute-Executive-Demo.md`, `docs/5-Minute-Cheat-Sheet.md` and `docs/5-Minute-Recording-Plan.md`. This guide covers the longer live walkthrough.

Local demo edition · illustrative data as of **Oct 7, 2026** · audience: CIO, CTO, CFO, VP Infrastructure, FinOps, Engineering and Architecture leadership.

> Ground rule for the presenter: every number on screen is **illustrative demo data**. Say “in this demo environment” or “illustrative”. Never call it live or client data.

---

## 0. Setup checklist (10 minutes before)

1. `npm run validate:demo` → must end with **READY**.
2. `npm run demo:prod` (fastest) or `npm run demo`. Open `http://localhost:3000`.
3. Open `http://localhost:3000/login?reset=1&focus=1` so the story starts from the seed. Nobody is signed in after a reset.
4. Browser zoom 100–110%, 1440×900 or larger. Close other tabs.
5. Optional: click **Focus mode** (expand icon) to hide the sidebar while presenting; **Esc** exits.

## 1. Key numbers to know

| Theme | Number (seed state) | Where |
|---|---|---|
| Monthly run-rate | **$12.2M/mo** (≈ $146M annualized) | Executive Overview, Cost & Spend |
| Month-to-date | **$2.76M**, −2.9% vs Sep 1–7 | Executive Overview |
| Month-end forecast vs budget | **$12.2M** vs **$12.3M** budget (−$85K, −0.7%) — but **6 subscriptions forecast over budget**, led by ml-platform-prod (+$159K) | Budgets & Forecast |
| Open savings opportunity | **$19.3M/yr** across **549** open recommendations | Executive Overview |
| Realized savings | **$2.76M/yr** verified (106 recs); **$988K** cash realized YTD | Savings |
| Accountability gap | **57%** of open savings owned; **$8.29M/yr unowned** | Executive Overview insights |
| At risk | **$4.08M/yr** past SLA or due within 7 days; 6 past SLA | Open Actions KPI |
| Decisions | **56** changes awaiting approval | Decisions required |
| Governance | Score **80/100** (Fair); **$752K/mo** unallocated; tagging 87.8% | Governance |
| Commitments | Coverage **54.5%**, utilization **88.6%** | Optimization → Commitments |
| Anomalies | **7** open, **$421K** est. 30-day impact | Anomalies |
| Hero item | **REC-2041** SAP HANA rightsizing — **$90,216/mo · $1,082,592/yr**, 91% confidence, Critical, SLA due Oct 13 (6 days), **no owner** | Top 10 opportunities #1 |
| After the hero journey | Realized **$2.76M → $3.85M/yr**; open opportunity **$19.3M → $18.2M** | Executive Overview |

## 2. The 30-second opening

> “Most organizations can tell you what they spend in the cloud. Far fewer can tell you who is accountable for reducing it, what has been approved, and what has actually landed in the bill. The FinOps Command Center is the governance layer that closes that gap — from visibility, to ownership, to verified savings. What you’ll see runs locally on illustrative data, but every number is calculated, every workflow is real, and every role sees exactly what it needs.”

## 3. The 2-minute executive story

Signed in as **Executive / Leadership**, Executive Overview only.

1. **Spend** — “We’re running at $12.2M a month. October is forecast slightly under budget overall — but six subscriptions are over, with ML and data platforms driving it.” *(point at Budget Variance KPI, then the first insight)*
2. **Opportunity** — “There’s $19.3M a year in open savings. Compute is the bulk.” *(Savings Opportunity KPI, category chart)*
3. **Accountability** — “Only 57% of it has an owner. $8.3M has nobody accountable — that’s the real problem.” *(third insight)*
4. **Realized** — “$2.76M a year is already verified against billing — not estimated, verified.” *(Savings Realized KPI)*
5. **Decisions** — “And here is what needs leadership: the single largest item, $1.08M a year, has no owner and its SLA is due in six days.” *(Decisions required → REC-2041)*

## 4. The 5-minute product walkthrough

Use `docs/5-Minute-Executive-Demo.md` — five sign-ins (Executive → FinOps → Engineering → FinOps → Executive), each ending with **Log out**. For the separate 60–90 s access-control check with the second engineer (Marcus Hill), use `docs/Access-Control-Demo.md`.

## 5. The 10-minute full demo (hero journey)

Sign in on `/login` (account card → **Sign in**); log out from the account menu (your name, top right). Logging out keeps the workflow state.

| Step | Account | Clicks | Talk track |
|---|---|---|---|
| 1. Sign in | Executive / Leadership | Login page → **Sign in** | “A simulated local sign-in for this demo. Pilot and production use enterprise single sign-on; this page does not exist there.” |
| 2. Executive dashboard | Executive | (lands on Executive Overview) | Spend, forecast vs budget, opportunity, realized, open actions. Read one insight aloud. |
| 3. Drill-down | Executive | **Savings drill-down** → **SAP S/4HANA** → **Unassigned** → REC-2041 | “Product, owner, recommendation — read-only, estimated and verified always separate.” Log out. |
| 4. Route | FinOps Practitioner | **/** 2041 → **Route to owner** → Priya Raman | “FinOps routes and tracks. It is not the change approver.” Optional: select several rows on **Recommendations** → **Bulk actions** → *Set priority* → preview → confirm. Log out. |
| 5. Accept + ticket | Engineering Owner | Work queue → **REC-2041** → **Accept & start work** → **Create or link ticket** | “Priya only sees her own items. The ticket is in local demo ticketing; in production it would be ServiceNow, Jira or Azure DevOps.” |
| 6. Plan + change approval | Engineering Owner | **Submit for change approval** (plan pre-filled) → **Record change approval** (*CHG-DEMO-2041*) | “Change approval belongs to the owner's change process; the reference here is simulated.” |
| 7. Implement | Engineering Owner | **Mark implemented & submit for verification** (evidence pre-filled) | “Evidence goes on the record and the item goes to FinOps.” Log out. |
| 8. Verify | FinOps Practitioner | **/** 2041 → **Verify savings** | “Verified against billing — simulated in this demo; the dialog says so.” Log out. |
| 9. Savings pipeline | Executive / Leadership | **Savings**, then Overview **Savings drill-down** → **SAP S/4HANA** → **Priya Raman** | “Realized moved from $2.76M to $3.85M a year; the open pipeline dropped by the same amount.” |
| 10. Leadership reports | Executive / Leadership | **Reports** → Executive FinOps Summary → **Export CSV** or **Print / Save as PDF** | “One-page leadership summary from the same data.” |

Optional: **Access-control check** — sign in as **Engineering Owner (second account)**; REC-2041 is not reachable (`docs/Access-Control-Demo.md`). Other extras if time allows: **Copilot** → “What decisions need my attention?” · **Governance** → click *Unallocated spend* for drill-down · **Optimization → Commitments** · **Administration** (Administrator account) → health, audit log showing every step you just performed.

## 6. Key business messages

1. **Visibility is not accountability.** Every opportunity has an owner, an SLA, a ticket and an audit trail.
2. **Potential ≠ realized.** Savings count only after verification against billing.
3. **One source of truth.** Executive, FinOps and Engineering see the same numbers from the same records.
4. **Leadership time goes to decisions**, not data gathering: *Decisions required*, the attention center and the insights tell executives what to act on.
5. **Built for enterprise operating models:** role-based views, swappable ticketing, pilot/production modes with SSO.

## 7. Likely questions & answers

### Leadership (CIO / CFO / CTO)
- **Is this our data?** No. It is an illustrative dataset sized like a large enterprise Azure estate. Connecting to your Cost Management exports and Resource Graph is the pilot step.
- **How credible are the savings numbers?** Each recommendation carries evidence, a confidence score and a risk rating. Potential and realized are tracked separately, and realized savings require FinOps verification.
- **What decisions do you need from us?** Ownership for unowned high-value items, approval of submitted changes, and budget actions on subscriptions forecast over budget.
- **What is the ROI?** We don’t quote ROI from demo data. The pilot is designed to measure realized savings against your own billing.

### FinOps
- **How is the forecast calculated?** Month-to-date actuals plus remaining days at the current run-rate; verified savings in the session reduce the run-rate.
- **How are recommendations prioritized?** By annualized savings (Critical ≥ $250K, High ≥ $60K, Medium ≥ $12K), with SLA 30/45/60/90 days.
- **Commitments?** Coverage and utilization are computed from reservation records against eligible steady-state production compute; rightsizing candidates are excluded from commitment sizing to avoid double counting.
- **Showback/chargeback?** Allocation & Showback views by business unit, application, cost center, subscription, environment and team. No accounting-system integration is claimed.

### Architecture / CloudOps / Security
- **Is anything connected to Azure?** No. Demo mode makes zero external calls and needs no credentials.
- **How is demo access prevented in production?** `APP_MODE` is evaluated on the server per request. In `pilot`/`production`, the app renders an SSO gate on every route, including `/login`, and never mounts the demo sign-in, account switcher or demo data; unknown values fail closed. Tests and `validate:demo` verify this.
- **Ticketing?** A swappable `TicketingClient` interface; the demo ships only the local implementation.
- **Is the Copilot generative?** In the demo it is deterministic: it maps questions to the same calculations behind the dashboards and links to the records it used.
- **Stack?** Next.js + TypeScript + Tailwind, Recharts; a deterministic seeded dataset; Vitest suites.

## 8. Fallback paths

| Problem | Recovery |
|---|---|
| Action disabled with “Performed by …” | You are signed in as the wrong account. Account menu → **Switch demo user** → the role named. |
| State got messy mid-demo | Open `/login?reset=1&focus=1` (seed restored, signed out). |
| Can’t find REC-2041 | Press **/** and type `2041`, or open `/recommendations/REC-2041`. |
| A page looks blank or stuck | Refresh the browser — state persists in the session. |
| Dev server slow on first click | Use `npm run demo:prod` for presentations (pre-compiled). |
| Port 3000 in use | `PORT=4000 npm run demo` |
| Laptop offline | Fine — the demo needs no network after `npm install`. |
