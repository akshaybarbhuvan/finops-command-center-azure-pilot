// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware, ssoRequiredHtml } from "@/middleware";

const saved = { APP_MODE: process.env.APP_MODE, NODE_ENV: process.env.NODE_ENV };
const env = process.env as Record<string, string | undefined>;
afterEach(() => {
  env.APP_MODE = saved.APP_MODE;
  env.NODE_ENV = saved.NODE_ENV;
});
const call = (path: string) => middleware(new NextRequest(`http://localhost${path}`));

describe("request gate — nothing from the demo is served outside demo mode", () => {
  it.each(["pilot", "production", "PILOT", "unknown-value"])("APP_MODE=%s blocks pages and app chunks", async (mode) => {
    env.APP_MODE = mode;
    for (const path of ["/login", "/login?reset=1", "/overview", "/recommendations/REC-2041", "/_next/static/chunks/app/login/page.js"]) {
      const res = call(path);
      expect(res.status, path).toBe(401);
      const html = await res.text();
      expect(html).toContain("single sign-on");
      expect(html).not.toMatch(/Priya|Marcus|Simulated local sign-in|Demo account|REC-2041/);
    }
  });

  it("an unset APP_MODE in a production server fails closed", () => {
    env.APP_MODE = "";
    env.NODE_ENV = "production";
    expect(call("/login").status).toBe(401);
  });

  it("demo mode passes requests through", () => {
    env.APP_MODE = "demo";
    const res = call("/login");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("covers every path and reads the environment at request time", () => {
    expect(config.matcher).toBe("/:path*");
    expect(config.runtime).toBe("nodejs");
    expect(ssoRequiredHtml("production")).toContain("<strong>production</strong>");
  });
});
