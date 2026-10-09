# FinOps Command Center — 5-Minute Executive Demo

Presenter script · local demo edition · **illustrative data** as of Oct 7, 2026

**Start URL:** `http://localhost:3000/login?reset=1&focus=1` restores the seed data, signs nobody in, turns on Focus mode and opens the login page. REC-2041 starts **Validated, unassigned**.

**Honesty line, used once in the opening:** this is a local demonstration on synthetic data. Sign-in, ticketing, change approval and savings verification are all simulated.

**Operating model shown:**
- FinOps routes, prioritizes, tracks and verifies.
- The engineering owner accepts the work, tickets it, plans it, records the change approval reference from their own change process, and submits implementation evidence.
- Leadership is read-only.
- FinOps is **not** the technical change approver.

## A. Run of show (5:00)

| # | Time | Duration | Signed in as | Scene | Words | Spoken | Silent clicks |
|---|---|---|---|---|---|---|---|
| — | 00:00–00:05 | 5 s | — | Title card (recording only) | — | — | — |
| 1 | 00:05–00:32 | 27 s | Signed out | Opening | 48 | 21 s | 4 s |
| 2 | 00:32–01:05 | 33 s | Executive / Leadership | Executive Overview | 61 | 26 s | 1 s |
| 3 | 01:05–01:35 | 30 s | Executive / Leadership | Opportunity and drill-down | 43 | 18 s | 5 s |
| 4 | 01:35–02:15 | 40 s | FinOps Practitioner | FinOps assigns an owner | 43 | 18 s | 10 s |
| 5 | 02:15–03:30 | 75 s | Engineering Owner | Engineering execution | 84 | 36 s | 10 s |
| 6 | 03:30–03:58 | 28 s | FinOps Practitioner | FinOps verification | 33 | 14 s | 10 s |
| 7 | 03:58–04:30 | 32 s | Executive / Leadership | Executive outcome | 49 | 21 s | 5 s |
| 8 | 04:30–04:55 | 25 s | Executive / Leadership | Close | 43 | 18 s | 1 s |
| — | 04:55–05:00 | 5 s | — | End card (recording only) | — | — | — |

**Timing basis:** 140 words per minute.

| | |
|---|---|
| Spoken words | **404** |
| Estimated narration | **2:53** |
| Silent interaction (sign-in, log out, dialogs) | **46 s** |
| Planned clicks overall | ≈ 119 s, most of it while speaking |
| Title and end cards | 10 s |
| Buffer for page loads and pauses | ≈ 71 s |

The total is 5:00 only if each scene stays inside its window. Rehearse with a stopwatch: if a scene overruns, the **Executive outcome** drill-down is the first thing to shorten.

## B. Word-for-word presenter script

