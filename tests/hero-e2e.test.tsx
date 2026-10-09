// End-to-end hero workflow driven through the real UI: login page → role pages → detail actions and dialogs → logout,
// in the exact order of the 5-minute demo script. State carries between sign-ins through the persisted demo store.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const replace = vi.fn();
const push = vi.fn();
let pathname = "/login";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

import { DemoProvider, useDemoSession } from "@/lib/demo/store";
import { ToastProvider } from "@/components/ui/overlay";
import { AppShell } from "@/components/shell/AppShell";
import LoginPage from "@/app/login/page";
import { ExecutiveOverview } from "@/components/pages/ExecutiveOverview";
import { EngineeringQueue } from "@/components/pages/EngineeringQueue";
import { RecommendationDetail } from "@/components/pages/RecommendationDetail";

const HERO = "REC-2041";

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <DemoProvider clientLabel="Enterprise Client Demo">
      <ToastProvider>{children}</ToastProvider>
    </DemoProvider>
  );
}

function Stage() {
  const { fullDs } = useDemoSession();
  const r = fullDs.recommendations.find((x) => x.id === HERO)!;
  return (
    <output data-testid="hero">
      {r.stage}|{r.ownerId ?? "none"}|{r.ticketId ?? "none"}|{r.changeApproval?.reference ?? "none"}
    </output>
  );
}

async function signIn(cardTitle: string, expectedHome: string) {
  pathname = "/login";
  replace.mockClear();
  render(
    <Wrap>
      <LoginPage />
    </Wrap>,
  );
  const group = await screen.findByRole("radiogroup", { name: "Demo account" });
  const card = within(group).getByText(cardTitle, { exact: true }).closest("label")!;
  fireEvent.click(within(card).getByRole("radio"));
  fireEvent.click(screen.getByRole("button", { name: /Sign in/ }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith(expectedHome));
  cleanup();
}

async function onPage(path: string, node: React.ReactNode) {
  pathname = path;
  render(
    <Wrap>
      <AppShell>
        {node}
        <Stage />
      </AppShell>
    </Wrap>,
  );
  await screen.findByTestId("hero");
}

async function act_(label: string) {
  const trigger = (screen.getAllByRole("button", { name: label }) as HTMLButtonElement[]).find((b) => !b.disabled);
  expect(trigger, `no enabled "${label}" button`).toBeTruthy();
  fireEvent.click(trigger!);
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: label }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

async function logOut(displayName: string) {
  fireEvent.click(screen.getAllByText(displayName)[0].closest("button")!);
  fireEvent.click(within(screen.getByRole("menu", { name: "Account" })).getByRole("menuitem", { name: /Log out/ }));
  await waitFor(() => expect(window.localStorage.getItem("fcc.demo.session.v1")).toBeNull());
  cleanup();
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/login?reset=1&focus=1");
});
afterEach(() => cleanup());

describe("5-minute demo sequence through the UI", () => {
  it("runs Executive → FinOps → Priya → FinOps → Executive with logout between each", async () => {
    // Reset URL restores the seed and signs nobody in.
    pathname = "/login";
    render(
      <Wrap>
        <Stage />
      </Wrap>,
    );
    await waitFor(() => expect(screen.getByTestId("hero").textContent).toBe("validated|none|none|none"));
    cleanup();

    // 1–2. Executive reviews the portfolio and drill-down, read-only.
    await signIn("Executive / Leadership", "/overview");
    await onPage("/overview", <ExecutiveOverview />);
    expect(screen.getAllByText("$2.76M").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Drill into SAP S/4HANA" }));
    fireEvent.click(screen.getByRole("button", { name: "Drill into Unassigned" }));
    expect(document.querySelector(`a[href="/recommendations/${HERO}"]`)).not.toBeNull();
    await logOut("Alex Morgan");

    // 3–4. FinOps routes REC-2041 to Priya (default owner in the dialog).
    await signIn("FinOps Practitioner", "/finops");
    await onPage(`/recommendations/${HERO}`, <RecommendationDetail id={HERO} />);
    fireEvent.click((screen.getAllByRole("button", { name: "Route to owner" }) as HTMLButtonElement[]).find((b) => !b.disabled)!);
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText(/owner/i) as HTMLSelectElement).value).toBe("u-priya");
    fireEvent.click(within(dialog).getByRole("button", { name: "Route to owner" }));
    await waitFor(() => expect(screen.getByTestId("hero").textContent).toBe("assigned|u-priya|none|none"));
    await logOut("Jordan Lee");

    // 5–7. Priya: queue → accept → ticket → plan → change approval reference → implementation evidence.
    await signIn("Engineering Owner", "/engineering");
    await onPage("/engineering", <EngineeringQueue />);
    const ready = screen.getByText("Ready for you").closest("section, div.card, [class*='card']") ?? document.body;
    expect(within(ready as HTMLElement).getAllByText(HERO)[0]).toBeTruthy();
    cleanup();
    await onPage(`/recommendations/${HERO}`, <RecommendationDetail id={HERO} />);
    await act_("Accept & start work");
    await act_("Create or link ticket");
    await waitFor(() => expect(screen.getByTestId("hero").textContent).toBe("in_progress|u-priya|FCC-1365|none"));
    await act_("Submit for change approval");
    await act_("Record change approval");
    await waitFor(() => expect(screen.getByTestId("hero").textContent).toBe("approved|u-priya|FCC-1365|CHG-DEMO-2041"));
    await act_("Mark implemented & submit for verification");
    await waitFor(() => expect(screen.getByTestId("hero").textContent).toMatch(/^implemented\|/));
    expect(screen.queryAllByRole("button", { name: "Verify savings" }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    await logOut("Priya Raman");

    // 8–9. FinOps verifies.
    await signIn("FinOps Practitioner", "/finops");
    await onPage(`/recommendations/${HERO}`, <RecommendationDetail id={HERO} />);
    await act_("Verify savings");
    await waitFor(() => expect(screen.getByTestId("hero").textContent).toMatch(/^verified\|/));
    await logOut("Jordan Lee");

    // 10. Executive sees the verified result and drills to it.
    await signIn("Executive / Leadership", "/overview");
    await onPage("/overview", <ExecutiveOverview />);
    expect(screen.getAllByText("$3.85M").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Drill into SAP S/4HANA" }));
    fireEvent.click(screen.getByRole("button", { name: "Drill into Priya Raman" }));
    const link = document.querySelector(`a[href="/recommendations/${HERO}"]`)!;
    expect(link.textContent).toContain("Savings Verified");
    expect(link.textContent).toContain("Ticket FCC-1365");
    expect(link.textContent).toMatch(/\$1\.08M verified/);
    await act(async () => undefined);
  }, 30000);
});
