# Architecture — FinOps Command Center Azure pilot

Status of every statement here: **implemented and tested offline** unless marked *pending live validation* or *not implemented*. See [PILOT_READINESS_REPORT.md](PILOT_READINESS_REPORT.md) for the evidence.

## 1. One codebase, two separate builds

| Build | Command | Route files compiled | Data | Sign-in | Purpose |
|---|---|---|---|---|---|
| **Demo** (unchanged) | `npm run build` / `npm run demo` | `page.tsx`, `route.ts`, `middleware.ts` | Deterministic synthetic data in the browser | Simulated local account picker | Local leadership demonstrations |
| **Pilot** | `npm run build:pilot` | only `*.pilot.tsx` / `*.pilot.ts` | Azure Resource Graph, Cost Management, Advisor → FCC database | Microsoft Entra ID via App Service Authentication | Single-organization Azure pilot |

The separation is enforced by Next.js `pageExtensions` (`next.config.mjs`, selected by `FCC_BUILD_TARGET`):

- A pilot build physically contains no demo page, demo middleware, demo sign-in or demo data. This is checked by `tests/pilot/separation.test.ts` (import graph) and by `npm run validate:pilot` (scans the built bundle for demo markers).
- The pilot cannot "fall back" to synthetic data, because that code is not in the build. Missing configuration produces an explicit 503 page.
- A demo build contains no pilot routes. The demo's own middleware still refuses to serve when `APP_MODE` is not `demo`.

## 2. Runtime components (pilot)

```
 Browser ──HTTPS──▶ Azure App Service (Linux, Node 22)
                    │  App Service Authentication (Entra ID, single tenant)  ← sign-in, session cookie, X-MS-CLIENT-PRINCIPAL
                    │  Next.js standalone server (`node server.js`)
                    │    middleware.pilot.ts   config check · authenticated? · per-request CSP nonce
                    │    pages (*.pilot.tsx)   server components; every page re-checks role + row scope
                    │    API routes            /api/recommendations/[id]/actions · /api/sync · /api/recommendations/export · /api/health
                    │    instrumentation       optional scheduled refresh (FCC_SYNC_INTERVAL_MINUTES)
                    │  System-assigned managed identity
                    ├──▶ Azure SQL Database (Entra-only auth, db_datareader/db_datawriter, history tables append-only)
                    ├──▶ management.azure.com  (read-only: Resource Graph, Cost Management query, Advisor)
                    ├──▶ Key Vault (Entra client secret for App Service Authentication only)
                    └──▶ Application Insights / Log Analytics (logs, HTTP logs, audit)
```

Source layout:

| Path | Responsibility |
|---|---|
| `src/pilot/config.ts` | Validates all `FCC_*` settings; fails closed; never echoes values |
| `src/pilot/auth/` | Entra principal parsing (App Service headers), role mapping, permission model, row scope |
| `src/pilot/azure/` | Read-only ARM client (timeouts, retries, rate-limit headers, host allow-list) + Resource Graph, Cost Management, Advisor connectors with pure normalizers |
| `src/pilot/sync/` | Synchronization service (per source × subscription runs, lease locks, reconciliation policies) and scheduler |
| `src/pilot/db/` | Database interface, Azure SQL (`mssql`) and local SQLite adapters, versioned migrations |
| `src/pilot/workflow/` | Workflow rules (shared with UI) and the transactional workflow service |
| `src/pilot/queries/` | Scoped, paginated read models for pages and exports |
| `src/pilot/http/api.ts` | API wrapper: auth, CSRF, rate limit, sanitized errors |
| `src/app/**/*.pilot.tsx`, `src/components/pilot/` | Pilot UI (reuses the design-system primitives; no demo data modules) |
| `infra/` | Bicep templates |
| `scripts/pilot/` | Build, start, migrate, sync, local fixture loader, validation |

## 3. Trust boundaries and identities

