# Access-Control Demonstration (60–90 seconds)

Local demo · illustrative data · simulated sign-in. Use this separately from the 5-minute executive story. The same script appears as section C2 of `5-Minute-Executive-Demo.md`.

**Start URL:** `http://localhost:3000/login` (after the main demo), or `http://localhost:3000/login?reset=1&focus=1` for a clean start.

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
