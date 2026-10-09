// Record-level isolation exercised through the real UI components with a persisted demo session.
// Scenario: FinOps has routed REC-2041 to Priya, Priya accepted it, created a ticket and commented.
// The second engineering account (Marcus Hill, same ERP Platform team) must not see any of it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/recommendations",
  useSearchParams: () => new URLSearchParams(),
}));

const exported: unknown[][] = [];
vi.mock("@/lib/csv", async (orig) => {
  const mod = await orig<typeof import("@/lib/csv")>();
  return { ...mod, downloadCsv: (rows: unknown[]) => void exported.push(rows) };
});

import { DemoProvider, DEMO_ACCOUNTS, useDemo, useDemoSession } from "@/lib/demo/store";
import { ToastProvider } from "@/components/ui/overlay";
import { getSeedDataset } from "@/lib/demo/seed";
import { applyCommand, type WorkflowCommand } from "@/lib/demo/workflow";
import { scopeDataset } from "@/lib/demo/access";
import { askCopilot, SUGGESTED_QUESTIONS } from "@/lib/demo/copilot";
import { RecommendationsCenter } from "@/components/pages/RecommendationsCenter";
import { RecommendationDetail } from "@/components/pages/RecommendationDetail";
import { EngineeringQueue } from "@/components/pages/EngineeringQueue";
import { Tickets } from "@/components/pages/Tickets";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import LoginPage from "@/app/login/page";
import type { DemoState, Recommendation, User } from "@/lib/demo/types";

const seed = getSeedDataset();
const user = (id: string) => seed.users.find((u) => u.id === id) as User;
const HERO = "REC-2041";
const HERO_TITLE = seed.recommendations.find((r) => r.id === HERO)!.title;
const SECRET = "Confidential owner note 7Q4X";

function scenario(): DemoState {
  let s: DemoState = { version: 4, recommendations: seed.recommendations, tickets: seed.tickets, anomalies: seed.anomalies, audit: seed.audit, sequence: 0 };
  const run = (actor: string, cmd: WorkflowCommand) => (s = applyCommand(s, cmd, { actor: user(actor), asOf: seed.asOf, users: seed.users }));
  run("u-finops", { kind: "assign", recId: HERO, ownerId: "u-priya" });
  run("u-priya", { kind: "start", recId: HERO });
  run("u-priya", { kind: "create_ticket", recId: HERO });
  run("u-priya", { kind: "comment", recId: HERO, body: SECRET });
  return s;
}
const STATE = scenario();
const HERO_TICKET = STATE.recommendations.find((r) => r.id === HERO)!.ticketId!;
const owned = (id: string) => STATE.recommendations.filter((r) => r.ownerId === id);

function signedInAs(userId: string) {
  window.localStorage.setItem("fcc.demo.v1", JSON.stringify({ version: 4, focus: false, state: STATE }));
  window.localStorage.setItem("fcc.demo.session.v1", JSON.stringify({ userId }));
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <DemoProvider clientLabel="Enterprise Client Demo">
      <ToastProvider>{children}</ToastProvider>
    </DemoProvider>
  );
}

/** Renders children only once the persisted session is restored. */
function Ready({ children }: { children: React.ReactNode }) {
  const { user, hydrated } = useDemoSession();
  return hydrated && user ? <>{children}</> : null;
}

const leaks = (text: string | null | undefined) => {
  const t = text ?? "";
  return [HERO, HERO_TITLE, HERO_TICKET, SECRET].filter((x) => t.includes(x));
};

beforeEach(() => {
  window.localStorage.clear();
  exported.length = 0;
});
afterEach(() => cleanup());

describe("second engineering demo account", () => {
  it("is a distinct, deterministic engineering identity that does not own REC-2041", () => {
    const ids = DEMO_ACCOUNTS.map((a) => a.userId);
    expect(ids).toContain("u-erp2");
    expect(user("u-erp2").role).toBe("engineering");
    expect(user("u-erp2").name).toBe("Marcus Hill");
    expect(seed.recommendations.find((r) => r.id === HERO)!.ownerId).toBeNull();
    expect(owned("u-erp2").length).toBeGreaterThan(0);
    expect(owned("u-erp2").some((r) => r.id === HERO)).toBe(false);
    expect(getSeedDataset().recommendations.filter((r) => r.ownerId === "u-erp2").map((r) => r.id)).toEqual(
      seed.recommendations.filter((r) => r.ownerId === "u-erp2").map((r) => r.id),
    );
  });

  it("login page shows name, role and assigned workload for both engineering accounts", async () => {
    render(
      <Wrap>
        <LoginPage />
      </Wrap>,
    );
    const group = await screen.findByRole("radiogroup", { name: "Demo account" });
    expect(within(group).getAllByRole("radio")).toHaveLength(5);
    expect(within(group).getByText(/Marcus Hill · Senior Engineer, ERP Platform/)).toBeTruthy();
    expect(within(group).getByText(/Priya Raman · Principal Engineer, ERP Platform/)).toBeTruthy();
    expect(within(group).getByText("Engineering Owner (second account)")).toBeTruthy();
    expect(screen.getByTestId("workload-u-erp2").textContent).toMatch(/Assigned workload: \d+ open recommendations? · \$/);
    expect(screen.getByTestId("workload-u-priya").textContent).toMatch(/Assigned workload: \d+ open/);
    expect(leaks(document.body.textContent)).toEqual([]);
  });
});

