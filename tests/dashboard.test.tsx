import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const push = vi.fn();
const replace = vi.fn();
let pathname = "/overview";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

import { DemoProvider, useDemoSession } from "@/lib/demo/store";
import { ToastProvider } from "@/components/ui/overlay";
import { ExecutiveOverview } from "@/components/pages/ExecutiveOverview";
import { AppShell } from "@/components/shell/AppShell";
import { RecommendationDetail } from "@/components/pages/RecommendationDetail";
import LoginPage from "@/app/login/page";
import { getSeedDataset } from "@/lib/demo/seed";

const SESSION_KEY = "fcc.demo.session.v1";

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <DemoProvider clientLabel="Enterprise Client Demo">
      <ToastProvider>{children}</ToastProvider>
    </DemoProvider>
  );
}

/** Signs a demo account in through the public session API, then renders children. */
function As({ userId, children }: { userId: string; children: React.ReactNode }) {
  const { user, hydrated, signIn } = useDemoSession();
  if (!hydrated) return null;
  if (!user) {
    signIn(userId);
    return null;
  }
  return <>{children}</>;
}

function SessionProbe() {
  const { user, hydrated, fullDs, signIn, signOut, dispatch } = useDemoSession();
  return (
    <div>
      <span data-testid="hydrated">{String(hydrated)}</span>
      <span data-testid="user">{user?.id ?? "none"}</span>
      <span data-testid="hero">{fullDs.recommendations.find((r) => r.id === "REC-2041")!.stage}</span>
      <button onClick={() => signIn("u-finops")}>in-finops</button>
      <button onClick={() => signIn("u-com1")}>in-unlisted</button>
      <button onClick={() => dispatch({ kind: "assign", recId: "REC-2041", ownerId: "u-priya" })}>route</button>
      <button onClick={signOut}>out</button>
    </div>
  );
}

afterEach(() => cleanup());
beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
  replace.mockClear();
  pathname = "/overview";
  window.history.replaceState(null, "", "/");
});

describe("simulated local sign-in", () => {
  it("never signs anyone in automatically", async () => {
    render(
      <Wrap>
        <SessionProbe />
      </Wrap>,
    );
    await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("accepts only the four demo accounts", async () => {
    render(
      <Wrap>
        <SessionProbe />
      </Wrap>,
    );
    await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
    act(() => fireEvent.click(screen.getByText("in-unlisted")));
    expect(screen.getByTestId("user").textContent).toBe("none");
    act(() => fireEvent.click(screen.getByText("in-finops")));
    expect(screen.getByTestId("user").textContent).toBe("u-finops");
  });

  it("logout ends the session but keeps workflow data", async () => {
    render(
      <Wrap>
        <SessionProbe />
      </Wrap>,
    );
    await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
    act(() => fireEvent.click(screen.getByText("in-finops")));
    act(() => fireEvent.click(screen.getByText("route")));
    expect(screen.getByTestId("hero").textContent).toBe("assigned");
    act(() => fireEvent.click(screen.getByText("out")));
    expect(screen.getByTestId("user").textContent).toBe("none");
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.getByTestId("hero").textContent).toBe("assigned");
    cleanup();
    render(
      <Wrap>
        <SessionProbe />
      </Wrap>,
    );
    await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
    expect(screen.getByTestId("hero").textContent).toBe("assigned");
  });

  it("?reset=1 restores the seed and never authenticates", async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: "u-finops" }));
    window.history.replaceState(null, "", "/login?reset=1&focus=1");
    render(
      <Wrap>
        <SessionProbe />
      </Wrap>,
    );
    await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
    expect(screen.getByTestId("user").textContent).toBe("none");
    expect(screen.getByTestId("hero").textContent).toBe("validated");
    expect(window.location.search).toBe("");
  });

  it("login page shows the demo banner, five accounts and the not-Entra note", async () => {
    pathname = "/login";
    render(
      <Wrap>
        <LoginPage />
      </Wrap>,
    );
    expect(await screen.findByText(/Enterprise FinOps Governance & Optimization/)).toBeTruthy();
    expect(screen.getByText(/Local demo \| Illustrative data/i)).toBeTruthy();
    expect(within(screen.getByRole("radiogroup", { name: "Demo account" })).getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByText(/not Microsoft Entra ID/)).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Sign in/ }));
    await waitFor(() => expect(push.mock.calls.length + replace.mock.calls.length).toBeGreaterThan(0));
    const target = [...push.mock.calls, ...replace.mock.calls].map((c) => c[0]).pop();
    expect(target).toBe("/overview");
  });

  it("protected routes redirect to /login when signed out", async () => {
    pathname = "/finops";
    render(
      <Wrap>
        <AppShell>
          <p>secret content</p>
        </AppShell>
      </Wrap>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(String(replace.mock.calls[0][0])).toMatch(/^\/login/);
    expect(screen.queryByText("secret content")).toBeNull();
  });
});

