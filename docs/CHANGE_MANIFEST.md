# Change manifest — Azure pilot implementation

Compared with the supplied `FINOPS_COMMAND_CENTER_LOCAL_DEMO.zip` (SHA-256 `5bb5e0cdcf82fcefb87b113e19e4d26701443f6524651148df4271745fea9693`, unchanged). Excludes `node_modules`, build output and generated `next-env.d.ts` / `tsconfig.tsbuildinfo`.

**97 added · 9 changed · 0 removed.** No demo source, page, component or demo test was modified; changed files are shared configuration and documentation only.

## Changed

- `.gitignore` — ignore pilot build output, local databases, env files, ZIPs
- `.nvmrc` — Node 22 LTS (Node 20 is end-of-life)
- `README.md` — "Start here" section for the pilot; demo section clarified
- `eslint.config.mjs` — ignore pilot build output and local data
- `next.config.mjs` — build targets (demo/pilot via pageExtensions), pilot standalone output, HSTS/COOP headers
- `package-lock.json` — lockfile for the dependencies above
- `package.json` — pilot scripts and dependencies (@azure/identity, mssql, zod, server-only; dev: better-sqlite3, tsx, @types/*)
- `tsconfig.json` — includes `.next-pilot/types` (pilot build type output)
- `vitest.config.mts` — alias for the server-only marker in tests

## Added

- **.env.pilot.example** (1): `.env.pilot.example`
- **.github** (2): `.github/workflows/ci.yml`, `.github/workflows/deploy-pilot.yml`
- **docs/ARCHITECTURE.md** (1): `docs/ARCHITECTURE.md`
- **docs/AZURE_SETUP.md** (1): `docs/AZURE_SETUP.md`
- **docs/DATA_DICTIONARY.md** (1): `docs/DATA_DICTIONARY.md`
- **docs/DEPLOYMENT.md** (1): `docs/DEPLOYMENT.md`
- **docs/LEADER_HANDOFF.md** (1): `docs/LEADER_HANDOFF.md`
- **docs/OPERATIONS.md** (1): `docs/OPERATIONS.md`
- **docs/PILOT_RUNBOOK.md** (1): `docs/PILOT_RUNBOOK.md`
- **docs/ROLLBACK_AND_RECOVERY.md** (1): `docs/ROLLBACK_AND_RECOVERY.md`
- **docs/SECURITY.md** (1): `docs/SECURITY.md`
- **infra** (3): `infra/main.bicep`, `infra/main.parameters.example.json`, `infra/subscription-reader-access.bicep`
- **scripts/pilot** (7): `scripts/pilot/build.mjs`, `scripts/pilot/dev-load-fixtures.ts`, `scripts/pilot/migrate.ts`, `scripts/pilot/sql/grant-app-identity.sql`, `scripts/pilot/start.mjs`, `scripts/pilot/sync.ts`, `scripts/pilot/validate-pilot.mjs`
- **src/app** (26): `src/app/admin/audit/page.pilot.tsx`, `src/app/admin/page.pilot.tsx`, `src/app/anomalies/page.pilot.tsx`, `src/app/api/health/route.pilot.ts`, `src/app/api/recommendations/[id]/actions/route.pilot.ts`, `src/app/api/recommendations/export/route.pilot.ts`, `src/app/api/sync/route.pilot.ts`, `src/app/budgets/page.pilot.tsx`, `src/app/cost/page.pilot.tsx`, `src/app/engineering/page.pilot.tsx`, `src/app/error.pilot.tsx`, `src/app/finops/page.pilot.tsx`, `src/app/governance/page.pilot.tsx`, `src/app/layout.pilot.tsx`, `src/app/no-access/page.pilot.tsx`, `src/app/not-found.pilot.tsx`, `src/app/optimization/page.pilot.tsx`, `src/app/overview/page.pilot.tsx`, `src/app/page.pilot.tsx`, `src/app/recommendations/[id]/page.pilot.tsx`, `src/app/recommendations/page.pilot.tsx`, `src/app/reports/page.pilot.tsx`, `src/app/resources/page.pilot.tsx`, `src/app/roadmap/page.pilot.tsx`, `src/app/savings/page.pilot.tsx`, `src/app/tickets/page.pilot.tsx`
- **src/components** (10): `src/components/pilot/ActionPanel.tsx`, `src/components/pilot/CostChart.tsx`, `src/components/pilot/NotConnected.tsx`, `src/components/pilot/Providers.tsx`, `src/components/pilot/RecTable.tsx`, `src/components/pilot/Shell.tsx`, `src/components/pilot/SyncButton.tsx`, `src/components/pilot/UserMenu.tsx`, `src/components/pilot/guard.tsx`, `src/components/pilot/ui.tsx`
- **src/instrumentation.pilot.ts** (1): `src/instrumentation.pilot.ts`
- **src/middleware.pilot.ts** (1): `src/middleware.pilot.ts`
- **src/pilot** (26): `src/pilot/auth/middleware-principal.ts`, `src/pilot/auth/permissions.ts`, `src/pilot/auth/principal.ts`, `src/pilot/azure/advisor.ts`, `src/pilot/azure/arm.ts`, `src/pilot/azure/costManagement.ts`, `src/pilot/azure/resourceGraph.ts`, `src/pilot/azure/token.ts`, `src/pilot/config.ts`, `src/pilot/db/index.ts`, `src/pilot/db/migrations.ts`, `src/pilot/db/mssql.ts`, `src/pilot/db/sqlite.ts`, `src/pilot/db/types.ts`, `src/pilot/http/api.ts`, `src/pilot/ids.ts`, `src/pilot/log.ts`, `src/pilot/money.ts`, `src/pilot/queries/portfolio.ts`, `src/pilot/queries/recommendations.ts`, `src/pilot/queries/scope.ts`, `src/pilot/session.ts`, `src/pilot/sync/runtime.ts`, `src/pilot/sync/service.ts`, `src/pilot/workflow/rules.ts`, `src/pilot/workflow/service.ts`
- **tests/pilot** (10): `tests/pilot/api.test.ts`, `tests/pilot/config-auth.test.ts`, `tests/pilot/connectors.test.ts`, `tests/pilot/fixtures/azure.ts`, `tests/pilot/helpers.ts`, `tests/pilot/money-migrations.test.ts`, `tests/pilot/mssql-adapter.test.ts`, `tests/pilot/separation.test.ts`, `tests/pilot/sync.test.ts`, `tests/pilot/workflow.test.ts`
- **tests/support** (1): `tests/support/server-only.ts`

## Removed

- None.