describe("Marcus (second engineer) cannot reach Priya's REC-2041 through the UI", () => {
  it("app state handed to pages contains only his own records", async () => {
    signedInAs("u-erp2");
    let seen: string | null = null;
    function Probe() {
      const { ds } = useDemo();
      seen = JSON.stringify({ r: ds.recommendations, t: ds.tickets, a: ds.audit, n: ds.anomalies });
      expect(ds.recommendations.every((r) => r.ownerId === "u-erp2")).toBe(true);
      return null;
    }
    render(
      <Wrap>
        <Ready>
          <Probe />
        </Ready>
      </Wrap>,
    );
    await waitFor(() => expect(seen).not.toBeNull());
    expect(leaks(seen)).toEqual([]);
  });

  it("recommendation list, counts, search, filter options, bulk selection and export exclude it", async () => {
    signedInAs("u-erp2");
    render(
      <Wrap>
        <Ready>
          <RecommendationsCenter />
        </Ready>
      </Wrap>,
    );
    const status = await screen.findByRole("status");
    const mine = owned("u-erp2");
    expect(status.textContent).toContain(`of ${mine.length.toLocaleString("en-US")} recommendations`);
    expect(leaks(document.body.textContent)).toEqual([]);

    // Search by ID and title returns nothing.
    const search = screen.getByLabelText("Search recommendations");
    fireEvent.change(search, { target: { value: "2041" } });
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/^0 of/));
    fireEvent.change(search, { target: { value: "SAP HANA scale set" } });
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/^0 of/));
    fireEvent.change(search, { target: { value: "" } });

    // Owner filter options list only Marcus.
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Owner Any$/ }));
    const options = within(screen.getByRole("listbox", { name: "Owner" })).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([expect.stringMatching(/^Marcus Hill/)]);

    // Bulk "select all filtered" covers only his records.
    const selectPage = screen.queryByRole("checkbox", { name: "Select all rows on this page" }) ?? screen.getByLabelText("Select all rows on this page");
    fireEvent.click(selectPage);
    const allFiltered = screen.queryByRole("button", { name: /Select all [\d,]+ filtered/ });
    if (allFiltered) expect(Number(allFiltered.textContent!.match(/[\d,]+/)![0].replace(/,/g, ""))).toBeLessThanOrEqual(mine.length);
    expect(leaks(document.body.textContent)).toEqual([]);

    // Export contains only his records.
    fireEvent.click(screen.getAllByRole("button", { name: /Export/ })[0]);
    expect(exported).toHaveLength(1);
    const rows = exported[0] as Recommendation[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.ownerId === "u-erp2")).toBe(true);
    expect(leaks(JSON.stringify(rows))).toEqual([]);
  });

  it("direct detail URL shows a generic not-available page with no record details", async () => {
    signedInAs("u-erp2");
    render(
      <Wrap>
        <Ready>
          <RecommendationDetail id={HERO} />
        </Ready>
      </Wrap>,
    );
    await screen.findByText(`Recommendation ${HERO} is not available`);
    expect(leaks(document.body.textContent).filter((x) => x !== HERO)).toEqual([]);
    // Same response as an ID that does not exist.
    cleanup();
    signedInAs("u-erp2");
    render(
      <Wrap>
        <Ready>
          <RecommendationDetail id="REC-9999" />
        </Ready>
      </Wrap>,
    );
    expect((await screen.findByText("Recommendation REC-9999 is not available")).textContent).toBeTruthy();
  });

  it("work queue, tickets and global search exclude the record and its ticket", async () => {
    signedInAs("u-erp2");
    render(
      <Wrap>
        <Ready>
          <EngineeringQueue />
          <Tickets />
          <GlobalSearch open onClose={() => undefined} />
        </Ready>
      </Wrap>,
    );
    await screen.findByRole("heading", { name: "Engineering Work Queue" });
    expect(leaks(document.body.textContent)).toEqual([]);
    const input = screen.getAllByRole("combobox").find((el) => el.tagName === "INPUT") ?? screen.getAllByRole("textbox").at(-1)!;
    for (const q of ["2041", HERO_TICKET, "HANA scale set"]) {
      fireEvent.change(input, { target: { value: q } });
      // The typed query is echoed in the "No matches" line; no record data may appear.
      const text = document.body.textContent ?? "";
      expect(text).toContain(`No matches for “${q}”`);
      expect(text).not.toContain(HERO_TITLE);
      expect(text).not.toContain(`${HERO} ·`);
      expect(text).not.toContain(SECRET);
    }
  });

  it("workflow commands on the record are refused without revealing it", async () => {
    signedInAs("u-erp2");
    let results: { ok: boolean; error?: string }[] = [];
    function Act() {
      const { dispatchMany } = useDemoSession();
      return (
        <button
          onClick={() =>
            (results = dispatchMany([
              { kind: "comment", recId: HERO, body: "trying" },
              { kind: "tag", recId: HERO, tag: "x" },
              { kind: "implement", recId: HERO, note: "evidence text" },
            ]) as typeof results)
          }
        >
          act
        </button>
      );
    }
    render(
      <Wrap>
        <Ready>
          <Act />
        </Ready>
      </Wrap>,
    );
    fireEvent.click(await screen.findByText("act"));
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.ok).toBe(false);
      expect(r.error).toBe(`Recommendation ${HERO} was not found`);
    }
  });

  it("copilot answers are computed from his scope only", () => {
    const scoped = scopeDataset({ ...seed, ...STATE }, user("u-erp2"));
    for (const q of SUGGESTED_QUESTIONS) {
      const answer = JSON.stringify(askCopilot(scoped, q));
      // Echoing an ID the user typed is fine; nothing else about the record may appear.
      expect(leaks(answer).filter((x) => !(x === HERO && q.includes(HERO)))).toEqual([]);
    }
    const direct = askCopilot(scoped, `Summarize ${HERO}`);
    expect(direct.summary).toBe(`Recommendation ${HERO} is not available. It does not exist or is outside the records your role can access.`);
    expect(direct.bullets).toEqual([]);
  });
});

