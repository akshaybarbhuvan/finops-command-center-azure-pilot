# Security — FCC Azure pilot

## 1. Authentication

- **Microsoft Entra ID through Azure App Service Authentication.** Configured by `infra/main.bicep` (`authsettingsV2`):
  - tenant-specific issuer (`https://login.microsoftonline.com/<tenant>/v2.0`);
  - `requireAuthentication = true`, unauthenticated users redirected to sign-in, and only `/api/health` excluded;
  - HTTPS required;
  - token store enabled;
  - client secret held only in Key Vault (Key Vault reference).
- The application trusts only the `X-MS-CLIENT-PRINCIPAL` header. Microsoft documents that *"external requests aren't allowed to set these headers, so they're present only if App Service sets them"*. Defence in depth:
  - `src/pilot/config.ts` refuses to serve on App Service unless `WEBSITE_AUTH_ENABLED=True`;
  - `src/pilot/auth/principal.ts` requires identity provider `aad`, the configured **tenant ID** claim and a GUID **object ID**;
  - oversized or malformed headers are rejected.
- **No bypass in the pilot build.** The demo's simulated login, demo accounts and demo data are not compiled into the pilot build (`pageExtensions`). This is verified by `tests/pilot/separation.test.ts` and by the bundle scan in `npm run validate:pilot`.
- Outside App Service the app refuses to trust the identity header at all, unless `FCC_LOCAL_VALIDATION=true` is set together with a localhost origin (offline validation only). A pilot build accidentally run on a VM or container therefore fails closed.
- The development principal (`FCC_AUTH_MODE=development`) is honoured only under `next dev` and never on App Service. Configuration validation enforces this and it is tested.
- Sign-out: `/.auth/logout`.

## 2. Authorization (server-side, every request)

| Control | Implementation | Tests |
|---|---|---|
| Role mapping only from Entra app roles `FCC.*` | `rolesFromValues` | `config-auth.test.ts` |
| Permission per role | `src/pilot/auth/permissions.ts` | `config-auth.test.ts` |
| Row-level scope (Engineering sees only `owner_id = self`) applied in SQL **before** filters, counts, pagination and export | `recWhere`, `loadVisibleRec` | `workflow.test.ts`, `api.test.ts`, server smoke tests |
| Out-of-scope and missing IDs return the same 404 | `loadVisibleRec`, detail page `notFound()` | `api.test.ts` |
| Role + stage + owner rules for every action | `availability()` in `rules.ts`, re-checked in the transaction | `workflow.test.ts` |
| Separation of duties: owner or implementer cannot verify or decline their own savings, even with the FinOps role; Admin and Executive cannot verify | `availability()` | `workflow.test.ts` |
| Executive and Admin: no business mutations | permission model | `workflow.test.ts`, `api.test.ts`, smoke tests |
| Mass assignment / over-posting | strict Zod schemas (`.strict()`) | `workflow.test.ts` |
| Optimistic concurrency | `version` check in `UPDATE … WHERE version = @v` | `workflow.test.ts` |
| Assignment only to signed-in users holding `FCC.Engineering` | `applyAction` | `workflow.test.ts` |

## 3. Web application controls

| Risk | Control |
|---|---|
| CSRF | Mutations require same origin (`Origin` = `FCC_PUBLIC_ORIGIN`, or `Sec-Fetch-Site: same-origin`), `Content-Type: application/json` and the `X-FCC-Request: 1` header (a custom header forces a CORS preflight, which the application never approves) |
| XSS | React output encoding; per-request **nonce Content-Security-Policy** (`script-src 'self' 'nonce-…'`, no inline scripts without the nonce); only `https://` links are accepted for ticket/evidence/learn-more URLs; links open with `rel="noopener noreferrer nofollow"` |
| Clickjacking | `X-Frame-Options: DENY`, `frame-ancestors 'none'` |
| Transport | HTTPS only, HSTS, TLS 1.2 minimum (App Service and SQL) |
| Injection | Parameterized SQL only (`@name` parameters); filter inputs validated against allow-lists |
| Unbounded requests | Server-side pagination (25/50/100), exports capped at 10,000 rows, request bodies ≤ 32 KB, per-user rate limits (workflow 30/min, export 2/min, refresh 3 per ~30 min) |
| SSRF | ARM client calls only `https://management.azure.com`; pagination links to other hosts are rejected |
| Error leakage | Sanitized JSON errors with a request ID; Azure error bodies are never surfaced (only the HTTP status and ARM error code) |
| Sensitive logs | Structured logger redacts bearer tokens, JWTs, SAS signatures and secret-named fields (`log.ts`, tested) |
| CORS | No CORS headers are set; cross-origin browser calls are not allowed |
| Publishing credentials | FTP and SCM basic authentication disabled (Bicep) |

