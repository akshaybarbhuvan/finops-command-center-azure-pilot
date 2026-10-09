# Pilot readiness report — FCC single-organization Azure pilot

## Status (updated 2026-10-09)

| Dimension | Status |
|---|---|
| Code, documentation and **local/offline validation** | **READY FOR CONTROLLED PILOT REVIEW.** Review and planning only: all automated checks pass locally (§3) |
| **Live Azure validation** (Entra sign-in, Resource Graph, Cost Management, Advisor, Azure SQL) | **NOT PERFORMED.** Not live-Azure-validated |
| **Deployment / production approval** | **NOT APPROVED.** Deployment is blocked until (a) the open dependency findings in §5a are remediated or **formally risk-accepted** by the accountable owner, and (b) the live acceptance checks (PILOT_RUNBOOK §2) pass |

**Correction to the previous version of this report.** It stated that "no critical or high defects remain open" and described the PostCSS advisory as "build-time only". Neither statement is supported by the evidence:
- `npm audit` reports **unresolved high-severity findings**: 8 high in the full tree, including **1 high in production dependencies** (§5a). None of them is fixed or closed.
- The vulnerable nested `postcss@8.4.31` **is included in the deployed standalone package** (`.next-pilot/standalone/node_modules/next/node_modules/postcss`). Whether the Next.js server executes it at runtime has not been established.

The application is **locally validated only**. It is **not** live-Azure-validated and **not** approved for production or pilot deployment.

Report date: 2026-10-09. Source: supplied `FINOPS_COMMAND_CENTER_LOCAL_DEMO.zip` (SHA-256 `5bb5e0cd…a9693`, preserved unchanged). Git is deliberately deferred; changes are listed in [CHANGE_MANIFEST.md](CHANGE_MANIFEST.md).

## 1. Baseline (before changes, observed)

| Check | Result |
|---|---|
| `npm ci` | success |
| `npm run typecheck` / `npm run lint` | pass / pass |
| `vitest run` | 9 files, **110/110** passed |
| `npm audit --omit=dev` | 2 vulnerabilities (1 high: `postcss` inside `next`; 1 moderate). Full-tree audit (including dev dependencies) was not recorded at baseline |
| Architecture found | Next.js 15 / React 19 / TypeScript; client-only synthetic data in `localStorage`; simulated login; no API routes, database, Azure integration, IaC or CI |

## 2. What was implemented

Separate pilot build (only `*.pilot.ts(x)` routes); Entra sign-in via App Service Authentication; four-role server-side authorization with record-level scope and separation of duties; Azure Resource Graph, Cost Management and Advisor connectors (read-only, paged, bounded, retrying, classified errors); synchronization with run history, lease locks, reconciliation and freshness; Azure SQL persistence (SQLite for local validation) with versioned migrations; workflow, evidence, savings verification and append-only audit; pilot UI pages and connector health; Bicep templates; GitHub Actions CI and gated OIDC deployment; operator scripts; documentation. Details: [ARCHITECTURE.md](ARCHITECTURE.md), [LEADER_HANDOFF.md](LEADER_HANDOFF.md).

## 3. Observed results of the final run (after all fixes)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npm run lint` | pass (0 warnings) |
| `npx vitest run` | **17 files, 206/206 tests passed** (demo 110 + pilot 96) |
| `npm run validate:pilot` (with `BICEP_BIN` set) | **PASSED 19/19**: type check, lint, all tests, Bicep build of both templates, Bicep lint, pilot build, bundle scan (no demo data or sign-in), fixture database, standalone server start, anonymous 401/redirect, nonce CSP on all 24 scripts, executive overview, scoped export, role boundaries, Engineer-B isolation (page, API, export), role pages, persistence across restart, fail-closed configuration |
| `npm run validate:demo` | **READY 9/9** (demo unchanged and still passes) |
| Clean-checkout reproduction: fresh extract of `FCC_AZURE_PILOT.zip` → `npm ci` → `npm run validate:pilot` | **PASSED 19/19** (no dependency on the implementation workspace) |
| Bicep CLI 0.30.23 `build` / `lint` | pass, no warnings |
| `npm audit` (full tree, including dev/build tools) | **14 vulnerabilities: 8 high, 6 moderate.** Unresolved; see §5a |
| `npm audit --omit=dev` (production dependencies) | **5 vulnerabilities: 1 high, 4 moderate.** Unresolved; see §5a |

