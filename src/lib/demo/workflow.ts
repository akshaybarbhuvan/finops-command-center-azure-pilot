// Recommendation lifecycle: stages, allowed transitions, role permissions and the pure state reducer.
import type { DemoState, Priority, RecCategory, Recommendation, Role, Stage, Ticket, TicketStatus, User } from "./types";

export const STAGE_META: Record<Stage, { label: string; order: number; description: string; open: boolean }> = {
  identified: { label: "Identified", order: 0, description: "Detected by FCC rules; awaiting FinOps validation", open: true },
  validated: { label: "Validated", order: 1, description: "FinOps confirmed the opportunity; ready to route to a technical owner", open: true },
  assigned: { label: "Assigned", order: 2, description: "Routed to a technical owner; awaiting the owner's decision", open: true },
  in_progress: { label: "In Progress", order: 3, description: "Owner accepted; preparing ticket and remediation plan", open: true },
  submitted: { label: "Pending Change Approval", order: 4, description: "Remediation plan submitted to the organization's change process", open: true },
  approved: { label: "Change Approved", order: 5, description: "Change approval reference recorded; ready to implement", open: true },
  implemented: { label: "Implemented", order: 6, description: "Implemented with evidence; awaiting FinOps financial verification", open: true },
  verified: { label: "Savings Verified", order: 7, description: "FinOps verified savings (simulated billing verification)", open: false },
  closed: { label: "Closed", order: 8, description: "Savings realized and recommendation closed", open: false },
  rejected: { label: "Rejected", order: 9, description: "Not pursued — documented business or technical reason", open: false },
  deferred: { label: "Deferred", order: 10, description: "Postponed with a documented reason — will be revisited", open: false },
};

export const LIFECYCLE: Stage[] = ["identified", "validated", "assigned", "in_progress", "submitted", "approved", "implemented", "verified", "closed"];
export const ALL_STAGES: Stage[] = [...LIFECYCLE, "rejected", "deferred"];

export const TRANSITIONS: Record<Stage, Stage[]> = {
  identified: ["validated", "rejected", "deferred"],
  validated: ["assigned", "rejected", "deferred"],
  assigned: ["assigned", "in_progress", "rejected", "deferred"],
  in_progress: ["submitted", "rejected", "deferred"],
  submitted: ["approved", "rejected", "in_progress"],
  approved: ["implemented"],
  implemented: ["verified"],
  verified: ["closed"],
  closed: [],
  rejected: [],
  deferred: ["validated"],
};

export const isOpen = (s: Stage) => STAGE_META[s].open;
export const isRealized = (s: Stage) => s === "verified" || s === "closed";
export const stageReached = (current: Stage, target: Stage) =>
  LIFECYCLE.includes(current) && LIFECYCLE.indexOf(current) >= LIFECYCLE.indexOf(target);

export function canTransition(from: Stage, to: Stage) {
  return TRANSITIONS[from].includes(to);
}

export const TICKET_STATUS_FOR_STAGE: Partial<Record<Stage, TicketStatus>> = {
  assigned: "Open",
  in_progress: "In Progress",
  submitted: "Pending Approval",
  approved: "Approved",
  implemented: "Resolved",
  verified: "Closed",
  closed: "Closed",
  rejected: "Cancelled",
  deferred: "Cancelled",
};

export type ActionKind =
  | "validate"
  | "assign"
  | "start"
  | "submit"
  | "approve"
  | "send_back"
  | "implement"
  | "verify"
  | "close"
  | "reject"
  | "defer"
  | "reopen"
  | "create_ticket"
  | "comment"
  | "acknowledge_anomaly"
  | "set_anomaly_status";

export interface ActionMetaEntry {
  label: string;
  to?: Stage;
  /** Stages the action is available from, per role. A role absent from this map cannot perform the action. */
  fromByRole: Partial<Record<Role, Stage[]>>;
  tone: "primary" | "neutral" | "danger";
  /** Engineering users may only act on recommendations they own. */
  ownerOnly?: boolean;
  /** A written reason / plan / reference / evidence is mandatory (minimum length enforced in the reducer). */
  requires?: "reason" | "plan" | "reference" | "evidence";
}