## 4. Azure access (least privilege)

- The runtime managed identity is **read-only** on approved subscriptions (Reader + Cost Management Reader). The client code contains no PUT/PATCH/DELETE (tested). No remediation is implemented.
- Queries are pinned to the configured subscription IDs. No user input can change scope.
- Azure SQL: Entra-only authentication (no SQL logins or passwords). The app user has read/write only, no DDL, and UPDATE/DELETE are denied on `audit_events`, `rec_events`, `evidence` and `verifications`. Migrations run separately with the SQL admin group.
- Separate deployment identity (GitHub OIDC, Website Contributor on the web app) from the runtime identity.

## 5. Secrets

- None in source, templates or CI. `.env*` (except the two example templates), `*.pem`, `*.pfx`, local databases and ZIPs are git-ignored.
- The only application secret is the Entra client secret for App Service Authentication, stored in Key Vault (RBAC, soft delete, purge protection).
- GitHub uses OIDC; no Azure secret is stored in GitHub.

## 6. Review results and residual risks

The independent review is recorded in [PILOT_READINESS_REPORT.md](PILOT_READINESS_REPORT.md) §5. Residual risks accepted for a controlled pilot (owners in the report):

| Risk | Why accepted / mitigation |
|---|---|
| Azure SQL allows "Azure services" through its firewall (`sqlAllowAzureServices=true`), i.e. any Azure-hosted client can attempt to connect | Entra-only authentication; TLS; auditing to Log Analytics. Production: VNet integration and a private endpoint |
| Key Vault and web app use public endpoints | RBAC; App Service Authentication; production: private networking |
| In-memory rate limiting is per instance | Pilot runs one instance; use Azure Front Door / API Management for production |
| `style-src 'unsafe-inline'` in the CSP | Required by chart/inline styles; script execution remains nonce-restricted |
| **Open dependency vulnerabilities** (not fixed; **not yet formally accepted**). Full tree: 14 (8 high, 6 moderate). Production: 5 (1 high, 4 moderate). Production high: `postcss` 8.4.31 nested in `next` 15.5.27, which **is included in the deployed package** (runtime use not established). Production moderate: `sprintf-js` via `mssql`/`tedious`, used at runtime. Build/dev only: `braces` (high), `postcss-selector-parser` (moderate) | FCC processes no user-supplied CSS, and the inspected driver call sites use fixed format strings. `npm audit fix` did not resolve them; the remaining fixes are breaking upgrades. **Formal risk acceptance or remediation is required before deployment.** Register, owners and next actions: PILOT_READINESS_REPORT §5a |
| Entra client secret expiry | Calendar rotation (OPERATIONS.md); consider certificate or federated credentials later |
| Azure SQL code path not yet executed against a real database | Must pass DEPLOYMENT step 9 before go-live |
| Verified savings are FinOps-attested (reviewer-entered figures, not reconciled with billing); one independent reviewer suffices | Separation of duties enforced; figures, windows, method, source reference and reviewer are audited and append-only. A second approver is a policy decision (LEADER_HANDOFF D3) |
| Role changes in Entra take effect at the user's next sign-in (App Service session); owner eligibility uses the roles recorded at last sign-in | Revoke access by removing the app assignment and ending sessions; review assignments monthly |
| Deployment identity (Website Contributor) can change app settings and authentication | `pilot` environment with required reviewers, restricted to `main`; OIDC only |
| GitHub Actions pinned to tags, not commit SHAs | Pin to SHAs when the repository is created |