describe("authorized users keep access", () => {
  it("Marcus can open and act on his own record", async () => {
    signedInAs("u-erp2");
    const rec = owned("u-erp2").find((r) => r.stage === "assigned") ?? owned("u-erp2")[0];
    render(
      <Wrap>
        <Ready>
          <RecommendationDetail id={rec.id} />
        </Ready>
      </Wrap>,
    );
    expect(await screen.findByRole("heading", { name: rec.title })).toBeTruthy();
    if (rec.stage === "assigned") expect((screen.getAllByRole("button", { name: /Accept & start work/ })[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it("Priya sees REC-2041, its ticket and her comment", async () => {
    signedInAs("u-priya");
    render(
      <Wrap>
        <Ready>
          <RecommendationDetail id={HERO} />
        </Ready>
      </Wrap>,
    );
    expect(await screen.findByRole("heading", { name: HERO_TITLE })).toBeTruthy();
    expect(document.body.textContent).toContain(HERO_TICKET);
  });

  it("FinOps sees the portfolio and can verify only after implementation; Admin and Executive have no workflow actions", async () => {
    for (const id of ["u-exec", "u-admin"]) {
      cleanup();
      signedInAs(id);
      render(
        <Wrap>
          <Ready>
            <RecommendationDetail id={HERO} />
          </Ready>
        </Wrap>,
      );
      expect(await screen.findByRole("heading", { name: HERO_TITLE })).toBeTruthy();
      const enabled = (screen.queryAllByRole("button") as HTMLButtonElement[]).filter(
        (b) => !b.disabled && /Route to owner|Accept|Create or link ticket|Submit for change|Record change|Mark implemented|Verify savings|Reject|Defer|Close recommendation/.test(b.textContent ?? ""),
      );
      expect(enabled.map((b) => b.textContent)).toEqual([]);
    }
    cleanup();
    signedInAs("u-finops");
    render(
      <Wrap>
        <Ready>
          <RecommendationDetail id={HERO} />
        </Ready>
      </Wrap>,
    );
    expect(await screen.findByRole("heading", { name: HERO_TITLE })).toBeTruthy();
    const verify = screen.queryAllByRole("button", { name: /Verify savings/ }) as HTMLButtonElement[];
    expect(verify.every((b) => b.disabled)).toBe(true);
  });
});