### 3a. Operator reproduction on Windows (reported by the operator, 2026-10-09)

| Command | Result |
|---|---|
| `npm.cmd run validate:pilot` | PASSED 19/19 |
| `npm.cmd run validate:demo` | PASSED 9/9 |
| `npm.cmd ls next postcss tailwindcss mssql tedious sprintf-js braces postcss-selector-parser` | No invalid dependency entries |
| `npm.cmd audit fix` (without `--force`) | Did **not** resolve the remaining vulnerabilities |
| `npm.cmd audit` | 14 vulnerabilities (8 high, 6 moderate) |
| `npm.cmd audit --omit=dev` | 5 vulnerabilities (1 high, 4 moderate) |
| Versions | `next@15.5.27` with nested `postcss@8.4.31`; root `postcss@8.5.29`; `braces@3.0.3`; `postcss-selector-parser@6.1.4`; `sprintf-js@1.1.3` |

The same counts and versions were reproduced in the implementation workspace with read-only commands (`npm ls`, `npm audit`). There, `package.json` and `package-lock.json` were unchanged, confirmed by SHA-256 before and after.

> Note: `npm audit fix` (even without `--force`) may rewrite `package-lock.json`. If the operator's lockfile changed, that working copy is no longer identical to the delivered, validated one. Compare it with the delivered lockfile, or restore it, before relying on the results.

Offline means: connectors were exercised through the real client code against **deterministic fixtures**, and the server ran on **SQLite** with a **simulated App Service identity header**. These results do **not** prove live Azure connectivity, Entra sign-in or Azure SQL behaviour.

## 4. Live Azure verification

| Item | Status |
|---|---|
| Entra sign-in, app roles, tenant restriction | **Pending** (no tenant access) |
| Resource Graph inventory against approved subscriptions | **Pending** |
| Cost Management query (including `Cost` vs `PreTaxCost` column) | **Pending** |
| Advisor recommendations and savings fields | **Pending** |
| Azure SQL migrations, grant script and runtime queries | **Pending** (highest priority; tested only with a mocked driver) |
| Bicep `what-if` and deployment | **Pending** (needs an authorized session) |
| GitHub CI and deploy workflows | **Not run** (no repository yet) |

## 5. Independent review — issues, fixes and retests

The review was done by a separate reviewer with no part in writing the code. It read the code and diff and re-ran the checks independently: tsc, lint, 200/200 tests, `validate-pilot` 19/19, Bicep build and audit. Issues found during implementation are listed as I-x.

