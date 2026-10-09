// Two separate build targets share one codebase:
//   demo  (default) – the local synthetic-data demonstration: route files named page.tsx / route.ts / middleware.ts
//   pilot           – the Azure-connected pilot: only *.pilot.tsx / *.pilot.ts files are routes
// Because Next.js only compiles files matching `pageExtensions`, a pilot build contains no demo pages,
// demo middleware or demo data, and a demo build contains no pilot routes. FCC_BUILD_TARGET is read at build
// time and when the server starts (it selects the matching output directory).
const target = (process.env.FCC_BUILD_TARGET ?? "demo").trim().toLowerCase();
if (target !== "demo" && target !== "pilot") {
  throw new Error(`FCC_BUILD_TARGET must be "demo" or "pilot" (got "${target}")`);
}
const pilot = target === "pilot";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];
const pilotOnlyHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Content-Security-Policy is set per request with a nonce by src/middleware.pilot.ts.
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  pageExtensions: pilot ? ["pilot.tsx", "pilot.ts"] : ["tsx", "ts"],
  distDir: pilot ? ".next-pilot" : ".next",
  ...(pilot ? { output: "standalone", serverExternalPackages: ["mssql", "tedious", "better-sqlite3"] } : {}),
  async headers() {
    return [{ source: "/:path*", headers: pilot ? [...securityHeaders, ...pilotOnlyHeaders] : securityHeaders }];
  },
};
export default nextConfig;
