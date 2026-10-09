# Pilot readiness report — FCC single-organization Azure pilot

## Status (updated 2026-10-09)

| Dimension | Status |
|---|---|
| Code, documentation and **local/offline validation** | **READY FOR CONTROLLED PILOT REVIEW.** Review and planning only: all automated checks pass locally (§3) |
| **Live Azure validation** (Entra sign-in, Resource Graph, Cost Management, Advisor, Azure SQL) | **NOT PERFORMED.** Not live-Azure-validated |
| **Repository deployment tooling** | **READY AFTER PREREQUISITES.** The deployment workflow, infrastructure preflight and runbooks are in place and tested offline (§3b). The external GitHub, Entra and Azure settings in DEPLOYMENT_CHECKLIST §3 are **not configured or verified**. `deploy-pilot` has **never run** and no Azure deployment has happened |
| **Deployment / production approval** | **NOT APPROVED.** Deployment is blocked until (a) decisions D1–D6 and the dependency decisions for the two open findings, DEP-2 and DEP-3 (§5a), are recorded by their owners, (b) the gates in DEPLOYMENT_CHECKLIST §5 are GO, and (c) the live acceptance checks (PILOT_RUNBOOK §2) pass |

**Correction to the previous version of this report.** It stated that "no critical or high defects remain open" and described the PostCSS advisory as "build-time only". Neither statement is supported by the evidence:
- `npm audit` reports **unresolved high-severity findings**: 8 high in the full tree, including **1 high in production dependencies** (§5a). None of them is fixed or closed.
- The vulnerable nested `postcss@8.4.31` **is included in the deployed standalone package** (`.next-pilot/standalone/node_modules/next/node_modules/postcss`). Whether the Next.js server executes it at runtime has not been established.

The application is **locally validated only**. It is **not** live-Azure-validated and **not** approved for production or pilot deployment.

Report date: 2026-10-09. Source: supplied `FINOPS_COMMAND_CENTER_LOCAL_DEMO.zip` (SHA-256 `5bb5e0cd…a9693`, preserved unchanged). The initial implementation is listed in [CHANGE_MANIFEST.md](CHANGE_MANIFEST.md). The code now lives in the GitHub repository `akshaybarbhuvan/finops-command-center-azure-pilot`; later changes are tracked in Git history and pull requests (§3b).

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

### 3b. Deployment-readiness update (2026-10-09, branch `claude/github-actions-ci-failure-ytdv79`, observed in a Linux sandbox)

Changes: dependency remediation (DEP-1, DEP-4), CI audit gate raised to `high`, `deploy-pilot.yml` hardened (R-11), read-only `npm run preflight:azure`, workload tag and `publicOriginConfigured` output in `main.bicep`, `principalId` validation in `subscription-reader-access.bicep`, documentation aligned with the workflow, and a new [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md).