| ID | Severity | File / location | Issue and impact | Evidence | Fix applied | Retest |
|---|---|---|---|---|---|---|
| R-1 | **High** (reviewer: Medium; raised because it is an authentication bypass if misdeployed) | `src/pilot/config.ts` | The App Service identity header was trusted off App Service too. Running the bundle on a VM or container would let anyone forge any identity | Smoke tests forged the header against a production build | `appservice` mode now requires App Service with `WEBSITE_AUTH_ENABLED=True`; otherwise only `FCC_LOCAL_VALIDATION=true` **with a localhost origin** | New config tests; validate-pilot 19/19 ✓ |
| R-2 | Medium | `db/migrations.ts` (T-SQL), `db/mssql.ts` | `CHAR` key columns compared with `NVARCHAR(MAX)` parameters force implicit conversion and scans, so the inventory sync slows down quadratically | Code review (needs a live query plan to confirm) | T-SQL keys changed to `NVARCHAR(n)` (migration not yet applied anywhere); strings bound as `NVARCHAR(4000)` | Adapter test ✓; **live plan check pending** |
| R-3 | Medium | `workflow/service.ts` | Verified savings come from reviewer-entered figures, not reconciled with billing; one FinOps reviewer suffices | Code | Labelled **"FinOps-attested"** in UI and docs; reviewer, windows, method and reference audited; second-approver option raised as decision D3 | UI text in smoke page ✓; **policy decision pending (FinOps owner)** |
| R-4 | Medium | `queries/portfolio.ts` `costDaily` | Trailing days with no data yet (Azure lag) were plotted as zero | Code | Days after the last date Azure returned data are "no data" | New test ✓ |
| R-5 | Medium | docs | Readiness report referenced but missing | `ls docs` | This report | ✓ |
| R-6 | Low-Med | `sync/service.ts`, `scripts/pilot/sync.ts` | Lock never renewed; CLI had no deadline, so runs could overlap | Code | Lease renewed per subscription (stops if lost); CLI 45-minute hard stop | New test ✓ |
| R-7 | Low | `queries/*` | Some totals were not limited to currently approved subscriptions | Code | Approved-subscription filter in lists, detail, actions, export, pipeline, verified savings, inventory, resources | New tests ✓ |
| R-8 | Low | `queries/portfolio.ts` | Open-estimate total included recommendations Advisor no longer returns; reservation overlap not flagged | Code | `not_returned` excluded from totals (count shown separately); reservation/savings-plan overlap documented | New test ✓ |
| R-9 | Low | `workflow/rules.ts` | 13-digit amounts overflow BIGINT micros (500 instead of 400) | Code | Capped at 12 integer digits | New test ✓ |
| R-10 | **High** (production dependency) + moderate | dependencies | Unresolved `npm audit` findings: see the register in §5a (DEP-1 … DEP-4) | Audit output (§3, §3a) | **Not fixed.** `npm audit fix` did not resolve them; the offered fixes are breaking upgrades (`--force`), which were deliberately not applied. **No formal risk acceptance has been recorded** | **Open**: owner and next actions in §5a |
| R-11 | Low | `deploy-pilot.yml` | Tag-pinned actions; any branch could be dispatched; deploy role is privileged | Code | Deploy job limited to `main`; docs require environment branch restriction and reviewers; SHA pinning documented for the Git phase | Workflow syntax reviewed; **not run** |
| R-12 | Low | `main.bicep`, `config.ts` | Origin fixed to `*.azurewebsites.net`; sovereign-cloud SQL hosts accepted but ARM public only | Code | `publicOrigin` parameter; SQL host restricted to public cloud; scope documented | Bicep build ✓, config test ✓ |
| R-13 | Low | `main.bicep` | SQL allows Azure services; public endpoints | Code | **Accepted for pilot** (Entra-only SQL, TLS, auditing); private networking recommended for production | Documented in SECURITY §6 |
| R-14 | Low | `http/api.ts` | Body read fully before the size check when chunked | Code | Streaming read with a 32 KB cap | API tests ✓ |
| R-15 | Low | auth / workflow | Role revocation takes effect at next sign-in; owners can reject or defer alone | Code | **Documented**; policy decision D3 | — |
| R-16 | Low | docs | Local-only variables undocumented | Docs cross-check | Documented in AZURE_SETUP §5 | ✓ |
| I-1 | Medium | `session.ts` | User-directory write throttle was process-wide, so a user might never be recorded in a new database | Failing tests | Throttle keyed per connection | ✓ |
| I-2 | Low | `rec_events` | History order was ambiguous within the same millisecond | Failing test | `rec_version` column orders events | ✓ |
| I-3 | Medium | `/api/sync` | A synchronous refresh could exceed the App Service request timeout | Design review | Background run, 202 response, status on the health screen | API test ✓ |
| I-4 | Medium | CSP | Static CSP allowed inline scripts | Design review | Per-request nonce CSP in middleware | Smoke: 24/24 scripts carry the nonce ✓ |
| I-5 | Low | `.nvmrc` | Node 20 is end-of-life | — | Node 22 LTS | ✓ |
| I-6 | Low | Next.js build | `pageExtensions` build warns it cannot copy client manifests for API routes | Build log | Verified harmless: the standalone server serves all routes (smoke tests) | ✓ |

**Open high: R-10 / DEP-1** (production dependency, unresolved; formal risk acceptance or remediation required before deployment), plus DEP-2 (high, dev/build tooling). Open critical: none reported by `npm audit`. Code-review defects R-1 … R-16 and I-1 … I-6 are fixed or have a recorded disposition. Open medium items needing a decision or live evidence: R-2 (live query plan), R-3 (verification policy), DEP-3 (production, moderate).

## 5a. Dependency vulnerability register (unresolved)

Source: `npm audit` and `npm audit --omit=dev` (§3, §3a). The 14 audit entries come from **four vulnerable packages**; the other entries are packages flagged *because they depend on* one of those four. Transitive findings are not dismissed: each is assessed for whether it ships in the deployed artifact and how it could be reached.

"Ships" was checked by listing `.next-pilot/standalone/node_modules` after `npm run build:pilot`, which is the package deployed to App Service.

