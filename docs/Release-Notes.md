# Release Notes

## Version 1.3.0 — Second engineer, isolation through the UI, presentation-ready script (October 2026)

### Changes
- **Second Engineering demo account:** *Engineering Owner (second account)*, Marcus Hill, Senior Engineer, ERP Platform. He is on the same team as Priya, with a different set of 41 recommendations (27 open) and never REC-2041. Engineering cards on the login page show the assigned workload (open count and estimated value).
- **Pilot/production request gate (`src/middleware.ts`):** previously the demo login page and accounts were never *rendered* outside demo mode, but their JavaScript chunks (including demo account names) were still downloadable. Every request, pages and `/_next` assets alike, now gets a static single sign-on notice (HTTP 401). `validate:demo` checks that the demo login page's JavaScript is not served in pilot mode.
- **Audit scoping tightened:** an engineer's own past actions on a record now owned by someone else no longer appear in their audit view.
- **No hero ID in hint text:** the global-search empty state, copilot help text and the engineering copilot suggestion no longer name REC-2041. The engineering suggestion now uses the engineer's own top record. Copilot answers for an out-of-scope ID use the same "not available" wording as the detail page.
- **New UI-level tests:**
  - `tests/isolation.test.tsx` — the second engineer against Priya's record across list, count, search, filter options, bulk select-all, CSV export, detail URL, work queue, tickets, global search, workflow commands and copilot; positive checks for both engineers; Executive, Admin and FinOps permissions.
  - `tests/hero-e2e.test.tsx` — the full 10-step demo sequence clicked through the real login page, detail page, dialogs and account menu.
  - `tests/demo-docs.test.ts` — script, captions and app stay in sync.
- **Presenter script rewritten:** run of show; word-for-word narration per scene with account, route, exact actions, expected result and recovery; 4:35 backup; separate access-control script (`docs/Access-Control-Demo.md`); measured word count and timing.
- **Captions:** `build-captions.py` now models silent sign-in and log-out time per scene and fails the build if narration cannot fit.

### Known limitations
- Isolation is enforced in the browser in this local demo. The full illustrative dataset lives in browser storage, so it is readable with developer tools. Production enforces isolation on the server.
- Timing assumes 140 words per minute plus the silent intervals listed in the recording plan. Confirm with a stopwatch rehearsal.

## Version 1.2.0 — Role model, simulated sign-in and bulk operations (October 2026)

### Changes
- **Simulated local sign-in** at `/login` (demo mode only): four demo accounts, *LOCAL DEMO | ILLUSTRATIVE DATA* banner, note that it is not Microsoft Entra ID. No auto-login, no role dropdown. Protected routes redirect to `/login?next=…` (open-redirect safe). Account menu: identity, role, **Switch demo user**, **Log out** (keeps data). The Local Demo Persona selector is removed.
- **Reset** (`/login?reset=1`, Administration) restores the seed and never authenticates.
- **Role model:** FinOps routes, prioritizes, shares, tracks and verifies, and is not the change approver. The engineering owner accepts, rejects or defers with a reason; creates or links a ticket; submits a plan; records a simulated change approval reference; and implements with evidence. Leadership is read-only with export and drill-down. Admin has no workflow bypass.
- **Central row-level authorization** (`src/lib/demo/access.ts`): engineers see only owned records everywhere: pages, search, filter options, counts, exports and detail URLs. Out-of-scope IDs look exactly like missing IDs.
- **Bulk actions:** page or all-filtered scope, preview, confirm, per-record authorization and audit, then a summary. Approve, implement and verify are excluded.
- **Filters:** multi-select across workflow, organization and Azure scope dimensions, savings and date ranges, removable chips, clear-all, result count, per-page persistence. Authorization is applied before filtering.
- **Leadership savings drill-down** on the Executive Overview: product → owner → recommendation, with estimated and verified kept separate and export at every level.
- **Docs:** a 5:00 script with a 4:35 backup, five sign-ins each ending in logout; updated guide, cheat sheet, click path, captions and fallback.
- **Tests:** sign-in and logout, reset without auth, login page, protected-route redirect, return-path safety, row-level scope (engineer A vs B), not-found without leak, read-only leadership, new hero journey, bulk rules, multi-select filters. `validate:demo` checks that `/login`, `/login?reset=1`, `/overview` and `/finops` never expose the demo sign-in in pilot mode.