export const ACTION_META: Record<Exclude<ActionKind, "comment" | "acknowledge_anomaly" | "set_anomaly_status">, ActionMetaEntry> = {
  validate: { label: "Validate opportunity", to: "validated", fromByRole: { finops: ["identified"] }, tone: "primary" },
  assign: { label: "Route to owner", to: "assigned", fromByRole: { finops: ["validated", "assigned"] }, tone: "primary" },
  start: { label: "Accept & start work", to: "in_progress", fromByRole: { engineering: ["assigned"] }, tone: "primary", ownerOnly: true },
  create_ticket: { label: "Create or link ticket", fromByRole: { engineering: ["in_progress", "submitted", "approved"] }, tone: "neutral", ownerOnly: true },
  submit: { label: "Submit for change approval", to: "submitted", fromByRole: { engineering: ["in_progress"] }, tone: "primary", ownerOnly: true, requires: "plan" },
  approve: { label: "Record change approval", to: "approved", fromByRole: { engineering: ["submitted"] }, tone: "primary", ownerOnly: true, requires: "reference" },
  send_back: { label: "Change not approved — revise plan", to: "in_progress", fromByRole: { engineering: ["submitted"] }, tone: "neutral", ownerOnly: true, requires: "reason" },
  implement: { label: "Mark implemented & submit for verification", to: "implemented", fromByRole: { engineering: ["approved"] }, tone: "primary", ownerOnly: true, requires: "evidence" },
  verify: { label: "Verify savings", to: "verified", fromByRole: { finops: ["implemented"] }, tone: "primary" },
  close: { label: "Close recommendation", to: "closed", fromByRole: { finops: ["verified"] }, tone: "primary" },
  reject: { label: "Reject", to: "rejected", fromByRole: { finops: ["identified", "validated"], engineering: ["assigned", "in_progress"] }, tone: "danger", ownerOnly: true, requires: "reason" },
  defer: { label: "Defer", to: "deferred", fromByRole: { finops: ["identified", "validated"], engineering: ["assigned", "in_progress"] }, tone: "neutral", ownerOnly: true, requires: "reason" },
  reopen: { label: "Reopen", to: "validated", fromByRole: { finops: ["deferred"] }, tone: "neutral" },
};

export type StageAction = keyof typeof ACTION_META;

/** Every stage an action can be taken from by any role. */
export const actionStages = (a: StageAction): Stage[] => Array.from(new Set(Object.values(ACTION_META[a].fromByRole).flat()));
/** Roles that can perform an action from the given stage. */
export const actionRolesAt = (a: StageAction, stage: Stage): Role[] =>
  (Object.keys(ACTION_META[a].fromByRole) as Role[]).filter((r) => ACTION_META[a].fromByRole[r]?.includes(stage));

export const MIN_TEXT = 8;
export const REQUIREMENT_LABEL: Record<NonNullable<ActionMetaEntry["requires"]>, string> = {
  reason: "Reason",
  plan: "Remediation plan",
  reference: "Change approval reference",
  evidence: "Implementation evidence",
};

export type Availability = { allowed: true } | { allowed: false; reason: string };

/** Row-level visibility: engineering owners see only recommendations assigned to them; other roles see the portfolio. */
export function canViewRec(user: User, rec: Recommendation) {
  return user.role !== "engineering" || rec.ownerId === user.id;
}

/** Determines whether a user may perform an action on a recommendation, with a human-readable reason when not. */
export function actionAvailability(action: StageAction, rec: Recommendation, actor: User): Availability {
  const meta = ACTION_META[action];
  if (!canViewRec(actor, rec)) return { allowed: false, reason: "Not available — this recommendation is not assigned to you" };
  if (!actionStages(action).includes(rec.stage)) return { allowed: false, reason: `Not available while ${STAGE_META[rec.stage].label}` };
  const roleFrom = meta.fromByRole[actor.role];
  if (!roleFrom || !roleFrom.includes(rec.stage)) {
    const who = actionRolesAt(action, rec.stage).map((r) => ROLE_LABEL[r]).join(" or ");
    return { allowed: false, reason: `Performed by ${who}` };
  }
  if (meta.ownerOnly && actor.role === "engineering" && rec.ownerId !== actor.id) {
    return { allowed: false, reason: "Only the assigned technical owner can perform this step" };
  }
  if (action === "create_ticket" && rec.ticketId) return { allowed: false, reason: "A ticket is already linked" };
  if (action === "submit" && !rec.ticketId) return { allowed: false, reason: "Create or link a ticket first" };
  return { allowed: true };
}

