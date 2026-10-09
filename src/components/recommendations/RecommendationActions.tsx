"use client";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Info, MoreHorizontal, Ticket } from "lucide-react";
import { Button, cx } from "@/components/ui/primitives";
import { Modal, useToast } from "@/components/ui/overlay";
import { useDemo } from "@/lib/demo/store";
import { annual, lookup } from "@/lib/demo/selectors";
import { ACTION_META, actionAvailability, actionStages, MIN_TEXT, STAGE_META, type StageAction } from "@/lib/demo/workflow";
import { date, money, moneyExact } from "@/lib/format";
import type { Recommendation } from "@/lib/demo/types";

function nextAction(rec: Recommendation): StageAction | undefined {
  switch (rec.stage) {
    case "identified":
      return "validate";
    case "validated":
      return "assign";
    case "assigned":
      return "start";
    case "in_progress":
      return rec.ticketId ? "submit" : "create_ticket";
    case "submitted":
      return "approve";
    case "approved":
      return "implement";
    case "implemented":
      return "verify";
    case "verified":
      return "close";
    case "deferred":
      return "reopen";
    default:
      return undefined;
  }
}

const NEXT_HINT: Partial<Record<StageAction, string>> = {
  validate: "Next: FinOps routes it to an engineering owner.",
  assign: "Next: the engineering owner accepts or rejects with a reason.",
  start: "Next: the owner creates or links a ticket.",
  create_ticket: "Next: the owner submits a remediation plan for change approval.",
  submit: "Next: the owner records the change approval reference.",
  approve: "Next: the owner implements the change and attaches evidence.",
  implement: "Submitted to FinOps for financial verification.",
  verify: "Savings now count as verified on every dashboard.",
  close: "Recommendation closed with verified savings.",
  reject: "Recommendation removed from the open pipeline.",
  defer: "Recommendation paused; FinOps can reopen it.",
  reopen: "Recommendation back in the validated queue.",
  send_back: "Returned to the owner to revise the plan.",
};

const FIELD: Partial<Record<StageAction, { label: string; placeholder: string; multiline: boolean }>> = {
  submit: { label: "Remediation plan", placeholder: "Change, maintenance window, rollback plan and validation steps…", multiline: true },
  approve: { label: "Change approval reference", placeholder: "e.g. CHG-DEMO-0001 (simulated)", multiline: false },
  implement: { label: "Implementation evidence", placeholder: "What was changed, when, and how it was validated…", multiline: true },
  reject: { label: "Reason for rejection", placeholder: "Business or technical reason this will not be pursued…", multiline: true },
  defer: { label: "Reason for deferral", placeholder: "Why this is postponed and when to revisit…", multiline: true },
  send_back: { label: "Why the change was not approved", placeholder: "What the change board asked to revise…", multiline: true },
  validate: { label: "Validation note (optional)", placeholder: "How the estimate was validated…", multiline: true },
  verify: { label: "Verification note (optional)", placeholder: "Billing cycle reviewed, variance to estimate…", multiline: true },
  start: { label: "Acceptance note (optional)", placeholder: "Initial assessment or constraints…", multiline: true },
};

const HERO_PREFILL: Partial<Record<StageAction, string>> = {
  submit:
    "Rolling resize plan: secondary nodes first, fail over via HANA system replication, primary nodes in the Saturday 02:00–06:00 window. Rollback: resize back to M208ms_v2 (≈ 40 min per node). SAP Basis confirmed 2.4 TB peak memory fits M128ms_v2 with headroom.",
  approve: "CHG-DEMO-2041",
  implement: "All four HANA nodes resized to M128ms_v2 during the approved window. System replication healthy, SAP Basis smoke tests passed, peak memory 61% post-change.",
};

type Extra = { note?: string; ownerId?: string; linkRef?: string };

