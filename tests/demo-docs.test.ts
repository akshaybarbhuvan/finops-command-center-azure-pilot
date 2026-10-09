// Keeps the presenter script, captions, access-control script and the actual app in sync.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getSeedDataset } from "@/lib/demo/seed";
import { applyCommand, isOpen, ACTION_META, type WorkflowCommand } from "@/lib/demo/workflow";
import { annual, engineeringQueue, lookup, savingsSummary, spendSummary } from "@/lib/demo/selectors";
import { rollUp } from "@/components/dashboard/SavingsDrillDown";
import { money } from "@/lib/format";
import type { DemoState, User } from "@/lib/demo/types";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const MAIN = read("docs/5-Minute-Executive-Demo.md");
const ACCESS = read("docs/Access-Control-Demo.md");
const CHEAT = read("docs/5-Minute-Cheat-Sheet.md");
const PLAN = read("docs/5-Minute-Recording-Plan.md");
const TXT = read("docs/demo-script.txt");
const SRT = read("docs/demo-script.srt");
const SRC = (function walk(dir: string): string {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? fs.readFileSync(path.join(dir, e.name), "utf8") : ""))
    .join("\n");
})(path.join(process.cwd(), "src"));

const sec = (t: string) => {
  const [m, s] = t.split(":").map(Number);
  return m * 60 + s;
};
const srtSec = (t: string) => {
  const [h, m, rest] = t.split(":");
  const [s, ms] = rest.split(",");
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
};

interface Segment {
  start: number;
  end: number;
  title: string;
  lead: number;
  tail: number;
  text: string;
}
const SEGMENTS: Segment[] = [...TXT.matchAll(/^\[(\d\d:\d\d)-(\d\d:\d\d)\] (.+?) \| silent lead (\d+)s, tail (\d+)s \| \d+ words\n(.+)$/gm)].map((m) => ({
  start: sec(m[1]),
  end: sec(m[2]),
  title: m[3],
  lead: Number(m[4]),
  tail: Number(m[5]),
  text: m[6],
}));

describe("narration and captions", () => {
  it("has eight scenes covering 00:05–04:55 without gaps", () => {
    expect(SEGMENTS.map((s) => s.title)).toEqual(["Opening", "Executive Overview", "Opportunity and drill-down", "FinOps assigns an owner", "Engineering execution", "FinOps verification", "Executive outcome", "Close"]);
    expect(SEGMENTS[0].start).toBe(5);
    expect(SEGMENTS.at(-1)!.end).toBe(295);
    for (let i = 1; i < SEGMENTS.length; i++) expect(SEGMENTS[i].start).toBe(SEGMENTS[i - 1].end);
  });

  it("every scene's narration fits its window at 140 wpm after silent interaction", () => {
    for (const s of SEGMENTS) {
      const speech = (s.text.split(/\s+/).length * 60) / 140;
      expect(speech + s.lead + s.tail, s.title).toBeLessThanOrEqual(s.end - s.start);
    }
  });

  it("the presenter script contains the caption narration word for word", () => {
    for (const s of SEGMENTS) expect(MAIN, s.title).toContain(`> ${s.text}`);
  });

  it("reports the real word count and narration time", () => {
    const words = SEGMENTS.reduce((t, s) => t + s.text.split(/\s+/).length, 0);
    expect(TXT).toContain(`Spoken words: ${words}`);
    expect(MAIN).toContain(`| Spoken words | **${words}** |`);
    const secs = (words * 60) / 140;
    expect(MAIN).toContain(`**${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")}**`);
  });

  it("SRT cues are numbered, ordered, non-overlapping and inside each scene's spoken span", () => {
    const cues = SRT.trim()
      .split(/\n\n+/)
      .map((b) => b.split("\n"))
      .map(([n, t, ...text]) => {
        const [a, b] = t.split(" --> ").map(srtSec);
        return { n: Number(n), a, b, text: text.join(" ") };
      });
    expect(cues.length).toBeGreaterThan(30);
    cues.forEach((c, i) => {
      expect(c.n).toBe(i + 1);
      expect(c.b).toBeGreaterThan(c.a);
      if (i) expect(c.a).toBeGreaterThanOrEqual(cues[i - 1].b);
      const seg = SEGMENTS.find((s) => c.a >= s.start && c.a < s.end)!;
      expect(seg, `cue ${c.n}`).toBeTruthy();
      expect(c.a).toBeGreaterThanOrEqual(seg.start + seg.lead - 0.001);
      expect(c.b).toBeLessThanOrEqual(seg.end - seg.tail + 0.001);
    });
    expect(cues.some((c) => c.text.includes("REC-2041"))).toBe(true);
  });
});

