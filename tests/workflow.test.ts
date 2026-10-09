import { describe, expect, it } from "vitest";
import { getSeedDataset } from "@/lib/demo/seed";
import { applyCommand, actionAvailability, bulkAvailability, BULK_ACTIONS_BY_ROLE, canTransition, WorkflowError, type WorkflowCommand } from "@/lib/demo/workflow";
import { savingsSummary, spendSummary } from "@/lib/demo/selectors";
import { validateDataset } from "@/lib/demo/validation";
import type { Dataset, DemoState, User } from "@/lib/demo/types";

const seed = getSeedDataset();
const user = (id: string) => seed.users.find((u) => u.id === id) as User;
const EXEC = user("u-exec");
const FINOPS = user("u-finops");
const ENG = user("u-priya");
const OTHER_ENG = user("u-com1");

function initial(): DemoState {
  return { version: 1, recommendations: seed.recommendations, tickets: seed.tickets, anomalies: seed.anomalies, audit: seed.audit, sequence: 0 };
}
const run = (s: DemoState, actor: User, cmd: WorkflowCommand) => applyCommand(s, cmd, { actor, asOf: seed.asOf, users: seed.users });
const full = (s: DemoState): Dataset => ({ ...seed, ...s });

const ADMIN = user("u-admin");
const hero = (s: DemoState) => s.recommendations.find((r) => r.id === "REC-2041")!;

describe("recommendation lifecycle — hero journey", () => {
  it("FinOps routes, the owner delivers, FinOps verifies, and every dependent metric updates", () => {
    let s = initial();
    const before = savingsSummary(full(s));
    const forecastBefore = spendSummary(full(s)).forecast;

    s = run(s, FINOPS, { kind: "assign", recId: "REC-2041", ownerId: "u-priya" });
    expect(hero(s).stage).toBe("assigned");
    expect(hero(s).ownerId).toBe("u-priya");

    s = run(s, ENG, { kind: "start", recId: "REC-2041" });
    expect(hero(s).stage).toBe("in_progress");
    expect(hero(s).ownerDecision?.decision).toBe("accepted");

    expect(() => run(s, ENG, { kind: "submit", recId: "REC-2041", note: "Rolling resize plan" })).toThrow(/ticket/);
    s = run(s, ENG, { kind: "create_ticket", recId: "REC-2041" });
    const ticketId = hero(s).ticketId!;
    expect(ticketId).toMatch(/^FCC-\d+$/);
    const ticket = s.tickets.find((t) => t.id === ticketId)!;
    expect(ticket.system).toBe("Local Demo Ticketing");
    expect(ticket.recommendationId).toBe("REC-2041");
    expect(hero(s).stage).toBe("in_progress");
    expect(() => run(s, ENG, { kind: "create_ticket", recId: "REC-2041" })).toThrow(/already linked/);

    expect(() => run(s, ENG, { kind: "submit", recId: "REC-2041", note: "short" })).toThrow(/Remediation plan/);
    s = run(s, ENG, { kind: "submit", recId: "REC-2041", note: "Rolling resize plan with rollback." });
    expect(s.tickets.find((t) => t.id === ticketId)!.status).toBe("Pending Approval");

    expect(() => run(s, FINOPS, { kind: "approve", recId: "REC-2041", note: "CHG-DEMO-2041" })).toThrow(WorkflowError);
    s = run(s, ENG, { kind: "approve", recId: "REC-2041", note: "CHG-DEMO-2041" });
    expect(hero(s).changeApproval?.reference).toBe("CHG-DEMO-2041");
    expect(hero(s).changeApproval?.simulated).toBe(true);

    expect(() => run(s, ENG, { kind: "implement", recId: "REC-2041" })).toThrow(/evidence/);
    s = run(s, ENG, { kind: "implement", recId: "REC-2041", note: "Resized to M128ms_v2; load test passed." });
    expect(hero(s).stage).toBe("implemented");
    expect(() => run(s, ENG, { kind: "verify", recId: "REC-2041" })).toThrow(WorkflowError);

    s = run(s, FINOPS, { kind: "verify", recId: "REC-2041" });
    const rec = hero(s);
    expect(rec.stage).toBe("verified");
    expect(rec.realizedDate).toBe(seed.asOf);
    expect(s.tickets.find((t) => t.id === ticketId)!.status).toBe("Closed");
    expect(rec.comments.some((c) => c.kind === "evidence")).toBe(true);
    expect(s.audit.length).toBeGreaterThan(initial().audit.length + 6);

    const after = savingsSummary(full(s));
    expect(after.realizedAnnual - before.realizedAnnual).toBeCloseTo(rec.estimatedMonthlySavings * 12, 2);
    expect(before.openAnnual - after.openAnnual).toBeCloseTo(rec.estimatedMonthlySavings * 12, 2);
    expect(spendSummary(full(s)).forecast).toBeLessThan(forecastBefore);
    expect(validateDataset(full(s)).ok).toBe(true);
  });
});

