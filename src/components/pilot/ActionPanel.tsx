"use client";
// Workflow actions for one recommendation. The server decides which actions are offered (same rules it enforces)
// and re-validates every request; this component only collects input and shows the result.
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { Modal, useToast } from "@/components/ui/overlay";
import { ACTIONS, PRIORITIES, VERIFICATION_METHODS, type PilotAction } from "@/pilot/workflow/rules";

export interface OfferedAction {
  action: PilotAction;
  allowed: boolean;
  reason?: string;
}

type Field = { name: string; label: string; kind: "text" | "textarea" | "date" | "url" | "amount" | "select" | "currency"; required?: boolean; options?: { value: string; label: string }[]; help?: string };

function fieldsFor(action: PilotAction, owners: { id: string; name: string }[], currency: string | null): Field[] {
  switch (action) {
    case "assign":
      return [
        { name: "ownerId", label: "Engineering owner", kind: "select", required: true, options: owners.map((o) => ({ value: o.id, label: o.name })), help: "Only users with the FCC.Engineering role who have signed in at least once are listed." },
        { name: "dueDate", label: "Due date (optional)", kind: "date" },
      ];
    case "set_priority":
      return [{ name: "priority", label: "Priority", kind: "select", required: true, options: PRIORITIES.map((p) => ({ value: p, label: p })) }];
    case "validate":
    case "start":
      return [{ name: "note", label: "Note (optional)", kind: "textarea" }];
    case "record_ticket":
      return [
        { name: "reference", label: "Ticket ID", kind: "text", required: true, help: "Recorded as entered. FCC does not query the ticketing system." },
        { name: "url", label: "Ticket link (optional, https)", kind: "url" },
      ];
    case "submit":
      return [{ name: "plan", label: "Remediation plan", kind: "textarea", required: true, help: "Scope, change window, rollback. At least 8 characters." }];
    case "record_change":
      return [
        { name: "reference", label: "Change approval reference", kind: "text", required: true, help: "From your change-management process. Recorded as entered; not verified externally." },
        { name: "note", label: "Note (optional)", kind: "textarea" },
      ];
    case "send_back":
    case "reject":
    case "defer":
    case "decline_verification":
      return [{ name: "reason", label: "Reason", kind: "textarea", required: true }];
    case "implement":
      return [
        { name: "implementedOn", label: "Implemented on", kind: "date", required: true },
        { name: "summary", label: "Implementation evidence", kind: "textarea", required: true, help: "What changed, when, and how it was validated." },
        { name: "url", label: "Evidence link (optional, https)", kind: "url" },
      ];
    case "verify":
      return [
        { name: "currency", label: "Currency (ISO code)", kind: "currency", required: true, help: currency ? `Must match the recommendation currency (${currency}).` : undefined },
        { name: "baselineFrom", label: "Baseline window start", kind: "date", required: true },
        { name: "baselineTo", label: "Baseline window end (before implementation)", kind: "date", required: true },
        { name: "baselineCost", label: "Baseline cost in window", kind: "amount", required: true },
        { name: "postFrom", label: "Post-change window start (after implementation)", kind: "date", required: true },
        { name: "postTo", label: "Post-change window end", kind: "date", required: true },
        { name: "postCost", label: "Post-change cost in window", kind: "amount", required: true },
        { name: "method", label: "Method", kind: "select", required: true, options: Object.entries(VERIFICATION_METHODS).map(([value, label]) => ({ value, label })) },
        { name: "sourceReference", label: "Source evidence reference", kind: "text", required: true, help: "e.g. Cost Management saved view, export file or invoice reference." },
        { name: "notes", label: "Notes (optional)", kind: "textarea" },
      ];
    case "comment":
      return [{ name: "body", label: "Comment", kind: "textarea", required: true }];
    default:
      return [];
  }
}