Clicks marked *silently* are done without speaking (these are the silent seconds in each scene's timing). All other clicks happen while you talk.

### Scene 1 — Opening · 00:05–00:32 (27 s)

| | |
|---|---|
| **Sign in as** | Signed out |
| **Page / route** | `/login` (opened from the start URL) |
| **Actions** | Speak first with the cursor resting on the banner. Then, silently: click the **Executive / Leadership** card → click **Sign in**. |
| **Expected on screen** | Login page: *FinOps Command Center*, *Enterprise FinOps Governance & Optimization*, banner **LOCAL DEMO | ILLUSTRATIVE DATA**, five account cards (the two engineering cards show *Assigned workload*), note *Simulated local sign-in … not Microsoft Entra ID*. After **Sign in**: Executive Overview at `/overview`. |
| **If it goes wrong** | An app page opens instead of the login page → someone is still signed in: your name (top right) → **Log out**. Anything else odd → reload the start URL. |
| **Timing** | 48 words ≈ 21 s spoken · 4 s silent (sign-in/log out) · ≈ 4 s of clicks, mostly while speaking |

**Say:**

> Most organizations can tell you what they spend in the cloud. Far fewer can show who is accountable for reducing it, and how much of that reduction is real. That is what FinOps Command Center does. This is a local demonstration on illustrative data, with a simulated sign-in.

### Scene 2 — Executive Overview · 00:32–01:05 (33 s)

| | |
|---|---|
| **Sign in as** | Executive / Leadership — Alex Morgan, CIO |
| **Page / route** | `/overview` (landing page) |
| **Actions** | Hover the KPI cards **Month-end forecast** → **Savings opportunity** → **Savings realized**. Hover the insight under **What leadership should know** that begins *57% of open savings…* |
| **Expected on screen** | Month-end forecast **$12.2M**; Savings opportunity **$19.3M** with footnote *$8.29M without an owner*; Savings realized **$2.76M**; insight *57% of open savings has an accountable owner; $8.29M remains unowned.* |
| **If it goes wrong** | Figures differ → state is not from reset: finish the sentence, then reload the start URL off-camera and resume at this scene. |
| **Timing** | 61 words ≈ 26 s spoken · 1 s silent (sign-in/log out) · ≈ 8 s of clicks, mostly while speaking |

**Say:**

> This is the leadership view. We run at roughly twelve point two million dollars a month. There is nineteen point three million a year in open savings opportunity, and two point seven six million already verified. Verified, not estimated. But only fifty-seven percent of that open opportunity has an accountable owner. More than eight million dollars a year belongs to nobody.

### Scene 3 — Opportunity and drill-down · 01:05–01:35 (30 s)

| | |
|---|---|
| **Sign in as** | Executive / Leadership |
| **Page / route** | `/overview` → card **Savings drill-down** |
| **Actions** | Scroll to **Savings drill-down** → click **SAP S/4HANA** → click **Unassigned**. Rest the cursor on the first row, **REC-2041**. Then, silently: your name (top right) → **Log out**. |
| **Expected on screen** | Breadcrumb *All products › SAP S/4HANA › Unassigned*; tiles *Estimated (open pipeline)* and *Verified (realized)*; first row **REC-2041** · *Validated* · *No ticket* · **$1.08M est.** After **Log out**: login page. |
| **If it goes wrong** | Clicked the wrong product → click **All products** in the breadcrumb and choose again. |
| **Timing** | 43 words ≈ 18 s spoken · 5 s silent (sign-in/log out) · ≈ 11 s of clicks, mostly while speaking |

**Say:**

> Leadership can drill from product, to owner, to the individual recommendation, with estimated and verified savings always shown separately. In SAP, the largest unowned item is REC-2041: one point oh eight million dollars a year, validated, with six days left on its SLA.

### Scene 4 — FinOps assigns an owner · 01:35–02:15 (40 s)

| | |
|---|---|
| **Sign in as** | FinOps Practitioner — Jordan Lee |
| **Page / route** | `/finops` (landing page) → `/recommendations/REC-2041` |
| **Actions** | Silently: **FinOps Practitioner** → **Sign in**. Press **/**, type **2041**, press **Enter**. Click **Route to owner**; in the dialog the owner is pre-selected as *Priya Raman — ERP Platform (owning team)*; click **Route to owner**. Click the **Audit** tab. Silently: your name → **Log out**. |
| **Expected on screen** | Toast *Route to owner — REC-2041*; stage stepper at *Assigned*; owner Priya Raman; the Audit tab lists the routing event. |
| **If it goes wrong** | Owner dropdown shows someone else → choose **Priya Raman — ERP Platform (owning team)**. Search does not open the record → type the address `/recommendations/REC-2041` (live) or cut (recorded). |
| **Timing** | 43 words ≈ 18 s spoken · 10 s silent (sign-in/log out) · ≈ 24 s of clicks, mostly while speaking |

**Say:**

> FinOps now takes ownership of the pipeline. FinOps routes and tracks the work; it does not approve technical changes. REC-2041 goes to Priya Raman, who owns the SAP platform. That starts the SLA clock, and the decision is recorded in the audit trail.

### Scene 5 — Engineering execution · 02:15–03:30 (75 s)

| | |
|---|---|
| **Sign in as** | Engineering Owner — Priya Raman, Principal Engineer, ERP Platform |
| **Page / route** | `/engineering` (landing page) → `/recommendations/REC-2041` |
| **Actions** | Silently: **Engineering Owner** → **Sign in**. Under **Ready for you**, click the first card **REC-2041**. Then, each time clicking the button and confirming with the same label in the dialog (the text fields are pre-filled for REC-2041): **Accept & start work** → **Create or link ticket** (leave the external reference empty) → **Submit for change approval** → **Record change approval** (reference *CHG-DEMO-2041*) → **Mark implemented & submit for verification**. Silently: your name → **Log out**. |
| **Expected on screen** | A toast after each step; stepper moves *Assigned → In Progress → Submitted → Approved → Implemented*; ticket **FCC-1365** (Local Demo Ticketing) linked; change approval recorded as *simulated*; **Verify savings** is not offered to Priya. |
| **If it goes wrong** | REC-2041 is not in Priya's queue → FinOps did not route it: log out, sign in as FinOps, **Route to owner**, return. A button is missing → the previous step was not confirmed; check the stepper and run the step it shows. |
| **Timing** | 84 words ≈ 36 s spoken · 10 s silent (sign-in/log out) · ≈ 38 s of clicks, mostly while speaking |

**Say:**

> Now Priya signs in. Her queue holds only the work assigned to her, with this item at the top. She accepts it and opens a ticket, linked to the record. She submits a remediation plan: a rolling resize in the weekend window, with a rollback path. Change approval stays with her change process, so she records the approval reference here; in this demonstration that step is simulated. Once the change is made, she submits implementation evidence, and the item moves to FinOps for verification.

### Scene 6 — FinOps verification · 03:30–03:58 (28 s)

| | |
|---|---|
| **Sign in as** | FinOps Practitioner — Jordan Lee |
| **Page / route** | `/finops` → `/recommendations/REC-2041` |
| **Actions** | Silently: **FinOps Practitioner** → **Sign in**. Press **/**, type **2041**, press **Enter**. Click **Verify savings** → confirm **Verify savings**. Pause on the stepper. Silently: your name → **Log out**. |
| **Expected on screen** | Toast *Verify savings — REC-2041* with *$1.08M/yr moved to verified (simulated billing verification)*; stepper at **Savings Verified**. |
| **If it goes wrong** | **Verify savings** is disabled → the item is not yet *Implemented*: sign in as Priya and complete **Mark implemented & submit for verification**. |
| **Timing** | 33 words ≈ 14 s spoken · 10 s silent (sign-in/log out) · ≈ 20 s of clicks, mostly while speaking |

**Say:**

> FinOps signs back in and verifies the savings. In production that check runs against billing data after the change; here it is simulated. Only now does an estimate count as a realized saving.

### Scene 7 — Executive outcome · 03:58–04:30 (32 s)

| | |
|---|---|
| **Sign in as** | Executive / Leadership — Alex Morgan |
| **Page / route** | `/overview` → **Savings drill-down** → `/recommendations/REC-2041` |
| **Actions** | Silently: **Executive / Leadership** → **Sign in**. Hover **Savings realized**. In **Savings drill-down** click **SAP S/4HANA** → **Priya Raman**, then click the **REC-2041** row to open the record. |
| **Expected on screen** | Savings realized **$3.85M**; drill-down row for REC-2041 shows **Savings Verified** · *Ticket FCC-1365* · **$1.08M verified**; the record opens read-only with the full stepper, ticket and evidence in Comments. |
| **If it goes wrong** | Still shows $2.76M → verification was not completed: finish the sentence, then complete the FinOps scene off-camera. |
| **Timing** | 49 words ≈ 21 s spoken · 5 s silent (sign-in/log out) · ≈ 14 s of clicks, mostly while speaking |

**Say:**

> Back in the leadership view, verified savings have moved from two point seven six to three point eight five million dollars a year, within this demonstration. Leadership can trace that number to the product, to the accountable owner, and to the record itself, with its ticket and its evidence.

### Scene 8 — Close · 04:30–04:55 (25 s)

| | |
|---|---|
| **Sign in as** | Executive / Leadership |
| **Page / route** | `/recommendations/REC-2041` (stay) |
| **Actions** | No clicks. Optional, after the closing line: your name → **Log out**. |
| **Expected on screen** | Record REC-2041 at *Savings Verified*. |
| **If it goes wrong** | — |
| **Timing** | 43 words ≈ 18 s spoken · 1 s silent (sign-in/log out) · ≈ 0 s of clicks, mostly while speaking |

**Say:**

> That is the process: find the highest-value opportunities, assign clear accountability, let engineering deliver through its own change process, and count savings only once they are verified. The figures today are illustrative; the operating model is what we would take into a pilot.

### Closing statement

The **Close** scene is the closing statement. Do not add figures after it. If asked, the savings shown are illustrative outcomes within the demonstration workflow, not achieved production savings.

### What changes on screen (verified by automated tests)

| Executive Overview | Start | After the demo |
|---|---|---|
| Savings realized (annualized, verified) | **$2.76M** | **$3.85M** |
| Savings opportunity (open) | $19.3M · $8.29M without an owner | $18.2M · $7.21M without an owner |
| Owned share of open savings | 57% | 60% |
| Value at SLA risk (**Open actions**) | $4.08M | $3.00M |
| Month-end forecast | $12.2M | $12.1M |
| Priya Raman — login card workload | 24 open · $739K/yr | 24 open · $739K/yr (REC-2041 verified, no longer open) |

---

## C1. Backup script — 4:35

Same sign-in sequence and workflow, with shorter narration. Skip the **Audit** tab and opening the record at the end.

| Time | Sign in as → actions | Say |
|---|---|---|
| 00:00–00:05 | Title card | — |
| 00:05–00:25 | Login page, then **Executive / Leadership** → **Sign in** | “FinOps Command Center makes cloud savings accountable. This is a local demonstration on illustrative data with simulated sign-in.” |
| 00:25–00:55 | Hover **Savings opportunity**, **Savings realized**, then the *57%* insight | “Nineteen point three million a year in open opportunity, two point seven six million already verified, and only fifty-seven percent of the open opportunity has an owner.” |
| 00:55–01:20 | **Savings drill-down** → **SAP S/4HANA** → **Unassigned**, then **Log out** | “Drilling into SAP, the largest unowned item is REC-2041, one point oh eight million dollars a year.” |
| 01:20–01:50 | **FinOps Practitioner** → **Sign in** → **/** 2041 Enter → **Route to owner** → **Route to owner**, then **Log out** | “FinOps routes it to Priya Raman, the accountable owner. FinOps tracks the work; it does not approve the change.” |
| 01:50–03:00 | **Engineering Owner** → **Sign in** → **REC-2041** → **Accept & start work** → **Create or link ticket** → **Submit for change approval** → **Record change approval** → **Mark implemented & submit for verification**, then **Log out** | “Priya sees only her own work. She accepts it, opens a ticket, submits a plan, records the change approval reference from her change process, simulated here, and submits evidence of the change.” |
| 03:00–03:30 | **FinOps Practitioner** → **Sign in** → **/** 2041 Enter → **Verify savings** → **Verify savings**, then **Log out** | “FinOps verifies the savings, simulated here, and only then do they count as realized.” |
| 03:30–04:30 | **Executive / Leadership** → **Sign in** → hover **Savings realized** → **Savings drill-down** → **SAP S/4HANA** → **Priya Raman** | “Within this demonstration, verified savings move from two point seven six to three point eight five million a year, traceable to the owner and the record. Find the opportunity, assign accountability, deliver through engineering's own change process, and count savings only once verified. The figures are illustrative; the operating model is what we would pilot.” |
| 04:30–04:35 | End card | — |

Spoken words: 182, which is about 1:18 at 140 wpm. The rest of the 4:35 is five sign-ins, four log-outs, seven confirmation dialogs and pauses.

---

## C2. Access-control demonstration (60–90 s, separate from the executive story)

### Purpose
Shows that a second engineer on the **same team** as Priya cannot reach her record REC-2041 by any route, while their own work stays fully accessible. Run it **after** the main demo (REC-2041 owned by Priya), or at any time after a reset — the result is the same.

Present it live with the address bar visible (step 4 types a URL). Nothing about REC-2041 beyond the ID you type is shown.

| Time | Sign in as / route | Actions (exact labels) | Expected on screen | Say |
|---|---|---|---|---|
| 0:00–0:15 | Login page `/login` | If signed in: your name → **Log out**. Click **Engineering Owner (second account)** → **Sign in**. | Card shows *Marcus Hill · Senior Engineer, ERP Platform* and *Assigned workload: 27 open recommendations · $380K/yr est.*; lands on `/engineering`. | “Here is a second engineer on the same ERP team, Marcus Hill, with his own assigned work.” |
| 0:15–0:30 | `/engineering` | Under **Ready for you**, click the first card **REC-1219**. | Record *Apply off-hours schedule to vm-bw-dev-eus2-40* opens; owner Marcus Hill; his next step is offered. | “He sees and works his own records as normal.” |
| 0:30–0:50 | Top navigation **Recommendations** (`/recommendations`) | In **Search recommendations** type **2041**. Then press **/** and type **2041** in global search. | Result count reads **0 of 41 recommendations**; global search shows *No matches for “2041”*. | “Searching for Priya's item returns nothing: it is excluded before search, counts and filters run.” |
| 0:50–1:10 | Address bar `/recommendations/REC-2041` | Type the URL and press Enter. | *Recommendation REC-2041 is not available* — *It does not exist or is outside the records your role can access.* — button **Back to recommendations**. | “Even with the exact address, he gets the same answer as for an ID that doesn't exist. No title, owner, value, ticket or comments.” |
| 1:10–1:20 | Any page | Your name → **Log out**. | Login page. | “Each engineer sees only what they own. In production the same rule is enforced by the server behind enterprise sign-on.” |

### Expected results checklist
- Marcus's own record opens and shows his actions — **positive check**.
- Search for 2041 → **0 of 41 recommendations**; global search → *No matches*.
- `/recommendations/REC-2041` → generic *not available* page, identical to `/recommendations/REC-9999`.
- His **Tickets** page and **Engineering Work Queue** contain no FCC-1365 and no REC-2041.

### If it goes wrong
- REC-2041 appears for Marcus → stop; this would be a defect. The automated suite (`tests/isolation.test.tsx`) checks every one of these paths.
- Wrong account signed in → your name → **Switch demo user** → **Engineering Owner (second account)**.

### Honest limits
This is a local, browser-only demo: the full illustrative dataset is stored in the browser so it can run offline. Pages, search, counts, filters, exports, bulk actions, copilot answers and detail URLs all read a role-scoped view, but a person with browser developer tools could still read local storage. A production deployment enforces the same rule on the server.

---

## D. Exact click path (5:00 version)

1. Open the start URL. The login page appears.
2. **Executive / Leadership** → **Sign in**. You land on Executive Overview.
3. Hover **Month-end forecast**, **Savings opportunity**, **Savings realized**, then the *57%* insight.
4. In **Savings drill-down**, click **SAP S/4HANA** → **Unassigned**.
5. Your name → **Log out**.
6. **FinOps Practitioner** → **Sign in**.
7. Press **/**, type **2041**, press **Enter**.
8. **Route to owner** (Priya Raman pre-selected) → **Route to owner** → **Audit** tab.
9. Your name → **Log out**.
10. **Engineering Owner** → **Sign in**, then under **Ready for you** click **REC-2041**.
11. **Accept & start work** → confirm.
12. **Create or link ticket** → confirm.
13. **Submit for change approval** → confirm.
14. **Record change approval** → confirm.
15. **Mark implemented & submit for verification** → confirm.
16. Your name → **Log out**.
17. **FinOps Practitioner** → **Sign in** → **/** 2041 **Enter** → **Verify savings** → confirm.
18. Your name → **Log out**.
19. **Executive / Leadership** → **Sign in** → hover **Savings realized**.
20. In **Savings drill-down**, click **SAP S/4HANA** → **Priya Raman** → the **REC-2041** row.

This exact sequence is executed through the real UI by `tests/hero-e2e.test.tsx`.

---

## E. Captions and recording assets

- **Captions:** `docs/demo-script.srt` (45 cues, inside each scene's spoken span only).
- **Plain narration:** `docs/demo-script.txt`.
- **Generator:** `python3 scripts/video/build-captions.py`. It fails if any scene's narration cannot fit its window at 140 wpm.
- **Cards:** title and end cards in `docs/video/`.

`tests/demo-docs.test.ts` checks that this script, the captions and the app all agree:
- narration identical to the captions
- cue order and bounds
- button labels present in the code
- figures computed from the data

---

## F. Executive Q&A

Standard disclosure: *“This demonstration uses deterministic illustrative data. The production architecture is designed to connect to live Azure data.”*

1. **Is this connected to live Azure?** No. It uses deterministic illustrative data and makes no external calls. Connecting Azure Cost Management and Resource Graph data is the pilot step.
2. **Who approves changes?** The engineering owner's existing change process. The platform records the approval reference; FinOps does not approve technical changes.
3. **How do you stop estimates being reported as savings?** They are separate states. A saving counts as realized only after implementation evidence and FinOps verification.
4. **Can engineers see each other's work?** No. Each engineer sees only records they own. See section C2.
5. **How is sign-in handled in production?** Enterprise single sign-on (Microsoft Entra ID). The demo login page and accounts exist only in local demo mode and are never served in pilot or production mode.
6. **How does ticketing work?** The demo uses a local ticket store. Production is designed to integrate with ServiceNow, Jira or Azure DevOps.
7. **Does it scale?** The demo models 14 subscriptions, 2,607 resources and 729 recommendations. Production sizing depends on the data platform and will be measured in the pilot. We don't quote performance figures from demo data.