describe("workflow guardrails", () => {
  it("rejects invalid transitions", () => {
    expect(canTransition("identified", "approved")).toBe(false);
    expect(canTransition("closed", "identified")).toBe(false);
    expect(canTransition("submitted", "approved")).toBe(true);
    expect(() => run(initial(), FINOPS, { kind: "approve", recId: "REC-2041", note: "CHG-1234" })).toThrow(WorkflowError);
  });

  it("FinOps routes; engineering, leadership and admin cannot", () => {
    const rec = hero(initial());
    expect(actionAvailability("assign", rec, FINOPS).allowed).toBe(true);
    for (const actor of [EXEC, ADMIN]) {
      const a = actionAvailability("assign", rec, actor);
      expect(a.allowed).toBe(false);
      if (!a.allowed) expect(a.reason).toMatch(/Performed by FinOps/);
    }
    expect(() => run(initial(), ENG, { kind: "assign", recId: "REC-2041", ownerId: "u-priya" })).toThrow(WorkflowError);
  });

  it("leadership and admin are read-only on recommendations", () => {
    for (const actor of [EXEC, ADMIN]) {
      expect(() => run(initial(), actor, { kind: "comment", recId: "REC-2041", body: "hello" })).toThrow(/read-only/);
      expect(() => run(initial(), actor, { kind: "defer", recId: "REC-2041", note: "Quarter-end freeze" })).toThrow(WorkflowError);
    }
    expect(() => run(initial(), EXEC, { kind: "set_anomaly_status", anomalyId: "ANM-0412", status: "Acknowledged" })).toThrow(/read-only/);
  });

  it("only the owning engineer can progress work, and others cannot even see it", () => {
    let s = run(initial(), FINOPS, { kind: "assign", recId: "REC-2041", ownerId: "u-priya" });
    const a = actionAvailability("start", hero(s), OTHER_ENG);
    expect(a.allowed).toBe(false);
    expect(() => run(s, OTHER_ENG, { kind: "start", recId: "REC-2041" })).toThrow(/not found/);
    expect(() => run(s, OTHER_ENG, { kind: "comment", recId: "REC-2041", body: "peek" })).toThrow(/not found/);
    s = run(s, ENG, { kind: "start", recId: "REC-2041" });
    expect(hero(s).stage).toBe("in_progress");
  });

  it("routes only to engineering owners and requires non-empty comments", () => {
    expect(() => run(initial(), FINOPS, { kind: "assign", recId: "REC-2041" })).toThrow(/owner/);
    expect(() => run(initial(), FINOPS, { kind: "assign", recId: "REC-2041", ownerId: "u-exec" })).toThrow(/engineering owner/);
    expect(() => run(initial(), FINOPS, { kind: "comment", recId: "REC-2041", body: "   " })).toThrow(/empty/);
  });

  it("owner can reject or defer with a reason; FinOps can defer and reopen", () => {
    let s = run(initial(), FINOPS, { kind: "assign", recId: "REC-2041", ownerId: "u-priya" });
    expect(() => run(s, ENG, { kind: "reject", recId: "REC-2041" })).toThrow(/Reason/);
    const rejected = run(s, ENG, { kind: "reject", recId: "REC-2041", note: "Workload is being decommissioned" });
    expect(hero(rejected).stage).toBe("rejected");
    expect(hero(rejected).ownerDecision?.decision).toBe("rejected");

    s = run(initial(), FINOPS, { kind: "defer", recId: "REC-2041", note: "Quarter-end freeze" });
    expect(hero(s).stage).toBe("deferred");
    expect(hero(s).approval?.decision).toBe("deferred");
    s = run(s, FINOPS, { kind: "reopen", recId: "REC-2041" });
    expect(hero(s).stage).toBe("validated");
  });

  it("does not mutate the seed (reset is reliable)", () => {
    const snapshot = JSON.stringify(seed.recommendations.find((r) => r.id === "REC-2041"));
    run(initial(), FINOPS, { kind: "assign", recId: "REC-2041", ownerId: "u-priya" });
    expect(JSON.stringify(seed.recommendations.find((r) => r.id === "REC-2041"))).toBe(snapshot);
  });

  it("updates anomaly status", () => {
    const s = run(initial(), FINOPS, { kind: "set_anomaly_status", anomalyId: "ANM-0412", status: "Acknowledged" });
    const a = s.anomalies.find((x) => x.id === "ANM-0412")!;
    expect(a.status).toBe("Acknowledged");
    expect(a.acknowledgedBy).toBe("u-finops");
  });
});

