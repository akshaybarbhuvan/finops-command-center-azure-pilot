# Demo Fallback Plan

Goal: recover from any problem in **under 10 seconds** without leaving the story.

## Recovery URLs

| URL | Effect | Use when |
|---|---|---|
| `http://localhost:3000/login?reset=1&focus=1` | Restores the seed data, ends any session (never signs anyone in), Focus mode on, login page. REC-2041 is back to *Validated, unassigned*. | Clean start, or the workflow state is wrong. |
| `http://localhost:3000/recommendations/REC-2041` | Opens the hero recommendation, keeping state. Redirects to the login page if nobody is signed in, then returns here after sign-in (if the account may see it). | You lost your place mid-story. |

## Symptom → fix

| Symptom | Recovery (≤ 10 s) | Say (if live) |
|---|---|---|
| Chart blank or still animating | **F5**. Workflow state and sign-in are kept. | “Let me refresh that view.” |
| Sent to the login page unexpectedly | Sign in again with the account for this segment. Data is unchanged. | — |
| Action disabled: “Performed by FinOps” / “Engineering” | Wrong account. Account menu → **Switch demo user** → the named account → **Sign in**. | “That step belongs to FinOps.” |
| Engineering can't find REC-2041 (“not available”) | It hasn't been routed to Priya yet. Log out → FinOps → **Route to owner**. | — |
| **Submit** disabled: “Create or link a ticket first” | **Create or link ticket** → confirm, then Submit. | — |
| Wrong dialog opened | **Esc** or **Cancel** — nothing changes until you confirm. | — |
| Workflow already advanced at the start | Load `/login?reset=1&focus=1`, then re-enter with the table below. | “Let me start that from the top.” |
| Focus mode off | Click the **expand** icon in the header. Avoid **Esc** when no dialog is open. | — |
| Server stopped | Terminal: `npm run demo:prod` (≈ 20–40 s). Re-record the segment. | “One moment.” |

## Re-entering mid-story after a reset

| Resume at | From reset, do quickly (off-camera or cut in edit) |
|---|---|
| 01:35 FinOps assigns an owner | Nothing; sign in as **FinOps Practitioner**. |
| 02:15 Engineering execution | FinOps: **/** 2041 → **Route to owner** → **Route to owner**. **Log out**. |
| 03:30 FinOps verification | Above, then as **Engineering Owner**: **Accept & start work** → **Create or link ticket** → **Submit for change approval** → **Record change approval** → **Mark implemented & submit for verification**. **Log out**. |
| 03:58 Executive outcome | Above, then FinOps: **Verify savings**. **Log out**. |

## Access-control demo

| Symptom | Fix |
|---|---|
| Card **Engineering Owner (second account)** not shown | Old build: reinstall from the final ZIP and run `npm run validate:demo`. |
| Marcus's first **Ready for you** card isn't REC-1219 | State isn't from reset; any of his own records works for the positive check. |
| The address bar is hidden | Exit full screen (**F11**) to type `/recommendations/REC-2041`. |

## Recording advice
- Record each scene as its own take and cut on the log out / sign in.
- Never show the terminal, developer tools or the reset URL on camera.
- Before any retake: `/login?reset=1&focus=1`, wait 2 seconds, then start.
