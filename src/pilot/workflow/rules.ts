// Pilot workflow rules — pure and shared by the server (enforcement) and the UI (which actions to offer).
// The server re-checks everything; the UI copy is only for presentation.
import { z } from "zod";
import type { PilotRole } from "../auth/principal";

export const STAGES = ["identified", "validated", "assigned", "in_progress", "submitted", "approved", "implemented", "verified", "closed", "rejected", "deferred"] as const;
export type PilotStage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<PilotStage, string> = {
  identified: "Identified",
  validated: "Validated",
  assigned: "Assigned",
  in_progress: "In progress",
  submitted: "Plan submitted",
  approved: "Change approved",
  implemented: "Implemented — awaiting verification",
  verified: "Savings verified",
  closed: "Closed",
  rejected: "Rejected",
  deferred: "Deferred",
};
export const OPEN_STAGES: PilotStage[] = ["identified", "validated", "assigned", "in_progress", "submitted", "approved", "implemented"];
export const isOpenStage = (s: PilotStage) => OPEN_STAGES.includes(s);
export const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;

export type PilotAction =
  | "validate"
  | "assign"
  | "set_priority"
  | "start"
  | "record_ticket"
  | "submit"
  | "record_change"
  | "send_back"
  | "implement"
  | "verify"
  | "decline_verification"
  | "reject"
  | "defer"
  | "reopen"
  | "close"
  | "comment";

interface ActionRule {
  label: string;
  /** Stages from which FinOps may perform the action. */
  finops?: PilotStage[];
  /** Stages from which the assigned engineering owner may perform the action. */
  owner?: PilotStage[];
  to?: PilotStage;
  tone: "primary" | "neutral" | "danger";
}

const ALL: PilotStage[] = [...STAGES];

export const ACTIONS: Record<PilotAction, ActionRule> = {
  validate: { label: "Validate opportunity", finops: ["identified"], to: "validated", tone: "primary" },
  assign: { label: "Assign owner", finops: ["validated", "assigned"], to: "assigned", tone: "primary" },
  set_priority: { label: "Set priority", finops: OPEN_STAGES, tone: "neutral" },
  start: { label: "Accept work", owner: ["assigned"], to: "in_progress", tone: "primary" },
  record_ticket: { label: "Record ticket reference", owner: ["in_progress", "submitted", "approved"], tone: "neutral" },
  submit: { label: "Submit remediation plan", owner: ["in_progress"], to: "submitted", tone: "primary" },
  record_change: { label: "Record change approval reference", owner: ["submitted"], to: "approved", tone: "primary" },
  send_back: { label: "Change not approved — revise plan", owner: ["submitted"], to: "in_progress", tone: "neutral" },
  implement: { label: "Submit implementation evidence", owner: ["approved"], to: "implemented", tone: "primary" },
  verify: { label: "Record savings verification", finops: ["implemented"], to: "verified", tone: "primary" },
  decline_verification: { label: "Record: savings not verified", finops: ["implemented"], tone: "neutral" },
  reject: { label: "Reject", finops: ["identified", "validated"], owner: ["assigned", "in_progress"], to: "rejected", tone: "danger" },
  defer: { label: "Defer", finops: ["identified", "validated"], owner: ["assigned", "in_progress"], to: "deferred", tone: "neutral" },
  reopen: { label: "Reopen", finops: ["deferred"], to: "validated", tone: "neutral" },
  close: { label: "Close", finops: ["verified"], to: "closed", tone: "primary" },
  comment: { label: "Add comment", finops: ALL, owner: ALL, tone: "neutral" },
};

export interface RecForRules {
  stage: PilotStage;
  ownerId: string | null;
  ticketReference: string | null;
  implementedBy: string | null;
}
export interface ActorForRules {
  id: string;
  roles: PilotRole[];
}

export type Availability = { allowed: true } | { allowed: false; code: "forbidden" | "conflict"; reason: string };

