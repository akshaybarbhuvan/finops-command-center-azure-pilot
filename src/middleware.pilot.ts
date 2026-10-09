// Pilot build only (see next.config.mjs). Runs on every request in the Node.js runtime.
// 1. Liveness probe is anonymous and reveals nothing.
// 2. Incomplete configuration fails closed (no page or API is served; nothing falls back to demo data).
// 3. Unauthenticated requests are sent to Microsoft Entra sign-in (pages) or rejected with 401 (APIs).
// Authorization is NOT decided here: every page and API re-resolves the principal and checks permissions itself.
import { NextResponse, type NextRequest } from "next/server";
import { pilotConfig } from "./pilot/config";
import { resolvePrincipalForMiddleware } from "./pilot/auth/middleware-principal";

const PUBLIC = new Set(["/api/health"]);

function page(status: number, title: string, body: string) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FinOps Command Center</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F4F8FC;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px;box-sizing:border-box}main{max-width:560px;width:100%;background:#fff;border:1px solid #dbe4ef;border-radius:14px;padding:28px}h1{margin:0 0 6px;font-size:18px;color:#0f172a}p,li{font-size:14px;color:#334155;line-height:1.5}code{font-size:13px}.bar{height:4px;width:48px;border-radius:2px;background:#0072CE;margin-bottom:16px}</style></head>
<body><main><div class="bar"></div><h1>${title}</h1>${body}</main></body></html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" } });
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC.has(path) || path.startsWith("/_next/static/") || path === "/favicon.ico") return NextResponse.next();
  const isApi = path.startsWith("/api/");

  const cfg = pilotConfig();
  if (!cfg.ok) {
    if (isApi) return NextResponse.json({ error: "configuration_incomplete" }, { status: 503, headers: { "cache-control": "no-store" } });
    return page(
      503,
      "Pilot configuration is incomplete",
      `<p>The application will not serve data until an administrator completes the configuration. No demonstration data is used as a fallback.</p><ul>${cfg.problems.map((p) => `<li><code>${esc(p)}</code></li>`).join("")}</ul><p>See <code>docs/AZURE_SETUP.md</code>.</p>`,
    );
  }

  const p = resolvePrincipalForMiddleware((n) => req.headers.get(n), cfg.config);
  if (p.kind === "anonymous") {
    if (isApi) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: { "cache-control": "no-store" } });
    if (cfg.config.authMode === "appservice") {
      const target = `${path}${req.nextUrl.search}`;
      return NextResponse.redirect(new URL(`/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(target)}`, cfg.config.publicOrigin));
    }
    return page(401, "Sign-in required", "<p>No development principal is configured (FCC_DEV_PRINCIPAL_JSON).</p>");
  }
  if (p.kind === "rejected") {
    if (isApi) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "cache-control": "no-store" } });
    return page(403, "Access denied", "<p>Your sign-in is not accepted by this pilot (wrong organization or identity provider). Contact the pilot administrator.</p>");
  }
  // Strict, per-request Content-Security-Policy. Next.js reads the nonce from the request header and applies it
  // to its own scripts; inline scripts without the nonce are blocked.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("content-security-policy", csp);
  return res;
}

export function contentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export const config = { matcher: "/:path*", runtime: "nodejs" };