export function RecommendationActions({ rec, layout = "row" }: { rec: Recommendation; layout?: "row" | "stack" }) {
  const { user, persona, dispatch, ds } = useDemo();
  const toast = useToast();
  const L = lookup(ds);
  const [dialog, setDialog] = useState<StageAction | null>(null);
  const [menu, setMenu] = useState(false);
  const next = nextAction(rec);
  const nextAvail = next ? actionAvailability(next, rec, user) : null;

  // Secondary actions are shown only when this user can actually perform them — no dead buttons.
  const secondary = (["assign", "create_ticket", "send_back", "defer", "reject"] as StageAction[]).filter(
    (a) => a !== next && actionStages(a).includes(rec.stage) && actionAvailability(a, rec, user).allowed,
  );
  const readOnly = persona === "executive" || persona === "admin";

  const run = (action: StageAction, extra: Extra = {}) => {
    const res = dispatch({ kind: action, recId: rec.id, ...extra });
    if (!res.ok) {
      toast({ kind: "error", title: "Action not completed", body: res.error });
      return false;
    }
    const label = ACTION_META[action].label;
    let body = NEXT_HINT[action] ?? "";
    if (action === "assign" && extra.ownerId) body = `Owner: ${L.userName(extra.ownerId)}. ${body}`;
    if (action === "verify") body = `${money(annual(rec))}/yr moved to verified (simulated billing verification). ${body}`;
    toast({ kind: "success", title: `${label} — ${rec.id}`, body });
    return true;
  };

  if (!next && !secondary.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        {rec.stage === "rejected" ? "Rejected — no further action" : "Lifecycle complete"}
      </div>
    );
  }

  return (
    <div className={cx("flex gap-2", layout === "stack" ? "flex-col items-stretch" : "flex-wrap items-center")}>
      {next && nextAvail?.allowed && (
        <Button variant="primary" onClick={() => setDialog(next)} icon={<ArrowRight className="h-4 w-4" aria-hidden />}>
          {ACTION_META[next].label}
        </Button>
      )}
      {next && nextAvail && !nextAvail.allowed && (
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          <span>
            Next step: <strong className="font-semibold text-slate-800">{ACTION_META[next].label}</strong>
            {" — "}
            {nextAvail.reason.charAt(0).toLowerCase() + nextAvail.reason.slice(1)}
            {readOnly ? ". Your role has read-only access to the workflow." : "."}
          </span>
        </div>
      )}
      {secondary.length > 0 && (
        <div className="relative">
          <Button variant="secondary" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu} icon={<MoreHorizontal className="h-4 w-4" aria-hidden />}>
            More
          </Button>
          {menu && (
            <div role="menu" className="absolute right-0 z-30 mt-1 w-64 animate-scale-in rounded-xl border border-line bg-white p-1.5 shadow-lift" onMouseLeave={() => setMenu(false)}>
              {secondary.map((a) => {
                const av = actionAvailability(a, rec, user);
                return (
                  <button
                    key={a}
                    role="menuitem"
                    type="button"
                    disabled={!av.allowed}
                    onClick={() => {
                      setMenu(false);
                      setDialog(a);
                    }}
                    className={cx("flex w-full flex-col rounded-lg px-2.5 py-2 text-left", av.allowed ? "hover:bg-slate-50" : "cursor-not-allowed opacity-60")}
                  >
                    <span className={cx("flex items-center gap-2 text-[13px] font-medium", ACTION_META[a].tone === "danger" ? "text-rose-700" : "text-slate-800")}>
                      {a === "create_ticket" && <Ticket className="h-3.5 w-3.5" aria-hidden />}
                      {ACTION_META[a].label}
                    </span>
                    {!av.allowed && <span className="text-[11px] text-slate-500">{av.reason}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {dialog && <ActionDialog action={dialog} rec={rec} onClose={() => setDialog(null)} onConfirm={(extra) => run(dialog, extra) && setDialog(null)} />}
    </div>
  );
}

function ActionDialog({ action, rec, onClose, onConfirm }: { action: StageAction; rec: Recommendation; onClose: () => void; onConfirm: (extra: Extra) => void }) {
  const { ds } = useDemo();
  const L = lookup(ds);
  const meta = ACTION_META[action];
  const field = FIELD[action];
  const required = !!meta.requires;
  const candidates = useMemo(() => {
    const eng = ds.users.filter((u) => u.role === "engineering");
    return [...eng.filter((u) => u.teamId === rec.teamId), ...eng.filter((u) => u.teamId !== rec.teamId)];
  }, [ds.users, rec.teamId]);
  const [ownerId, setOwnerId] = useState(rec.ownerId && action === "assign" ? rec.ownerId : (candidates[0]?.id ?? ""));
  const [note, setNote] = useState((rec.isHero && HERO_PREFILL[action]) || "");
  const [linkRef, setLinkRef] = useState("");
  const tooShort = required && note.trim().length < MIN_TEXT;
  const valid = !tooShort && (action !== "assign" || !!ownerId);
  const submit = () =>
    onConfirm({ note: note.trim() || undefined, ownerId: action === "assign" ? ownerId : undefined, linkRef: action === "create_ticket" ? linkRef.trim() || undefined : undefined });

  return (
    <Modal
      open
      onClose={onClose}
      title={`${meta.label} · ${rec.id}`}
      description={
        <>
          {STAGE_META[rec.stage].label}
          {meta.to ? ` → ${STAGE_META[meta.to].label}` : ""} · {money(annual(rec))}/yr estimated
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={meta.tone === "danger" ? "danger" : "primary"} disabled={!valid} onClick={submit}>
            {meta.label}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm font-medium text-slate-900">{rec.title}</p>
        {action === "assign" && (
          <div>
            <label htmlFor="owner" className="text-xs font-medium text-slate-600">
              Engineering owner
            </label>
            <select id="owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="input mt-1">
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {L.teamName(u.teamId)}
                  {u.teamId === rec.teamId ? " (owning team)" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11.5px] text-slate-500">
              The owner accepts or rejects, raises the ticket and records change approval. SLA due {date(rec.dueDate)}.
            </p>
          </div>
        )}
        {action === "create_ticket" && (
          <div className="space-y-3">
            <div>
              <label htmlFor="linkref" className="text-xs font-medium text-slate-600">
                External reference to link (optional)
              </label>
              <input id="linkref" value={linkRef} onChange={(e) => setLinkRef(e.target.value)} placeholder="e.g. INC-DEMO-1234" className="input mt-1" />
            </div>
            <p className="flex gap-2 rounded-lg border border-line bg-slate-50 p-3 text-xs text-slate-600">
              <Ticket className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Creates a ticket in Local Demo Ticketing. Tickets stay in this browser; no ServiceNow, Jira or Azure DevOps call is made.
            </p>
          </div>
        )}
        {action === "approve" && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Records the reference of a change approval granted in your change process. Local demo — simulated; no change-management system is contacted. FinOps is not the change approver.
          </p>
        )}
        {action === "verify" && (
          <div className="rounded-lg border border-sky-100 bg-sky-50 p-3 text-xs text-sky-900">
            Simulated billing verification. In production, FinOps verifies savings against a full post-change billing cycle; here the estimate of {moneyExact(rec.estimatedMonthlySavings)}/mo is recorded as verified.
          </div>
        )}
        {field && (
          <div>
            <label htmlFor="note" className="text-xs font-medium text-slate-600">
              {field.label}
              {required && <span className="text-rose-600"> *</span>}
            </label>
            {field.multiline ? (
              <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder={field.placeholder} aria-required={required} className="input mt-1 h-auto py-2" />
            ) : (
              <input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={field.placeholder} aria-required={required} className="input mt-1" />
            )}
            {tooShort && <p className="mt-1 text-[11.5px] text-slate-500">Required.</p>}
          </div>
        )}
        {!field && action !== "assign" && action !== "create_ticket" && <p className="text-sm text-slate-600">{STAGE_META[meta.to ?? rec.stage].description}.</p>}
      </div>
    </Modal>
  );
}