| ID | Vulnerable package (version) | Severity | Dependency type | Pulled in by | Ships in deployed package? | Practical impact for FCC | Mitigation in place | Owner / next action | Status |
|---|---|---|---|---|---|---|---|---|---|
| **DEP-1** | `postcss` **8.4.31** (nested under `next@15.5.27`; root `postcss` is 8.5.29 and not flagged) | **High.** Advisories: XSS via unescaped `</style>` in CSS stringify output; arbitrary file read / path traversal via attacker-controlled `sourceMappingURL` (including incomplete-fix follow-ups) | **Production** (`next` is a runtime dependency) | `next` | **Yes**: `node_modules/next/node_modules/postcss` is in the standalone package | Exploitation requires PostCSS to process attacker-controlled CSS or source maps. FCC accepts no CSS, source maps or file paths from users, and its CSS is compiled from repository sources at build time. Whether the Next.js server invokes this PostCSS copy at runtime has **not** been established, so runtime reachability cannot be ruled out | No user-supplied CSS processed; CSP; App Service authentication in front of all pages | **Engineering lead:** (1) check for a Next.js 15.x patch that updates the nested PostCSS and test it on a branch; (2) otherwise plan the major upgrade (`npm audit` offers only Next 16 via `--force`) as its own tested change; (3) until then, **security owner / business sponsor must formally accept the risk in writing before deployment** | **Open** |
| **DEP-2** | `braces` 3.0.3 | **High.** Stack-exhaustion denial of service through deeply nested brace patterns | **Development / build only** | `micromatch`, `chokidar` → `fast-glob`, `tailwindcss`, `@next/eslint-plugin-next` → `eslint-config-next` (these account for **7 of the 8 high entries**) | **No** (not in the standalone package) | Affects developer machines and CI when building or linting. Input is glob patterns from repository configuration. A malicious contribution (for example a pull request) could at worst stall a build or CI job; no runtime exposure | CI runs in ephemeral runners with timeouts; code review of configuration changes | **Engineering lead:** track `tailwindcss` / `eslint-config-next` / `micromatch` releases; upgrade in a tested change; record acceptance for the build environment | **Open** |
| **DEP-3** | `sprintf-js` 1.1.3 | **Moderate.** Denial of service through unbounded precision specifiers | **Production** | `tedious@18.6.2` → `mssql@11.0.2` (`tedious` and `mssql` are flagged as moderate because of it) | **Yes**: in the standalone package and used by the Azure SQL driver at runtime | Exploitation requires an attacker-controlled **format string**. The `tedious` call sites inspected (`login7-payload.js`, `metadata-parser.js`) use fixed format literals with values passed as arguments. This inspection was a sample, not a full audit, so impact is believed low but **not formally confirmed** | Database is reachable only with Entra authentication; FCC never passes user input as a format string | **Engineering lead:** check `mssql` / `tedious` releases that drop or patch `sprintf-js`; complete the call-site review; record acceptance | **Open** |
| **DEP-4** | `postcss-selector-parser` 6.1.4 | **Moderate.** Quadratic-complexity CPU exhaustion in selector parsing | **Development / build only** | `postcss-nested` → `tailwindcss` | **No** | Build-time processing of repository CSS only; worst case is a slow build from a malicious contribution | Code review; CI timeouts | Engineering lead: upgrade with `tailwindcss`; record acceptance for the build environment | **Open** |
| — | `next` 15.5.27 | Moderate (by dependency on DEP-1) | Production | — | Yes | See DEP-1 | — | See DEP-1 | Open |
| — | `mssql` 11.0.2, `tedious` 18.6.2 | Moderate (by dependency on DEP-3) | Production | — | Yes | See DEP-3 | — | See DEP-3 | Open |
| — | `postcss-nested` 6.2.0 | Moderate (by dependency on DEP-4) | Development / build only | `tailwindcss` | No | See DEP-4 | — | See DEP-4 | Open |
| — | `micromatch`, `fast-glob`, `chokidar`, `tailwindcss`, `@next/eslint-plugin-next`, `eslint-config-next` | High (by dependency on DEP-2) | Development / build only | — | No | See DEP-2 | — | See DEP-2 | Open |

**CI configuration note (conflict, not changed in this documentation-only update).** `.github/workflows/ci.yml` runs `npm audit --omit=dev --audit-level=critical`, so CI **does not fail** on these high or moderate findings. Its inline comment calls the PostCSS finding a "known, accepted exception … build-time only". That description is inaccurate (DEP-1 ships in the deployed package), and no acceptance has been recorded. The comment and gate should be corrected in a separate, reviewed change to CI configuration.