export type BulkAction = "assign" | "set_priority" | "set_category" | "tag" | "comment" | "share" | "start" | "create_ticket";

/** Bulk operations each role may run. Approval, implementation and verification are never bulk operations. */
export const BULK_ACTIONS_BY_ROLE: Record<Role, BulkAction[]> = {
  finops: ["assign", "set_priority", "set_category", "tag", "comment", "share"],
  engineering: ["start", "tag", "comment", "create_ticket"],
  executive: [],
  admin: [],
};

export const BULK_LABEL: Record<BulkAction, string> = {
  assign: "Route to owner",
  set_priority: "Set priority",
  set_category: "Set category",
  tag: "Add tag",
  comment: "Add comment",
  share: "Share",
  start: "Accept (triage)",
  create_ticket: "Create tickets (one per recommendation)",
};

/** Per-record check for bulk operations; returns a reason when a record is incompatible. */
export function bulkAvailability(action: BulkAction, rec: Recommendation, actor: User): Availability {
  if (!canViewRec(actor, rec)) return { allowed: false, reason: "Not visible to you" };
  if (!BULK_ACTIONS_BY_ROLE[actor.role].includes(action)) return { allowed: false, reason: `Not permitted for ${ROLE_LABEL[actor.role]}` };
  if (action === "assign" || action === "start" || action === "create_ticket") return actionAvailability(action, rec, actor);
  if ((action === "set_priority" || action === "set_category") && !isOpen(rec.stage)) return { allowed: false, reason: `Not editable while ${STAGE_META[rec.stage].label}` };
  return { allowed: true };
}