## Version 1.1.0 — 5-Minute Executive Video Package (October 2026)

### Changes
- **Presenter start URL:** `/overview?reset=1&focus=1` restores the seed (REC-2041 back to *Validated, unassigned*), selects Executive, enables Focus mode and cleans the address bar. `focus=0|1` also works alone.
- **Smooth persona hand-offs:** switching persona keeps the current page when the new persona can access it (e.g. stay on REC-2041 from Executive → Engineering → FinOps); otherwise it opens that persona's home page.
- Removed the internal “Featured” tag from the hero row in recommendation tables so recordings look like production data.
- New docs: 5-minute script and storyboard, 4:35 backup, cheat sheet, recording plan, fallback plan, timed SRT captions, plain-text script, title and end cards (PNG + HTML source), caption build script.
- New tests: start-URL reset and Focus mode restore.

### Known limitations
- The hero workflow needs three persona switches between approval, implementation and verification; at a deliberate pace this fits the 40-second FinOps segment, and the backup script allows more buffer.
- The reset URL applies on a full page load (typed URL, bookmark or refresh), not on in-app navigation.


## Version 1.0.0 — Local Demo Edition (October 2026)

### Changes
- New Next.js 15 + TypeScript + Tailwind application for the FinOps Command Center leadership demo (new workstream; the FinThrive pilot codebase is untouched).
- Deterministic synthetic dataset (seed `20261007`): 14 subscriptions, 6 business units, ~2,600 resources, ~730 recommendations, ~360 tickets, 12 anomalies, 10 commitments, 12 months of cost history, daily MTD and budgets.
- Central selector layer for every metric; 21-check data validation that blocks rendering if the seed is inconsistent.
- Recommendation lifecycle with role permissions, approvals, deferral/rejection, local ticketing sync, comments/evidence and audit trail.
- Pages: Executive Overview, FinOps Workbench, Engineering Work Queue, Cost & Spend (with Allocation & Showback), Budgets & Forecast, Anomalies, Optimization (Overview, Compute, Storage, Commitments), Recommendations (table + lifecycle board), Recommendation Detail (7 tabs), Savings, Governance, Resources, Tickets, Reports (5), Roadmap, Administration.
- Shell: Local Demo Persona selector, global search (`/`, Ctrl/⌘ K), attention center, FinOps Copilot (deterministic), Focus mode, toasts, accessible dialogs/drawers.
- Dynamic executive insights computed from current state.
- CSV export on every major table; print/save-as-PDF for reports.
- `APP_MODE` gate: demo features exist only in demo mode; pilot/production render an SSO-required gate; unknown values fail closed.
- Scripts: `npm run demo`, `npm run demo:prod`, `npm run validate:demo` / `scripts/validate-demo.ps1`.
- Vitest suites: data validation, determinism, hero journey, workflow guardrails, RBAC/navigation, pilot-mode gate, filters, copilot, UI smoke.

### Known limitations
- Demo state lives in the browser’s local storage (per browser, per machine); there is no server-side persistence.
- “Verify savings” records the estimate as realized immediately; production verification uses a full billing cycle.
- Copilot is intent-based over the demo dataset, not a generative model.
- PDF output uses the browser’s print dialog (no server-side PDF generation).
- Commitment opportunities are modeled at family/region level and are illustrative.
- The recommendation grid shows estimated savings for executive impact; the pilot’s “no metrics in grid” rule is not applied in this demo workstream.

### Demo notes
- Reset before each walkthrough (persona menu → Reset demo).
- Use `npm run demo:prod` for the fastest page loads.
- Never describe figures as live or client data — see `docs/Demo-Data-Disclosure.md`.