**Formal risk acceptance required before deployment.** For each open DEP item, the accountable owner (security owner together with the business sponsor) must record: decision (accept / remediate first), justification, compensating controls, expiry or review date, and signature. Record it in the table below. Until then, deployment is not approved.

| ID | Decision | Accepted / decided by | Date | Review / expiry date |
|---|---|---|---|---|
| DEP-1 | Pending | | | |
| DEP-2 | Pending | | | |
| DEP-3 | Pending | | | |
| DEP-4 | Pending | | | |

## 6. Acceptance criteria (mandate §17)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Existing application builds | ✓ Verified | validate:demo 9/9 |
| 2 | Dashboard/workflow functionality intact | ✓ Verified (demo) | 110 demo tests |
| 3 | Synthetic mode works | ✓ Verified | validate:demo |
| 4 | Pilot never falls back to synthetic data | ✓ Verified offline | Separate build, bundle scan, fail-closed test |
| 5 | Entra authentication implemented and documented | ✓ Implemented; live sign-in **pending** | AZURE_SETUP §3 |
| 6 | Server-side authorization tested | ✓ Verified offline | workflow/api tests, smoke tests |
| 7 | Resource Graph retrieval | Implemented; **live pending** | connector + sync tests |
| 8 | Cost from Cost Management with period and currency | Implemented; **live pending** | connector + query tests |
| 9 | Advisor from source | Implemented; **live pending** | connector tests |
| 10 | Failed/stale/unauthorized reported | ✓ Verified offline | sync tests |
| 11 | Workflow records persist in the configured database | ✓ SQLite (restart test); **Azure SQL pending** | smoke test |
| 12 | Source identity, no duplicates | ✓ Verified offline | sync tests |
| 13 | Documented formulas | ✓ | DATA_DICTIONARY |
| 14 | Estimated vs verified distinct and auditable | ✓ Verified offline | workflow tests |
| 15 | No remediation operations | ✓ Verified | separation test (no write verbs) |
| 16 | Infrastructure documented and validated where possible | ✓ Bicep build/lint; what-if **pending** | — |
| 17 | No secrets committed | ✓ | §7 scan |
| — | No unresolved critical/high security finding (merge/deployment gate) | ✗ **Not met**: DEP-1 (high, production) and DEP-2 (high, build tooling) open | §5a |
| 18 | Results recorded accurately | ✓ (corrected 2026-10-09; see Status) | this report |
| 19 | Independent review | ✓ | §5 |
| 20 | Docs match implementation | ✓ (cross-checked by reviewer; R-5 fixed) | — |
| 21 | Handoff without chat history | ✓ | LEADER_HANDOFF |
| 22 | Live items marked pending | ✓ | §4, PILOT_RUNBOOK §2 |

Live acceptance results (PILOT_RUNBOOK §2, to be completed by testers):

| Check | Date | Tester | Result | Evidence |
|---|---|---|---|---|
| A1–A17 | | | Pending | |

## 7. Secret and hygiene scan (final state)

- Pattern scan for client secrets, passwords, connection strings, private keys, bearer tokens and Azure storage keys across the delivered tree (excluding `node_modules`): **no real secrets**. Matches are limited to placeholders (`<…>`), test fixture tokens (`fixture-token`) and redaction test strings.
- Conflict-marker and trailing-whitespace check on changed/added text files: clean.
- No `.env` files, databases, build output or `node_modules` in the delivery ZIP.

## 8. Owners of open items

| Item | Owner | Due |
|---|---|---|
| Live validation A1–A17, starting with Azure SQL (A17) | Application engineer + pilot testers | Before go/no-go |
| Verification policy D3 (R-3, R-15) | FinOps product owner | Before go/no-go |
| Billing view-charges confirmation (D6) | Billing administrator | Before live cost test |
| DEP-1 … DEP-4: remediation plan (Next.js patch or major upgrade; `tailwindcss` / ESLint tooling; `mssql` / `tedious`) | Engineering lead | Plan within 30 days |
| **Formal risk acceptance or remediation of DEP-1 … DEP-4** (§5a) | Security owner + business sponsor | **Before any deployment** |
| Correct the CI audit gate and comment (§5a note) | Engineering lead + Git repository administrator | With the Git/CI setup |
| R-13 private networking for production | Cloud architect | Before any production use |