describe("UI smoke", () => {
  it("renders the executive dashboard with KPIs, insights and the savings drill-down", async () => {
    render(
      <Wrap>
        <As userId="u-exec">
          <ExecutiveOverview />
        </As>
      </Wrap>,
    );
    expect(await screen.findByRole("heading", { name: "Executive Overview" })).toBeTruthy();
    expect(screen.getAllByText("Savings opportunity").length).toBeGreaterThan(0);
    expect(screen.getByText("What leadership should know")).toBeTruthy();
    expect(screen.getByText("Decisions required")).toBeTruthy();
    expect(screen.getByText("Savings drill-down")).toBeTruthy();
    expect(screen.getByText("Estimated (open pipeline)")).toBeTruthy();
    expect(screen.getByText("Verified (realized)")).toBeTruthy();
    // Drill product → owner → recommendation.
    const product = screen.getAllByRole("button", { name: /^Drill into / })[0];
    fireEvent.click(product);
    const owner = screen.getAllByRole("button", { name: /^Drill into / })[0];
    fireEvent.click(owner);
    expect(screen.getByRole("navigation", { name: "Drill-down path" }).textContent).toMatch(/All products/);
    expect(document.querySelectorAll('a[href^="/recommendations/REC-"]').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/NaN|\$undefined/);
  });

  it("shows the signed-in identity, demo banner and account menu in the shell", async () => {
    pathname = "/engineering";
    render(
      <Wrap>
        <As userId="u-priya">
          <AppShell>
            <p>content</p>
          </AppShell>
        </As>
      </Wrap>,
    );
    expect(await screen.findByText("content")).toBeTruthy();
    expect(screen.getAllByText(/Local demo • Illustrative data/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Local Demo Persona/i)).toBeNull();
    fireEvent.click(screen.getAllByText("Priya Raman")[0].closest("button")!);
    const menu = screen.getByRole("menu", { name: "Account" });
    expect(within(menu).getByText("Switch demo user")).toBeTruthy();
    expect(within(menu).getByText("Log out")).toBeTruthy();
    expect(within(menu).queryByText("Reset demo data")).toBeNull();
  });

  it("renders the hero recommendation detail for FinOps with the routing action", async () => {
    render(
      <Wrap>
        <As userId="u-finops">
          <RecommendationDetail id="REC-2041" />
        </As>
      </Wrap>,
    );
    expect(await screen.findByRole("heading", { name: /Rightsize SAP HANA scale set/ })).toBeTruthy();
    expect(screen.getByText("What")).toBeTruthy();
    expect(screen.getByText("Why")).toBeTruthy();
    expect(screen.getByText("$1,082,592")).toBeTruthy();
    expect(screen.getByText("Next action")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Route to owner/ }).length).toBeGreaterThan(0);
  });

  it("shows not-found without leaking a recommendation owned by another engineer", async () => {
    const foreign = getSeedDataset().recommendations.find((r) => r.ownerId === "u-com1")!;
    render(
      <Wrap>
        <As userId="u-priya">
          <RecommendationDetail id={foreign.id} />
        </As>
      </Wrap>,
    );
    await screen.findByText(new RegExp(`${foreign.id} is not available`));
    expect(screen.queryByText(foreign.title)).toBeNull();
  });

  it("leadership sees no workflow buttons on the hero detail", async () => {
    render(
      <Wrap>
        <As userId="u-exec">
          <RecommendationDetail id="REC-2041" />
        </As>
      </Wrap>,
    );
    expect(await screen.findByRole("heading", { name: /Rightsize SAP HANA scale set/ })).toBeTruthy();
    for (const name of [/Route to owner/, /Verify savings/, /Accept & start/, /Mark implemented/]) {
      const btns = screen.queryAllByRole("button", { name }) as HTMLButtonElement[];
      expect(btns.every((b) => b.disabled)).toBe(true);
    }
  });
});
