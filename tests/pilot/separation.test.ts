// @vitest-environment node
// The pilot build must be independent of the synthetic demo. This walks the import graph of every pilot entry
// point (route, layout, middleware, instrumentation) and fails if anything reaches demo data, demo authentication
// or demo-coupled UI. The build-level check (bundle scan) is in scripts/pilot/validate-pilot.mjs.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { log, redact, redactString } from "@/pilot/log";

const ROOT = path.join(process.cwd(), "src");
const FORBIDDEN = [/lib\/demo\/(store|seed|org|selectors|copilot|insights|access|filters|ticketing|validation|prng)/, /components\/shell\//, /components\/pages\//, /components\/data\/badges/, /components\/recommendations\//, /components\/dashboard\//, /lib\/rbac/, /lib\/app-mode/];

function entries(dir: string, out: string[] = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) entries(p, out);
    else if (/\.pilot\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null; // package
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return base + ext;
  return null;
}

function graph(start: string[]) {
  const seen = new Set<string>();
  const stack = [...start];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    // Type-only imports are erased at compile time and cannot carry data into the bundle.
    const src = fs.readFileSync(f, "utf8").replace(/^\s*(import|export)\s+type\s[^;]*;/gm, "");
    for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g)) {
      const r = resolveImport(f, m[1] ?? m[2] ?? m[3]);
      if (r) stack.push(r);
    }
  }
  return [...seen].map((f) => path.relative(ROOT, f).replace(/\\/g, "/"));
}

describe("pilot / demo separation", () => {
  const roots = entries(ROOT);
  const files = graph(roots);
  it("has pilot entry points for layout, middleware, instrumentation, pages and APIs", () => {
    const rel = roots.map((r) => path.relative(ROOT, r).replace(/\\/g, "/"));
    for (const must of ["app/layout.pilot.tsx", "middleware.pilot.ts", "instrumentation.pilot.ts", "app/overview/page.pilot.tsx", "app/api/recommendations/[id]/actions/route.pilot.ts"]) expect(rel).toContain(must);
  });
  it("never imports demo data, demo sign-in or demo-coupled UI", () => {
    const bad = files.filter((f) => FORBIDDEN.some((re) => re.test(f)));
    expect(bad).toEqual([]);
  });
  it("only shares pure, data-free modules with the demo", () => {
    const shared = files.filter((f) => f.startsWith("lib/") || (f.startsWith("components/") && !f.startsWith("components/pilot/")));
    expect(shared.sort()).toEqual(["components/charts/charts.tsx", "components/data/blocks.tsx", "components/ui/overlay.tsx", "components/ui/primitives.tsx", "lib/csv.ts"].filter((f) => shared.includes(f)).sort());
  });
  it("pilot code contains no write operations against Azure (read-only connectors)", () => {
    for (const f of files.filter((x) => x.startsWith("pilot/azure/"))) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      expect(src, f).not.toMatch(/"(PUT|PATCH|DELETE)"/);
    }
  });
});

describe("log redaction", () => {
  it("removes bearer tokens, JWTs, SAS signatures and secret-named fields", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9abc.eyJzdWIiOiIxMjM0NTY3ODkwIn0abc.c2lnbmF0dXJlLXNpZ25hdHVyZQ";
    expect(redactString(`Authorization: Bearer abc.def-ghi`)).not.toContain("abc.def-ghi");
    expect(redactString(`token ${jwt}`)).not.toContain(jwt);
    expect(redactString("https://x.blob.core.windows.net/c?sv=2020&sig=SECRETSIG&se=1")).not.toContain("SECRETSIG");
    expect(redact({ clientSecret: "s3cr3t", nested: { password: "p", ok: "fine" } })).toEqual({ clientSecret: "[redacted]", nested: { password: "[redacted]", ok: "fine" } });
  });
  it("logger output never contains a secret passed in fields", () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (l: string) => void lines.push(l);
    try {
      log.info("test.event", { authorization: "Bearer zzz", detail: "call with Bearer yyy.zzz" });
    } finally {
      console.log = orig;
    }
    expect(lines.join("")).not.toMatch(/zzz|yyy/);
  });
});