| Identity | Used for | Rights | Where defined |
|---|---|---|---|
| **Pilot users** (Entra) | Sign-in | FCC role from Entra app-role assignment (`FCC.Executive`, `FCC.FinOps`, `FCC.Engineering`, `FCC.Admin`) | Entra admin center |
| **Web app managed identity** (runtime) | Azure reads, Azure SQL, Key Vault reference | Reader + Cost Management Reader per approved subscription; Key Vault Secrets User on the pilot vault; db_datareader/db_datawriter (history tables: UPDATE/DELETE denied) | `infra/main.bicep`, `infra/subscription-reader-access.bicep`, `scripts/pilot/sql/grant-app-identity.sql` |
| **SQL admin group** (Entra) | Migrations, DB user setup | SQL server Entra admin | `main.bicep` parameter |
| **Deployment identity** (GitHub OIDC) | Deploy app package | Website Contributor on the web app | `.github/workflows/deploy-pilot.yml`, AZURE_SETUP.md |

The runtime identity never holds write roles on customer subscriptions. The connectors' HTTP client exposes only GET and query-POST, and only to `https://management.azure.com`; tests assert there are no write verbs.

## 4. Data flow and storage

1. **Refresh** (scheduled, manual by FinOps/Admin, or `npm run sync:pilot`) runs three sources for each approved subscription. Each (source, subscription) pair produces one `sync_runs` row: `success | partial | failed | unauthorized`.
2. **Inventory**: Resource Graph `Resources` table, paged 1,000 rows at a time. The key is a SHA-256 of the lower-cased full resource ID. Before querying, the subscription's visibility is checked (Resource Graph silently returns nothing for subscriptions it cannot see). After a complete run, resources not seen are marked `is_present = 0`.
3. **Cost**: Cost Management `query` with `ActualCost` and `AmortizedCost`, Daily granularity, window = first day of previous month → today (UTC). After a complete fetch for one cost type, that window is replaced atomically. `cost_windows` records exactly which days were retrieved, so "no data" is never shown as zero.
4. **Advisor**: recommendations in the configured categories (default `Cost`), keyed by the Advisor recommendation's full ARM ID. Source fields update in place and FCC workflow fields are never touched. Recommendations missing from a complete run are flagged `not_returned`, not deleted.
5. **Workflow** actions are applied in one database transaction. Each action updates the recommendation (optimistic `version` check), appends `rec_events`, appends `audit_events`, and writes `evidence` / `verifications` where relevant.

Tables: `users, resources, cost_daily, cost_windows, recommendations, rec_events, evidence, verifications, audit_events, sync_runs, sync_locks, schema_migrations`. See `src/pilot/db/migrations.ts`.

## 5. Key decisions

| Decision | Reason | Alternatives considered |
|---|---|---|
| App Service Authentication (Easy Auth) for Entra sign-in | Platform-managed OIDC; no token-handling code in the app; tenant-restricted issuer; headers cannot be set by external requests (Microsoft docs) | next-auth / MSAL in-app (more custom security code; next-auth v5 still pre-release) |
| Azure SQL with Entra-only auth | Matches project standard (Azure SQL in production); no passwords | PostgreSQL Flexible Server |
| SQLite only for local validation | Allows offline end-to-end testing of the real code paths; refused on App Service | — |
| Separate builds via `pageExtensions` | Makes mock fallback impossible by construction | Runtime flag (demo code would still ship) |
| In-process scheduler + DB lease lock | Smallest viable option for a pilot; safe with several instances | Azure Functions timer (more infrastructure) |
| Money as integer micro-units per currency | Exact sums; currencies never mixed | Floating point (drift) |
| Manual refresh runs in the background and returns 202 | A full refresh can exceed the App Service request timeout | Synchronous request |

## 6. Not implemented in this release

- Cost Management **forecast** and **budgets** (shown as "not connected").
- **Resource-level cost** attribution and **automatic** savings measurement. Verification uses reviewer-entered before/after figures from Cost Management or invoices.
- External **ticketing / change-management** integration. References are recorded manually and labelled as such.
- **Anomalies, governance scoring, commitments utilization, packaged reports**: shown as "not connected".
- Manually created (non-Advisor) recommendations, and any **Azure remediation** (by design).
- Multi-tenant SaaS, other clouds.
- Private networking (VNet integration / private endpoints). See SECURITY.md residual risks.