describe("UI labels used in the scripts exist in the app", () => {
  const labels = [
    "Sign in",
    "Log out",
    "Switch demo user",
    "Executive / Leadership",
    "FinOps Practitioner",
    "Engineering Owner",
    "Engineering Owner (second account)",
    "Savings drill-down",
    "Savings realized",
    "Savings opportunity",
    "Month-end forecast",
    "Open actions",
    "What leadership should know",
    "Ready for you",
    "Back to recommendations",
    "Search recommendations",
    "Assigned workload",
    "All products",
    ACTION_META.assign.label,
    ACTION_META.start.label,
    ACTION_META.create_ticket.label,
    ACTION_META.submit.label,
    ACTION_META.approve.label,
    ACTION_META.implement.label,
    ACTION_META.verify.label,
  ];
  it.each(labels)("%s", (label) => {
    expect(SRC).toContain(label);
    expect(MAIN.includes(label) || ACCESS.includes(label) || CHEAT.includes(label)).toBe(true);
  });

  it("the access-control script is identical in both documents", () => {
    const block = ACCESS.slice(ACCESS.indexOf("### Purpose"));
    expect(MAIN).toContain(block.trim());
  });

  it("no script implies FinOps approves changes or that savings are real", () => {
    // The cheat sheet's "Never say" list quotes the forbidden phrases on purpose.
    const cheat = CHEAT.replace(/## Never say[\s\S]*?(?=\n## )/, "");
    for (const doc of [MAIN, ACCESS, cheat, PLAN]) {
      expect(doc).not.toMatch(/FinOps (approves|approved) the change/i);
      expect(doc).not.toMatch(/live data|real savings|production savings achieved|Assign owner/i);
    }
  });
});

describe("figures quoted in the scripts match the app", () => {
  const seed = getSeedDataset();
  const u = (id: string) => seed.users.find((x) => x.id === id) as User;
  let s: DemoState = { version: 4, recommendations: seed.recommendations, tickets: seed.tickets, anomalies: seed.anomalies, audit: seed.audit, sequence: 0 };
  const run = (a: string, c: WorkflowCommand) => (s = applyCommand(s, c, { actor: u(a), asOf: seed.asOf, users: seed.users }));
  const snap = () => {
    const ds = { ...seed, ...s };
    const v = savingsSummary(ds);
    return { open: money(v.openAnnual), unowned: money(v.unownedAnnual), owned: `${Math.round(v.ownedSharePct)}%`, realized: money(v.realizedAnnual), atRisk: money(v.atRiskAnnual), forecast: money(spendSummary(ds).forecast) };
  };
  const workload = (id: string) => {
    const o = s.recommendations.filter((r) => r.ownerId === id && isOpen(r.stage));
    return `${o.length} open · ${money(o.reduce((t, r) => t + annual(r), 0))}/yr`;
  };

  it("start state", () => {
    expect(snap()).toEqual({ open: "$19.3M", unowned: "$8.29M", owned: "57%", realized: "$2.76M", atRisk: "$4.08M", forecast: "$12.2M" });
    expect(workload("u-priya")).toBe("24 open · $739K/yr");
    const hero = s.recommendations.find((r) => r.id === "REC-2041")!;
    expect([hero.stage, hero.ownerId]).toEqual(["validated", null]);
    // Largest unowned SAP S/4HANA item is REC-2041.
    const L = lookup({ ...seed, ...s });
    const sapUnowned = s.recommendations.filter((r) => L.resource(r.resourceId)?.applicationId === "app-s4" && !r.ownerId).sort((a, b) => annual(b) - annual(a));
    expect(sapUnowned[0].id).toBe("REC-2041");
    expect(rollUp(s.recommendations, (r) => L.resource(r.resourceId)?.applicationId ?? "unmapped", (k) => L.application(k)?.name ?? k).some((r) => r.label === "SAP S/4HANA")).toBe(true);
  });

  it("second engineer facts used in the access-control script", () => {
    const marcus = u("u-erp2");
    const mine = s.recommendations.filter((r) => r.ownerId === "u-erp2");
    expect(mine.length).toBe(41);
    expect(workload("u-erp2")).toBe("27 open · $380K/yr");
    expect(ACCESS).toContain("27 open recommendations · $380K/yr est.");
    expect(ACCESS).toContain("0 of 41 recommendations");
    const q = engineeringQueue({ ...seed, ...s }, marcus);
    const first = [...q.awaitingAction].sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings)[0];
    expect(first.id).toBe("REC-1219");
    expect(ACCESS).toContain(`**${first.id}**`);
    expect(ACCESS).toContain(first.title);
  });

  it("after the hero workflow", () => {
    run("u-finops", { kind: "assign", recId: "REC-2041", ownerId: "u-priya" });
    run("u-priya", { kind: "start", recId: "REC-2041" });
    run("u-priya", { kind: "create_ticket", recId: "REC-2041" });
    run("u-priya", { kind: "submit", recId: "REC-2041", note: "Rolling resize plan" });
    run("u-priya", { kind: "approve", recId: "REC-2041", note: "CHG-DEMO-2041" });
    run("u-priya", { kind: "implement", recId: "REC-2041", note: "All nodes resized" });
    run("u-finops", { kind: "verify", recId: "REC-2041" });
    expect(snap()).toEqual({ open: "$18.2M", unowned: "$7.21M", owned: "60%", realized: "$3.85M", atRisk: "$3.00M", forecast: "$12.1M" });
    expect(s.recommendations.find((r) => r.id === "REC-2041")!.ticketId).toBe("FCC-1365");
    expect(workload("u-priya")).toBe("24 open · $739K/yr");
    for (const doc of [MAIN, CHEAT]) for (const v of ["$2.76M", "$3.85M", "$19.3M", "$8.29M", "FCC-1365", "CHG-DEMO-2041"]) expect(doc).toContain(v);
  });
});
