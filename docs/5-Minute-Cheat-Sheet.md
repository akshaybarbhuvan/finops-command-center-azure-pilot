# 5-Minute Demo — Presenter Cheat Sheet

**Start:** `http://localhost:3000/login?reset=1&focus=1`. This restores the seed, signs nobody in, turns on Focus mode and opens the login page. Banner: LOCAL DEMO | ILLUSTRATIVE DATA.

**Sign in:** account card → **Sign in**. **Log out:** your name (top right) → **Log out**. Data is kept between sign-ins.

## Run of show (5:00 · narration 404 words ≈ 2:53 · 46 s silent sign-in/log out)
| Time | Sign in as | Do (exact labels) | Expect |
|---|---|---|---|
| 00:05–00:32 | — | Speak, then **Executive / Leadership** → **Sign in** | Login page, five accounts |
| 00:32–01:05 | Executive / Leadership | Hover **Month-end forecast**, **Savings opportunity**, **Savings realized**, the *57%* insight | $12.2M · $19.3M · $2.76M · 57% / $8.29M unowned |
| 01:05–01:35 | Executive / Leadership | **Savings drill-down** → **SAP S/4HANA** → **Unassigned** → **Log out** | REC-2041 first · $1.08M est. · No ticket |
| 01:35–02:15 | **FinOps Practitioner** | **/** 2041 Enter → **Route to owner** (Priya pre-selected) → **Route to owner** → **Audit** → **Log out** | Stage *Assigned*, owner Priya Raman |
| 02:15–03:30 | **Engineering Owner** (Priya) | **Ready for you** → **REC-2041** → **Accept & start work** → **Create or link ticket** → **Submit for change approval** → **Record change approval** → **Mark implemented & submit for verification** → **Log out** | Ticket **FCC-1365**; reference **CHG-DEMO-2041** (simulated); stage *Implemented* |
| 03:30–03:58 | **FinOps Practitioner** | **/** 2041 Enter → **Verify savings** → **Verify savings** → **Log out** | Stage **Savings Verified** |
| 03:58–04:30 | **Executive / Leadership** | Hover **Savings realized** → drill **SAP S/4HANA** → **Priya Raman** → click **REC-2041** | **$3.85M**; row *Savings Verified · Ticket FCC-1365 · $1.08M verified* |
| 04:30–04:55 | Executive / Leadership | Closing statement, no clicks | — |

Every action opens a dialog: confirm with the same label. For REC-2041 the plan, reference and evidence fields are pre-filled.

## Who does what (say it this way)
- **FinOps** routes, prioritizes, tracks and **verifies**. It is **not** the change approver.
- **Engineering owner** accepts, tickets, plans, records the change approval reference from their own change process, and submits evidence. Each engineer sees **only their own items**.
- **Leadership** is read-only, with drill-down and export.
- **Admin** manages users, audit, health and reset. Admin has no workflow actions.

## Numbers (illustrative)
| | Start | After |
|---|---|---|
| Savings realized | **$2.76M/yr** | **$3.85M/yr** |
| Open opportunity | $19.3M · $8.29M unowned (57% owned) | $18.2M · $7.21M unowned (60%) |
| Value at SLA risk | $4.08M | $3.00M |

**Hero:** REC-2041, rightsize SAP HANA scale set · **$1.08M/yr** · Critical · Validated, unassigned · SLA in 6 days · owner Priya Raman (ERP Platform).

## Close (say verbatim)
> That is the process: find the highest-value opportunities, assign clear accountability, let engineering deliver through its own change process, and count savings only once they are verified. The figures today are illustrative; the operating model is what we would take into a pilot.

## Never say
- “live data” — say **“illustrative”**
- “real Entra login” — say **“simulated sign-in”**
- “we saved $1.08M” — say **“within the demonstration workflow”**

## Fallback (< 10 s)
- **Wrong state:** load `/login?reset=1&focus=1`, then re-enter using `Demo-Fallback.md`.
- **Action disabled with “Performed by …”:** you're on the wrong account. Your name → **Switch demo user**.
- **REC-2041 not in Priya's queue:** FinOps hasn't routed it yet.
- **Lost REC-2041:** press **/**, type **2041**, press Enter.

**Access-control demo (separate, 60–90 s):** `Access-Control-Demo.md`. Sign in as **Engineering Owner (second account)** (Marcus Hill); REC-2041 is not reachable from his account.