export const ROLE_LABEL: Record<Role, string> = {
  executive: "Executive",
  finops: "FinOps",
  engineering: "Engineering",
  admin: "Administrator",
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type WorkflowCommand =
  | { kind: StageAction; recId: string; note?: string; ownerId?: string; linkRef?: string }
  | { kind: "comment"; recId: string; body: string; evidence?: boolean }
  | { kind: "set_priority"; recId: string; priority: Priority }
  | { kind: "set_category"; recId: string; category: RecCategory }
  | { kind: "tag"; recId: string; tag: string }
  | { kind: "share"; recId: string; userIds: string[]; note?: string }
  | { kind: "set_anomaly_status"; anomalyId: string; status: "Investigating" | "Acknowledged" | "Resolved" };

export interface WorkflowContext {
  actor: User;
  asOf: string;
  users: User[];
}

export class WorkflowError extends Error {}

const ticketTitle = (rec: Recommendation) => `[FinOps] ${rec.title}`;

function nextTicketId(state: DemoState) {
  const max = state.tickets.reduce((m, t) => Math.max(m, Number(t.id.split("-")[1])), 1000);
  return `FCC-${max + 1}`;
}

export function buildTicket(state: DemoState, rec: Recommendation, assigneeId: string, at: string, externalRef?: string): Ticket {
  return {
    id: nextTicketId(state),
    recommendationId: rec.id,
    title: ticketTitle(rec),
    assigneeId,
    priority: rec.priority as Priority,
    status: TICKET_STATUS_FOR_STAGE[rec.stage] ?? "Open",
    createdAt: at,
    updatedAt: at,
    dueDate: rec.dueDate,
    system: "Local Demo Ticketing",
    ...(externalRef ? { externalRef } : {}),
  };
}

const requireText = (value: string | undefined, label: string) => {
  const v = (value ?? "").trim();
  if (v.length < MIN_TEXT) throw new WorkflowError(`${label} is required (at least ${MIN_TEXT} characters)`);
  return v;
};

export function applyCommand(state: DemoState, cmd: WorkflowCommand, ctx: WorkflowContext): DemoState {
  const seq = state.sequence + 1;
  const at = ctx.asOf;
  const actor = ctx.actor;
  const audit = (action: string, target: string, detail: string) => ({
    id: `evt-${seq}`,
    at,
    actorId: actor.id,
    action,
    target,
    detail,
  });

  if (cmd.kind === "set_anomaly_status") {
    if (actor.role === "executive") throw new WorkflowError("Leadership has read-only access to anomalies");
    const anomalies = state.anomalies.map((a) =>
      a.id === cmd.anomalyId
        ? { ...a, status: cmd.status, acknowledgedBy: cmd.status === "Acknowledged" || cmd.status === "Resolved" ? actor.id : a.acknowledgedBy }
        : a,
    );
    return { ...state, anomalies, sequence: seq, audit: [audit("Anomaly status changed", cmd.anomalyId, `Status set to ${cmd.status}`), ...state.audit] };
  }

  const rec = state.recommendations.find((r) => r.id === cmd.recId);
  // Out-of-scope records are reported exactly like missing ones so their existence is not disclosed.
  if (!rec || !canViewRec(actor, rec)) throw new WorkflowError(`Recommendation ${cmd.recId} was not found`);

  if (cmd.kind === "comment") {
    if (actor.role !== "finops" && actor.role !== "engineering") throw new WorkflowError(`${ROLE_LABEL[actor.role]} has read-only access to recommendations`);
    const body = cmd.body.trim();
    if (!body) throw new WorkflowError("Comment cannot be empty");
    const updated: Recommendation = {
      ...rec,
      comments: [...rec.comments, { id: `c-${seq}`, authorId: actor.id, at, body, kind: cmd.evidence ? "evidence" : "comment" }],
    };
    return replaceRec(state, updated, seq, audit(cmd.evidence ? "Evidence added" : "Comment added", rec.id, body.slice(0, 120)));
  }

  if (cmd.kind === "set_priority" || cmd.kind === "set_category" || cmd.kind === "tag" || cmd.kind === "share") {
    const bulkKind: BulkAction = cmd.kind;
    const av = bulkAvailability(bulkKind, rec, actor);
    if (!av.allowed) throw new WorkflowError(av.reason);
    if (cmd.kind === "set_priority") {
      if (rec.priority === cmd.priority) return state;
      return replaceRec(state, { ...rec, priority: cmd.priority }, seq, audit("Priority changed", rec.id, `${rec.priority} → ${cmd.priority}`));
    }
    if (cmd.kind === "set_category") {
      if (rec.category === cmd.category) return state;
      return replaceRec(state, { ...rec, category: cmd.category }, seq, audit("Category changed", rec.id, `${rec.category} → ${cmd.category}`));
    }
    if (cmd.kind === "tag") {
      const tag = cmd.tag.trim();
      if (!tag) throw new WorkflowError("Tag cannot be empty");
      const tags = rec.tags ?? [];
      if (tags.includes(tag)) return state;
      return replaceRec(state, { ...rec, tags: [...tags, tag] }, seq, audit("Tag added", rec.id, tag));
    }
    const recipients = cmd.userIds.filter((id) => ctx.users.some((u) => u.id === id));
    if (!recipients.length) throw new WorkflowError("Select at least one recipient");
    const sharedWith = Array.from(new Set([...(rec.sharedWith ?? []), ...recipients]));
    return replaceRec(
      state,
      { ...rec, sharedWith },
      seq,
      audit("Shared (local notification)", rec.id, `Shared with ${recipients.map((id) => userName(ctx, id)).join(", ")}${cmd.note ? ` — ${cmd.note.slice(0, 80)}` : ""}`),
    );
  }

  const availability = actionAvailability(cmd.kind, rec, actor);
  if (!availability.allowed) throw new WorkflowError(availability.reason);
  const meta = ACTION_META[cmd.kind];
  const text = meta.requires ? requireText(cmd.note, REQUIREMENT_LABEL[meta.requires]) : cmd.note?.trim() || undefined;

  if (cmd.kind === "create_ticket") {
    const assignee = rec.ownerId ?? actor.id;
    const linkRef = cmd.linkRef?.trim() || undefined;
    const ticket = buildTicket(state, rec, assignee, at, linkRef);
    const body = linkRef
      ? `Ticket ${ticket.id} created in Local Demo Ticketing, linked to external reference ${linkRef}.`
      : `Ticket ${ticket.id} created in Local Demo Ticketing.`;
    const updated: Recommendation = {
      ...rec,
      ticketId: ticket.id,
      comments: [...rec.comments, { id: `c-${seq}`, authorId: actor.id, at, body, kind: "system" }],
    };
    const next = replaceRec(state, updated, seq, audit("Ticket created", rec.id, `${ticket.id} assigned to ${userName(ctx, assignee)}${linkRef ? ` (linked ${linkRef})` : ""}`));
    return { ...next, tickets: [ticket, ...next.tickets] };
  }

  const to = meta.to as Stage;
  if (!canTransition(rec.stage, to)) throw new WorkflowError(`Invalid transition ${rec.stage} → ${to}`);

  let updated: Recommendation = {
    ...rec,
    stage: to,
    history: [...rec.history, { stage: to, at, byUserId: actor.id, note: text }],
  };

  if (cmd.kind === "assign") {
    if (!cmd.ownerId) throw new WorkflowError("A technical owner is required");
    const owner = ctx.users.find((u) => u.id === cmd.ownerId);
    if (!owner || owner.role !== "engineering") throw new WorkflowError("Recommendations can only be routed to an engineering owner");
    updated = { ...updated, ownerId: owner.id, teamId: owner.teamId, ownerDecision: null };
  }
  if (cmd.kind === "start") {
    updated = { ...updated, ownerDecision: { decision: "accepted", at, byUserId: actor.id, reason: text ?? "" } };
  }
  if (cmd.kind === "reject" || cmd.kind === "defer") {
    const decision = cmd.kind === "reject" ? "rejected" : "deferred";
    if (actor.role === "engineering") updated = { ...updated, ownerDecision: { decision, at, byUserId: actor.id, reason: text as string } };
    else updated = { ...updated, approval: { approverId: actor.id, at, decision, note: text as string } };
  }
  if (cmd.kind === "submit") updated = { ...updated, remediationPlan: text };
  if (cmd.kind === "approve") {
    updated = {
      ...updated,
      changeApproval: { reference: text as string, at, recordedBy: actor.id, simulated: true },
      approval: { approverId: actor.id, at, decision: "approved", note: `Change approval reference ${text} (recorded locally — simulated)` },
    };
  }
  if (cmd.kind === "verify") {
    updated = { ...updated, realizedDate: at, realizedMonthlySavings: rec.estimatedMonthlySavings };
  }
  if (text) {
    updated = {
      ...updated,
      comments: [...updated.comments, { id: `c-${seq}`, authorId: actor.id, at, body: text, kind: cmd.kind === "implement" || cmd.kind === "submit" ? "evidence" : "comment" }],
    };
  }

  let next = replaceRec(state, updated, seq, audit(meta.label, rec.id, `${STAGE_META[rec.stage].label} → ${STAGE_META[to].label}${text ? ` — ${text.slice(0, 100)}` : ""}`));

  // Keep the linked ticket in sync with the lifecycle (local demo ticketing only).
  if (updated.ticketId) {
    const status = TICKET_STATUS_FOR_STAGE[to];
    next = {
      ...next,
      tickets: next.tickets.map((t) =>
        t.id === updated.ticketId ? { ...t, status: status ?? t.status, assigneeId: updated.ownerId ?? t.assigneeId, updatedAt: at } : t,
      ),
    };
  }
  return next;
}

function userName(ctx: WorkflowContext, id: string) {
  return ctx.users.find((u) => u.id === id)?.name ?? id;
}

function replaceRec(state: DemoState, rec: Recommendation, seq: number, event: DemoState["audit"][number]): DemoState {
  return {
    ...state,
    sequence: seq,
    recommendations: state.recommendations.map((r) => (r.id === rec.id ? rec : r)),
    audit: [event, ...state.audit],
  };
}