describe("bulk actions", () => {
  it("leadership and admin have no bulk actions", () => {
    expect(BULK_ACTIONS_BY_ROLE.executive).toEqual([]);
    expect(BULK_ACTIONS_BY_ROLE.admin).toEqual([]);
    expect(bulkAvailability("tag", hero(initial()), EXEC).allowed).toBe(false);
  });

  it("never offers approve, implement or verify in bulk", () => {
    for (const actions of Object.values(BULK_ACTIONS_BY_ROLE)) {
      for (const forbidden of ["approve", "implement", "verify", "close"]) expect(actions as string[]).not.toContain(forbidden);
    }
  });

  it("checks every record individually", () => {
    const s = initial();
    const r = hero(s);
    expect(bulkAvailability("assign", r, FINOPS).allowed).toBe(true);
    expect(bulkAvailability("assign", r, ENG).allowed).toBe(false);
    const closed = s.recommendations.find((x) => x.stage === "closed");
    if (closed) expect(bulkAvailability("set_priority", closed, FINOPS).allowed).toBe(false);
    const assigned = run(s, FINOPS, { kind: "assign", recId: "REC-2041", ownerId: "u-priya" });
    expect(bulkAvailability("start", hero(assigned), ENG).allowed).toBe(true);
    const o = bulkAvailability("start", hero(assigned), OTHER_ENG);
    expect(o.allowed).toBe(false);
    if (!o.allowed) expect(o.reason).toBe("Not visible to you");
  });

  it("FinOps can tag, prioritise, categorise and share; each change is audited", () => {
    let s = initial();
    const n = s.audit.length;
    s = run(s, FINOPS, { kind: "tag", recId: "REC-2041", tag: "q4-focus" });
    s = run(s, FINOPS, { kind: "set_priority", recId: "REC-2041", priority: hero(s).priority === "Critical" ? "High" : "Critical" });
    s = run(s, FINOPS, { kind: "share", recId: "REC-2041", userIds: ["u-exec"] });
    expect(hero(s).tags ?? []).toContain("q4-focus");
    expect(s.audit.length).toBe(n + 3);
    expect(() => run(s, FINOPS, { kind: "share", recId: "REC-2041", userIds: [] })).toThrow(/recipient/);
  });
});