export function ActionPanel({ recId, version, offered, owners, currency }: { recId: string; version: number; offered: OfferedAction[]; owners: { id: string; name: string }[]; currency: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<PilotAction | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = useMemo(() => (open ? fieldsFor(open, owners, currency) : []), [open, owners, currency]);
  const allowed = offered.filter((o) => o.allowed);
  const blocked = offered.filter((o) => !o.allowed && o.reason);

  if (!allowed.length) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {blocked[0]?.reason ? `No action available to you: ${blocked[0].reason.charAt(0).toLowerCase()}${blocked[0].reason.slice(1)}.` : "No workflow action is available to you for this recommendation."}
      </p>
    );
  }

  const start = (a: PilotAction) => {
    setOpen(a);
    setError(null);
    setValues(a === "verify" && currency ? { currency } : a === "assign" && owners[0] ? { ownerId: owners[0].id } : a === "set_priority" ? { priority: "High" } : a === "verify" ? { method: "cost_management_before_after" } : {});
  };

  const submit = async () => {
    if (!open) return;
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { action: open, expectedVersion: version };
    for (const f of fields) {
      const v = (values[f.name] ?? "").trim();
      if (v) body[f.name] = v;
    }
    if (open === "verify" && !body.method) body.method = "cost_management_before_after";
    try {
      const res = await fetch(`/api/recommendations/${recId}/actions`, { method: "POST", headers: { "content-type": "application/json", "x-fcc-request": "1" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? `Request failed (${res.status})`);
        return;
      }
      toast({ kind: "success", title: ACTIONS[open].label, body: "Saved." });
      setOpen(null);
      router.refresh();
    } catch {
      setError("Network error. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {allowed.map((o) => (
        <Button key={o.action} variant={ACTIONS[o.action].tone === "primary" ? "primary" : ACTIONS[o.action].tone === "danger" ? "danger" : "secondary"} onClick={() => start(o.action)}>
          {ACTIONS[o.action].label}
        </Button>
      ))}
      {open && (
        <Modal
          open
          onClose={() => !busy && setOpen(null)}
          title={ACTIONS[open].label}
          size={open === "verify" ? "lg" : "md"}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(null)} disabled={busy}>
                Cancel
              </Button>
              <Button variant={ACTIONS[open].tone === "danger" ? "danger" : "primary"} onClick={submit} loading={busy}>
                {ACTIONS[open].label}
              </Button>
            </div>
          }
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {open === "verify" && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Verified savings are computed as (baseline cost ÷ baseline days − post-change cost ÷ post-change days) × 30.4375. Each window must cover at least 7 days, the baseline must end before
                the implementation date, and the post-change window must start after it. Use figures from Azure Cost Management or invoices, not the Advisor estimate.
              </p>
            )}
            {fields.map((f) => {
              const id = `f-${f.name}`;
              const common = { id, name: f.name, required: f.required, value: values[f.name] ?? "", onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [f.name]: e.target.value })), "aria-describedby": f.help ? `${id}-help` : undefined };
              return (
                <div key={f.name}>
                  <label htmlFor={id} className="text-xs font-medium text-slate-700">
                    {f.label}
                    {f.required ? " *" : ""}
                  </label>
                  {f.kind === "textarea" ? (
                    <textarea {...common} rows={4} className="input mt-1 h-auto py-2" maxLength={4000} />
                  ) : f.kind === "select" ? (
                    <select {...common} className="input mt-1">
                      {!f.required && <option value="">—</option>}
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      {...common}
                      className="input mt-1"
                      type={f.kind === "date" ? "date" : f.kind === "url" ? "url" : "text"}
                      inputMode={f.kind === "amount" ? "decimal" : undefined}
                      pattern={f.kind === "amount" ? "\\d+(\\.\\d{1,6})?" : f.kind === "currency" ? "[A-Z]{3}" : undefined}
                      maxLength={f.kind === "url" ? 1000 : 128}
                    />
                  )}
                  {f.help && (
                    <p id={`${id}-help`} className="mt-1 text-[11px] text-slate-500">
                      {f.help}
                    </p>
                  )}
                </div>
              );
            })}
            {open === "assign" && !owners.length && <p className="text-xs text-rose-700">No eligible engineering owners yet. Users appear here after their first sign-in with the FCC.Engineering role.</p>}
            {error && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {error}
              </p>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
