// Outside demo mode, no part of the demo application is served — not its pages, not its JavaScript chunks.
// Every request (including /_next assets) receives a self-contained single sign-on notice, so demo accounts,
// the simulated login and the illustrative dataset can never be downloaded in pilot or production mode.
// The root layout's PilotGate remains as a second, independent layer.
import { NextResponse, type NextRequest } from "next/server";
import { isDemoBypassAllowed, resolveAppMode, type AppMode } from "@/lib/app-mode";

export function ssoRequiredHtml(mode: AppMode): string {
  const label = mode === "production" ? "production" : "pilot";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>FinOps Command Center</title>
<style>
:root{color-scheme:light}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0B1220;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px;box-sizing:border-box}
main{max-width:420px;width:100%;background:#fff;border-radius:16px;padding:32px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,.35)}
h1{margin:0;font-size:18px;color:#0f172a}p{margin:6px 0 0;font-size:14px;color:#64748b;line-height:1.5}
.m{margin-top:20px;color:#334155}.s{margin-top:12px;font-size:12px}.bar{height:4px;width:48px;margin:0 auto 18px;border-radius:2px;background:#0072CE}
</style></head>
<body><main><div class="bar" aria-hidden="true"></div><h1>FinOps Command Center</h1>
<p>Enterprise FinOps Governance &amp; Optimization Platform</p>
<p class="m">This environment is running in <strong>${label}</strong> mode. Sign-in through your organization's single sign-on is required.</p>
<p class="s">Local demo sign-in and illustrative data are available only when APP_MODE=demo on a local workstation.</p>
</main></body></html>`;
}

export function middleware(req: NextRequest) {
  void req;
  const mode = resolveAppMode({ APP_MODE: process.env.APP_MODE, NODE_ENV: process.env.NODE_ENV });
  if (isDemoBypassAllowed(mode)) return NextResponse.next();
  return new NextResponse(ssoRequiredHtml(mode), {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

// Node.js runtime so APP_MODE is read from the real server environment at request time (never inlined at build).
export const config = { matcher: "/:path*", runtime: "nodejs" };