/** Decides whether `actor` may perform `action` on `rec` now. Visibility (row scope) is checked separately. */
export function availability(action: PilotAction, rec: RecForRules, actor: ActorForRules): Availability {
  const rule = ACTIONS[action];
  const isFinOps = actor.roles.includes("finops");
  const isOwner = actor.roles.includes("engineering") && rec.ownerId === actor.id;
  const viaFinOps = isFinOps && !!rule.finops;
  const viaOwner = isOwner && !!rule.owner;
  if (!viaFinOps && !viaOwner) {
    const who = [rule.finops ? "FinOps" : null, rule.owner ? "the assigned engineering owner" : null].filter(Boolean).join(" or ");
    return { allowed: false, code: "forbidden", reason: `Only ${who} can do this` };
  }
  const stageOk = (viaFinOps && rule.finops!.includes(rec.stage)) || (viaOwner && rule.owner!.includes(rec.stage));
  if (!stageOk) return { allowed: false, code: "conflict", reason: `Not available while the recommendation is ${STAGE_LABEL[rec.stage].toLowerCase()}` };
  if (action === "submit" && !rec.ticketReference) return { allowed: false, code: "conflict", reason: "Record a ticket reference first" };
  if (action === "verify" || action === "decline_verification") {
    // Separation of duties: whoever owns or implemented the change never decides on its savings.
    if (rec.ownerId === actor.id || rec.implementedBy === actor.id) {
      return { allowed: false, code: "forbidden", reason: "Separation of duties: the owner or implementer of a change cannot decide on its savings" };
    }
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------------------------------------------
// Input validation (server-side; the UI uses the same schemas for early feedback)
// ---------------------------------------------------------------------------------------------------------------

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Invalid date");
const TEXT = (min: number, max: number) => z.string().trim().min(min, `At least ${min} characters`).max(max, `At most ${max} characters`);
const REFERENCE = z.string().trim().min(1).max(128).regex(/^[\p{L}\p{N} ._:/#-]+$/u, "Letters, numbers, spaces and . _ : / # - only");
const HTTPS_URL = z
  .string()
  .trim()
  .max(1000)
  .url()
  .refine((u) => u.startsWith("https://"), "Must be an https:// link");
const AMOUNT = z.string().trim().regex(/^\d{1,12}(\.\d{1,6})?$/, "Non-negative amount (at most 12 integer digits, 6 decimals)");
const GUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const base = { expectedVersion: z.number().int().min(1) };

export const VERIFICATION_METHODS = {
  cost_management_before_after: "Cost Management before/after comparison of the affected resource(s)",
  invoice_comparison: "Invoice line comparison",
  other_documented: "Other documented method (describe in notes)",
} as const;

export const ActionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("validate"), ...base, note: TEXT(0, 1000).optional() }).strict(),
  z.object({ action: z.literal("assign"), ...base, ownerId: GUID, dueDate: ISO_DATE.optional() }).strict(),
  z.object({ action: z.literal("set_priority"), ...base, priority: z.enum(PRIORITIES) }).strict(),
  z.object({ action: z.literal("start"), ...base, note: TEXT(0, 1000).optional() }).strict(),
  z.object({ action: z.literal("record_ticket"), ...base, reference: REFERENCE, url: HTTPS_URL.optional() }).strict(),
  z.object({ action: z.literal("submit"), ...base, plan: TEXT(8, 4000) }).strict(),
  z.object({ action: z.literal("record_change"), ...base, reference: REFERENCE, note: TEXT(0, 1000).optional() }).strict(),
  z.object({ action: z.literal("send_back"), ...base, reason: TEXT(8, 1000) }).strict(),
  z.object({ action: z.literal("implement"), ...base, summary: TEXT(8, 4000), implementedOn: ISO_DATE, url: HTTPS_URL.optional() }).strict(),
  z
    .object({
      action: z.literal("verify"),
      ...base,
      currency: z.string().regex(/^[A-Z]{3}$/, "ISO currency code, e.g. USD"),
      baselineFrom: ISO_DATE,
      baselineTo: ISO_DATE,
      baselineCost: AMOUNT,
      postFrom: ISO_DATE,
      postTo: ISO_DATE,
      postCost: AMOUNT,
      method: z.enum(Object.keys(VERIFICATION_METHODS) as [keyof typeof VERIFICATION_METHODS, ...(keyof typeof VERIFICATION_METHODS)[]]),
      sourceReference: TEXT(3, 1000),
      notes: TEXT(0, 4000).optional(),
    })
    .strict(),
  z.object({ action: z.literal("decline_verification"), ...base, reason: TEXT(8, 1000) }).strict(),
  z.object({ action: z.literal("reject"), ...base, reason: TEXT(8, 1000) }).strict(),
  z.object({ action: z.literal("defer"), ...base, reason: TEXT(8, 1000) }).strict(),
  z.object({ action: z.literal("reopen"), ...base }).strict(),
  z.object({ action: z.literal("close"), ...base }).strict(),
  z.object({ action: z.literal("comment"), ...base, body: TEXT(1, 2000) }).strict(),
]);
export type ActionInput = z.infer<typeof ActionInput>;

// ---------------------------------------------------------------------------------------------------------------
// Savings verification policy (see docs/DATA_DICTIONARY.md)
// ---------------------------------------------------------------------------------------------------------------

export const MIN_WINDOW_DAYS = 7;
export const DAYS_PER_MONTH_X10000 = 304375n; // 30.4375 days (365.25 / 12)

export const daysInclusive = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/**
 * Monthly-normalized savings = (baseline cost / baseline days − post cost / post days) × 30.4375, in micros.
 * Integer arithmetic; rounds toward zero at micro precision.
 */
export function monthlySavingsMicros(baselineMicros: bigint, baselineDays: number, postMicros: bigint, postDays: number): bigint {
  const perMonth = (m: bigint, d: number) => (m * DAYS_PER_MONTH_X10000) / (BigInt(d) * 10_000n);
  return perMonth(baselineMicros, baselineDays) - perMonth(postMicros, postDays);
}

export type WindowCheck = { ok: true; baselineDays: number; postDays: number } | { ok: false; reason: string };

/** Validates the measurement windows against the verification policy. */
export function checkWindows(v: { baselineFrom: string; baselineTo: string; postFrom: string; postTo: string }, implementedOn: string, today: string): WindowCheck {
  const bDays = daysInclusive(v.baselineFrom, v.baselineTo);
  const pDays = daysInclusive(v.postFrom, v.postTo);
  if (bDays < MIN_WINDOW_DAYS || pDays < MIN_WINDOW_DAYS) return { ok: false, reason: `Baseline and post-change windows must each cover at least ${MIN_WINDOW_DAYS} days` };
  if (v.baselineTo >= implementedOn) return { ok: false, reason: "The baseline window must end before the implementation date" };
  if (v.postFrom <= implementedOn) return { ok: false, reason: "The post-change window must start after the implementation date" };
  if (v.postTo > today) return { ok: false, reason: "The post-change window cannot end in the future" };
  return { ok: true, baselineDays: bDays, postDays: pDays };
}