| Check | Result |
|---|---|
| `npm ci` from a clean `node_modules`; `npm ls` | success; dependency tree valid |
| `npm run typecheck` / `npm run lint` | pass / pass (0 warnings) |
| `npm test` | **18 files, 249/249 passed** (including the new `tests/pilot/deploy-scripts.test.ts`, 43 tests: confirmation/branch gate, variable validation, signed-in context, workload tag, FinThrive deny rules, `FCC_PUBLIC_ORIGIN` must be an exact https origin on one of the app's actual host names (legacy-vs-unique host name, http, path, port, unbound custom domain), missing `az`, health retry/failure, sign-in gate, preflight STOP/GO paths with a stubbed Azure CLI, workflow/template contracts) |
| `npm run validate:demo` | **READY 9/9** |
| `npm run validate:pilot` (`BICEP_BIN` resolved by the CI step itself) | **PASSED 19/19** |
| Bicep 0.48.1 `build` + `lint`, both templates | pass, no warnings |
| `npm audit --omit=dev --audit-level=high` (CI and deploy gate) | pass: production **0 high, 0 critical**, 3 moderate (DEP-3 chain: `sprintf-js`, `tedious`, `mssql`) |
| `npm audit` (full tree) | 10: **7 high** (DEP-2 chain: `braces`, `micromatch`, `fast-glob`, `chokidar`, `tailwindcss`, `@next/eslint-plugin-next`, `eslint-config-next`) and 3 moderate (DEP-3 chain). Before: 14 (8 high, 6 moderate) |
| Compiled CSS before/after the overrides (pilot and demo) | byte-identical (SHA-256 `66cc4bfb…`) |
| `check-deployment.mjs` against the real standalone pilot server (local fixtures) | pass: health 200 and anonymous `/overview` → 307 to `/.auth/login/aad` |
| actionlint 1.7.12 with ShellCheck 0.11.0, both workflows | clean |
| Mutation checks (the guard accepting `deploy`, the post-deploy check skipping the sign-in gate, the origin check accepting http) | all caught by the new tests |
| Compiled `main.bicep` | `FCC_PUBLIC_ORIGIN` = `reference(site).defaultHostName` when `publicOrigin` is empty; no `azurewebsites.net` literal; same 18 app settings as before |
| `deploy-pilot` against Azure, `preflight:azure` against a real subscription | **Not run** (no Azure access; deliberately out of scope) |

## 4. Live Azure verification

| Item | Status |
|---|---|
| Entra sign-in, app roles, tenant restriction | **Pending** (no tenant access) |
| Resource Graph inventory against approved subscriptions | **Pending** |
| Cost Management query (including `Cost` vs `PreTaxCost` column) | **Pending** |
| Advisor recommendations and savings fields | **Pending** |
| Azure SQL migrations, grant script and runtime queries | **Pending** (highest priority; tested only with a mocked driver) |
| Bicep `what-if` and deployment | **Pending** (needs an authorized session) |
| GitHub CI (`ci`) | **Run on GitHub-hosted runners**: green on `main` (merge of PR #1, run 37977969477), including Bicep build/lint and `validate:pilot` 19/19 |
| GitHub deployment workflow (`deploy-pilot`) | **Never run.** Its gates are tested offline with a stubbed Azure CLI (§3b); the `pilot` environment, variables and OIDC federation are not verified |

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
| R-10 | **High** (production dependency) + moderate | dependencies | `npm audit` findings: see the register in §5a (DEP-1 … DEP-4) | Audit output (§3, §3a, §3b) | **DEP-1 and DEP-4 remediated** with scoped npm `overrides` (no major upgrade of a direct dependency; compiled CSS byte-identical). DEP-2 and DEP-3 have **no patched release**; DEP-3 call-site review completed. **No formal risk acceptance has been recorded** for DEP-2 or DEP-3 | **Partly closed**: production has no high/critical findings; DEP-2/DEP-3 decisions pending (§5a) |
| R-11 | Low | `deploy-pilot.yml` | Tag-pinned actions; any branch could be dispatched; a wrong confirmation silently skipped the run; health check used a guessed `<name>.azurewebsites.net` URL; no check of the signed-in context or target | Code | Actions pinned to full commit SHAs. `guard` job fails (not skips) unless `confirm` = `DEPLOY` on `main`. Variables validated before login. Signed-in tenant and subscription, workload tag, FinThrive deny rules and `FCC_PUBLIC_ORIGIN` checked against the real web app. Post-deployment check uses the app's actual default host name and also verifies the Entra sign-in redirect. Concurrency limited to one deployment | `tests/pilot/deploy-scripts.test.ts` (stubbed `az`), actionlint 1.7.12 clean; **workflow not run against Azure** |
| R-12 | Low (raised: every change would be rejected if the host name differs) | `main.bicep`, `config.ts` | Default origin was built as `https://<site-name>.azurewebsites.net`, which is wrong when App Service assigns a unique default host name; sovereign-cloud SQL hosts accepted but ARM public only | Code | App settings moved to a `sites/config appsettings` child resource so the default `FCC_PUBLIC_ORIGIN` uses `site.properties.defaultHostName` (the name Azure assigned); `deploy-pilot` refuses a non-https or non-bare origin, or one that is not one of the app's host names; `publicOrigin` remains for custom domains; SQL host restricted to public cloud | Bicep build/lint ✓; compiled ARM contains no `azurewebsites.net` literal; deploy-guard tests ✓. **Live host-name behaviour not verified** (no deployment) |
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

**Open high: DEP-2** (`braces`, development/build tooling only, not in the deployed package; no patched release exists; decision required). Production dependencies: **no high or critical** findings (DEP-1 remediated); CI and the deploy build now fail on any. Open critical: none. Code-review defects R-1 … R-16 and I-1 … I-6 are fixed or have a recorded disposition. Open medium items needing a decision or live evidence: R-2 (live query plan), R-3 (verification policy), DEP-3 (production, moderate; not reachable per the call-site review; decision required).

## 5a. Dependency vulnerability register

Source: `npm audit` and `npm audit --omit=dev` (§3, §3a). The 14 audit entries come from **four vulnerable packages**; the other entries are packages flagged *because they depend on* one of those four. Transitive findings are not dismissed: each is assessed for whether it ships in the deployed artifact and how it could be reached.

"Ships" was checked by listing `.next-pilot/standalone/node_modules` after `npm run build:pilot`, which is the package deployed to App Service.

| ID | Vulnerable package (version) | Severity | Dependency type | Pulled in by | Ships in deployed package? | Practical impact for FCC | Mitigation in place | Owner / next action | Status |
|---|---|---|---|---|---|---|---|---|---|
| **DEP-1** | `postcss` 8.4.31 (nested under `next@15.5.27`, which pins it exactly; no Next.js 15.x release updates it) | **High.** XSS via unescaped `</style>` in CSS stringify output; arbitrary `.map` file read / path traversal via attacker-controlled `sourceMappingURL` (GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849) | Production | `next` | Previously yes | — | **Remediated:** `package.json` `overrides` → `"next": { "postcss": "$postcss" }` (8.5.29, same major line, not affected). Verified: `npm ls` valid; the standalone package ships 8.5.29 and no nested 8.4.31; pilot and demo compiled CSS byte-identical to before (SHA-256 `66cc4bfb…`); full test and smoke suite pass (§3b) | Engineering lead: drop the override when a Next.js release ships a fixed PostCSS | **Remediated** (no acceptance needed) |
| **DEP-2** | `braces` 3.0.3 (**latest published version; no patched release exists**) | **High.** Stack-exhaustion denial of service through deeply nested brace patterns (GHSA-vfj7-8cjw-p6xm) | **Development / build only** | `micromatch`, `chokidar` → `fast-glob`, `tailwindcss` 3.4.19, `@next/eslint-plugin-next` → `eslint-config-next` (**all 7 remaining high entries**) | **No** (not in the standalone package) | Affects developer machines and CI when building or linting. Input is glob patterns from repository configuration; a malicious contribution could at worst stall a build or CI job. No runtime exposure | CI runs in ephemeral runners with timeouts and read-only permissions; `main` protection and review of configuration changes (DEPLOYMENT_CHECKLIST H1) | **Only remedies:** Tailwind CSS 4 (a rewrite of the styling configuration, a separate project) and an `eslint-config-next` downgrade to 14.x (not acceptable). **Security owner + sponsor: decide (accept for the build environment with review date, or remediate first)** | **Open: decision required** |
| **DEP-3** | `sprintf-js` 1.1.3 (**latest published version; no patched release exists**) | **Moderate.** Denial of service through unbounded precision specifiers in the **format string** (GHSA-hp3w-g68c-fv3c) | **Production** | `tedious@18.6.2` → `mssql@11.0.2` (`tedious` and `mssql` are flagged as moderate because of it). The newest `tedious` (20.x) and `mssql` (12.x) still depend on it, so upgrading does not help | **Yes**: in the standalone package, used by the Azure SQL driver | **Call-site review complete (2026-10-09):** all 12 `sprintf` calls in `tedious/lib` (`login7-payload.js` ×4, `packet.js` ×3, `metadata-parser.js` ×2, `value-parser.js` ×2, `prelogin-payload.js` ×1) use **string-literal** format strings with fixed precision (`%d`, `%s`, `%02X`, `%04X`, `%08X`); `mssql/lib` and FCC code never call `sprintf`. The vulnerable path is therefore not reachable from FCC inputs | Database reachable only with Entra authentication; no user input reaches a format string | **Security owner + sponsor: decide (accept with review date, or require a driver change)**. Engineering: re-run the call-site grep on any `tedious` upgrade | **Open: decision required** |
| **DEP-4** | `postcss-selector-parser` 6.1.4 | **Moderate.** Quadratic-complexity CPU exhaustion in selector parsing (GHSA-rj75-hqrm-r3gf) | Development / build only | `postcss-nested` → `tailwindcss` | No | — | **Remediated:** `overrides` → `"postcss-selector-parser": "^7.1.6"`. The only 7.0 breaking change is "insertions during iteration are safe". Verified: compiled CSS for both builds is byte-identical to the 6.1.4 output; full suite passes | Engineering lead: re-check compiled CSS whenever Tailwind is upgraded | **Remediated** (no acceptance needed) |
| — | `next` 15.5.27 | Previously moderate (by dependency on DEP-1) | Production | — | Yes | See DEP-1 | — | — | Remediated with DEP-1 |
| — | `mssql` 11.0.2, `tedious` 18.6.2 | Moderate (by dependency on DEP-3) | Production | — | Yes | See DEP-3 | — | See DEP-3 | Open |
| — | `postcss-nested` 6.2.0 | Previously moderate (by dependency on DEP-4) | Development / build only | `tailwindcss` | No | See DEP-4 | — | — | Remediated with DEP-4 |
| — | `micromatch`, `fast-glob`, `chokidar`, `tailwindcss`, `@next/eslint-plugin-next`, `eslint-config-next` | High (by dependency on DEP-2) | Development / build only | — | No | See DEP-2 | — | See DEP-2 | Open |

**CI configuration (corrected).** `.github/workflows/ci.yml` and the `deploy-pilot` build now run `npm audit --omit=dev --audit-level=high`, so any high or critical production finding fails the pipeline. The earlier comment calling the PostCSS finding a "known, accepted exception … build-time only" has been removed: it was inaccurate, and no acceptance had been recorded. Remaining findings after this change: full tree 10 (7 high, 3 moderate: DEP-2 and DEP-3 chains); production 3 moderate (DEP-3 chain).

**Formal decision required before deployment for DEP-2 and DEP-3.** For each open DEP item, the accountable owner (security owner together with the business sponsor) must record: decision (accept / remediate first), justification, compensating controls, expiry or review date, and signature. Record it in the table below. Until then, deployment is not approved.

| ID | Decision | Accepted / decided by | Date | Review / expiry date |
|---|---|---|---|---|
| DEP-1 | Remediated in the repository (no acceptance required) | Engineering (pull request) | 2026-10-09 | Re-check on each Next.js upgrade |
| DEP-2 | Pending | | | |
| DEP-3 | Pending | | | |
| DEP-4 | Remediated in the repository (no acceptance required) | Engineering (pull request) | 2026-10-09 | Re-check on each Tailwind upgrade |

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
| — | No unresolved critical/high security finding (merge/deployment gate) | ◐ **Production met** (no high/critical; enforced by CI). **Not met overall:** DEP-2 (high, build tooling only) open, pending decision | §5a |
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
| DEP-2 / DEP-3: track upstream fixes (`braces`, `sprintf-js`); plan the Tailwind CSS 4 migration as its own change | Engineering lead | Review monthly |
| **Formal decision on DEP-2 and DEP-3** (§5a) | Security owner + business sponsor | **Before any deployment** |
| GitHub and Azure settings H1–H15 (DEPLOYMENT_CHECKLIST §3) | Repository admin, Entra admin, cloud admin, SQL admin | Before gate G2/G5 |
| R-13 private networking for production | Cloud architect | Before any production use |
