"use client";
// Bulk selection toolbar and preview/confirm flow. Shown only while rows are selected.
// Every record is re-authorized individually (bulkAvailability in the UI, then again inside the reducer),
// audited individually, and reported back as a per-record success/failure summary.
// Approval, implementation and verification are never offered as bulk operations.
import { CheckCircle2, ListChecks, X, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { ExportButton } from "@/components/data/blocks";
import { Modal, useToast } from "@/components/ui/overlay";
import { Badge, Button } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { annual, lookup, PRIORITIES, REC_CATEGORIES } from "@/lib/demo/selectors";
import { BULK_ACTIONS_BY_ROLE, BULK_LABEL, bulkAvailability, MIN_TEXT, STAGE_META, type BulkAction, type WorkflowCommand } from "@/lib/demo/workflow";
import type { CsvColumn } from "@/lib/csv";
import type { Dataset, Priority, RecCategory, Recommendation } from "@/lib/demo/types";

export function recExportColumns(ds: Dataset): CsvColumn<Recommendation>[] {
  const L = lookup(ds);
  return [
    { header: "ID", value: (r) => r.id },
    { header: "Title", value: (r) => r.title },
    { header: "Stage", value: (r) => STAGE_META[r.stage].label },
    { header: "Category", value: (r) => r.category },
    { header: "Priority", value: (r) => r.priority },
    { header: "Team", value: (r) => L.teamName(r.teamId) },
    { header: "Owner", value: (r) => L.userName(r.ownerId) },
    { header: "Subscription", value: (r) => L.subName(r.subscriptionId) },
    { header: "Resource group", value: (r) => r.resourceGroup },
    { header: "Ticket", value: (r) => r.ticketId ?? "" },
    { header: "Est. monthly savings (USD)", value: (r) => r.estimatedMonthlySavings },
    { header: "Est. annual savings (USD)", value: (r) => annual(r) },
    { header: "Due", value: (r) => r.dueDate },
  ];
}

interface Proposed {
  ownerId: string;
  priority: Priority;
  category: RecCategory;
  text: string;
  shareIds: string[];
}

function buildCommand(action: BulkAction, recId: string, p: Proposed): WorkflowCommand {
  switch (action) {
    case "assign":
      return { kind: "assign", recId, ownerId: p.ownerId, note: p.text.trim() || undefined };
    case "set_priority":
      return { kind: "set_priority", recId, priority: p.priority };
    case "set_category":
      return { kind: "set_category", recId, category: p.category };
    case "tag":
      return { kind: "tag", recId, tag: p.text.trim() };
    case "comment":
      return { kind: "comment", recId, body: p.text.trim() };
    case "share":
      return { kind: "share", recId, userIds: p.shareIds, note: p.text.trim() || undefined };
    case "start":
      return { kind: "start", recId, note: p.text.trim() || undefined };
    case "create_ticket":
      return { kind: "create_ticket", recId, note: p.text.trim() || undefined };
  }
}

function proposedSummary(action: BulkAction, p: Proposed, ds: Dataset) {
  const L = lookup(ds);
  switch (action) {
    case "assign":
      return `Owner → ${L.userName(p.ownerId)}`;
    case "set_priority":
      return `Priority → ${p.priority}`;
    case "set_category":
      return `Category → ${p.category}`;
    case "tag":
      return `Tag “${p.text.trim()}”`;
    case "comment":
      return "Comment added to each record";
    case "share":
      return `Share with ${p.shareIds.map((id) => L.userName(id)).join(", ")}`;
    case "start":
      return "Accepted by owner — moves to In progress";
    case "create_ticket":
      return "One simulated ticket per recommendation";
  }
}

export function BulkActionBar({
  selected,
  allRows,
  onSelectAll,
  onClear,
  exportName,
}: {
  selected: Recommendation[];
  allRows: Recommendation[];
  onSelectAll: () => void;
  onClear: () => void;
  exportName: string;
}) {
  const { ds, user, persona, dispatchMany } = useDemo();
  const [action, setAction] = useState<BulkAction | null>(null);
  const actions = BULK_ACTIONS_BY_ROLE[persona];
  const columns = useMemo(() => recExportColumns(ds), [ds]);
  if (selected.length === 0) return null;
  const allSelected = selected.length === allRows.length;

  return (
    <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/70 px-3 py-2 animate-fade-up">
      <ListChecks className="h-4 w-4 text-brand-700" aria-hidden />
      <span className="text-sm font-semibold text-brand-900" role="status" aria-live="polite">
        {selected.length.toLocaleString("en-US")} selected
      </span>
      {!allSelected && allRows.length > selected.length && (
        <Button size="sm" variant="ghost" onClick={onSelectAll}>
          Select all {allRows.length.toLocaleString("en-US")} filtered
        </Button>
      )}
      {allSelected && allRows.length > 0 && <span className="text-xs text-brand-800">All filtered results selected</span>}
      <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" aria-hidden />} onClick={onClear}>
        Clear
      </Button>
      <span className="mx-1 hidden h-5 w-px bg-brand-200 sm:block" aria-hidden />
      <div className="flex flex-wrap items-center gap-1.5">
        {actions.map((a) => (
          <Button key={a} size="sm" variant="secondary" onClick={() => setAction(a)}>
            {BULK_LABEL[a]}
          </Button>
        ))}
        <ExportButton rows={selected} columns={columns} filename={exportName} label="Export selected" size="sm" />
      </div>
      {action && (
        <BulkDialog
          action={action}
          records={selected}
          onClose={() => setAction(null)}
          onDone={onClear}
          ds={ds}
          dispatchMany={dispatchMany}
          userName={user.name}
          persona={persona}
        />
      )}
    </div>
  );
}

function BulkDialog({
  action,
  records,
  onClose,
  onDone,
  ds,
  dispatchMany,
}: {
  action: BulkAction;
  records: Recommendation[];
  onClose: () => void;
  onDone: () => void;
  ds: Dataset;
  dispatchMany: ReturnType<typeof useDemo>["dispatchMany"];
  userName: string;
  persona: string;
}) {
  const { user } = useDemo();
  const toast = useToast();
  const L = lookup(ds);
  const engineers = useMemo(() => ds.users.filter((u) => u.role === "engineering"), [ds.users]);
  const shareable = useMemo(() => ds.users.filter((u) => u.id !== user.id), [ds.users, user.id]);
  const [p, setP] = useState<Proposed>({ ownerId: engineers[0]?.id ?? "", priority: "High", category: "Compute", text: "", shareIds: [] });
  const [results, setResults] = useState<{ rec: Recommendation; ok: boolean; error?: string }[] | null>(null);

  const checked = useMemo(() => records.map((rec) => ({ rec, av: bulkAvailability(action, rec, user) })), [records, action, user]);
  const compatible = checked.filter((c) => c.av.allowed).map((c) => c.rec);
  const incompatible = checked.filter((c) => !c.av.allowed);

  const textRequired = action === "tag" || action === "comment";
  const textMin = action === "comment" ? 3 : 1;
  const valid =
    compatible.length > 0 &&
    (!textRequired || p.text.trim().length >= textMin) &&
    (action !== "assign" || !!p.ownerId) &&
    (action !== "share" || p.shareIds.length > 0);

  const confirm = () => {
    const out = dispatchMany(compatible.map((r) => buildCommand(action, r.id, p)));
    const res = compatible.map((rec, i) => {
      const r = out[i];
      return r.ok ? { rec, ok: true } : { rec, ok: false, error: r.error };
    });
    setResults(res);
    const ok = res.filter((r) => r.ok).length;
    const failed = res.length - ok;
    toast({
      kind: failed ? "info" : "success",
      title: `${BULK_LABEL[action]}: ${ok} updated${failed ? `, ${failed} failed` : ""}`,
      body: incompatible.length ? `${incompatible.length} incompatible record(s) were skipped.` : "Each change was recorded individually in the audit log.",
    });
  };

  const textLabel: Partial<Record<BulkAction, string>> = {
    assign: "Routing note (optional)",
    tag: "Tag",
    comment: "Comment",
    share: "Message (optional)",
    start: "Acceptance note (optional)",
    create_ticket: "Ticket note (optional)",
  };

  const footer = results ? (
    <Button
      variant="primary"
      onClick={() => {
        onDone();
        onClose();
      }}
    >
      Done
    </Button>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button variant="primary" disabled={!valid} onClick={confirm}>
        Apply to {compatible.length} record{compatible.length === 1 ? "" : "s"}
      </Button>
    </>
  );

  return (
    <Modal open onClose={onClose} title={`${BULK_LABEL[action]} — ${records.length} selected`} description="Review the proposed change before applying. Each record is authorized and audited individually." footer={footer} size="lg">
      {results ? (
        <div className="space-y-3">
          <div className="flex gap-3 text-sm">
            <Badge tone="success">{results.filter((r) => r.ok).length} succeeded</Badge>
            {results.some((r) => !r.ok) && <Badge tone="danger">{results.filter((r) => !r.ok).length} failed</Badge>}
            {incompatible.length > 0 && <Badge tone="neutral">{incompatible.length} skipped</Badge>}
          </div>
          <ul className="max-h-72 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200 text-sm">
            {results.map((r) => (
              <li key={r.rec.id} className="flex items-start gap-2 px-3 py-2">
                {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Succeeded" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-label="Failed" />}
                <span className="font-mono text-xs text-slate-500">{r.rec.id}</span>
                <span className="min-w-0 flex-1 truncate text-slate-700">{r.ok ? r.rec.title : r.error}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <fieldset className="space-y-3">
            <legend className="eyebrow mb-1">Proposed values</legend>
            {action === "assign" && (
              <label className="block text-sm">
                <span className="text-[11px] font-medium text-slate-500">Engineering owner</span>
                <select className="input mt-1" value={p.ownerId} onChange={(e) => setP({ ...p, ownerId: e.target.value })}>
                  {engineers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {L.teamName(u.teamId)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {action === "set_priority" && (
              <label className="block text-sm">
                <span className="text-[11px] font-medium text-slate-500">Priority</span>
                <select className="input mt-1" value={p.priority} onChange={(e) => setP({ ...p, priority: e.target.value as Priority })}>
                  {PRIORITIES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            )}
            {action === "set_category" && (
              <label className="block text-sm">
                <span className="text-[11px] font-medium text-slate-500">Category</span>
                <select className="input mt-1" value={p.category} onChange={(e) => setP({ ...p, category: e.target.value as RecCategory })}>
                  {REC_CATEGORIES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            )}
            {action === "share" && (
              <fieldset>
                <legend className="text-[11px] font-medium text-slate-500">Recipients (local notification only)</legend>
                <div className="mt-1 grid max-h-40 grid-cols-1 gap-1 overflow-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
                  {shareable.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-500"
                        checked={p.shareIds.includes(u.id)}
                        onChange={(e) => setP({ ...p, shareIds: e.target.checked ? [...p.shareIds, u.id] : p.shareIds.filter((x) => x !== u.id) })}
                      />
                      {u.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {textLabel[action] && (
              <label className="block text-sm">
                <span className="text-[11px] font-medium text-slate-500">{textLabel[action]}</span>
                {action === "comment" ? (
                  <textarea className="input mt-1 min-h-[72px] py-2" value={p.text} onChange={(e) => setP({ ...p, text: e.target.value })} maxLength={1000} />
                ) : (
                  <input className="input mt-1" value={p.text} onChange={(e) => setP({ ...p, text: e.target.value })} maxLength={action === "tag" ? 40 : 300} />
                )}
              </label>
            )}
            {action === "create_ticket" && <p className="text-xs text-slate-500">Creates one simulated ticket per recommendation. No external ticketing system is contacted.</p>}
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Change:</span> {proposedSummary(action, p, ds)}
            </p>
          </fieldset>

          <section>
            <h3 className="eyebrow mb-1.5">
              Will apply to {compatible.length} of {records.length}
            </h3>
            <ul className="max-h-56 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200 text-sm">
              {checked.map(({ rec, av }) => (
                <li key={rec.id} className="flex items-start gap-2 px-3 py-2">
                  {av.allowed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Compatible" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-label="Incompatible" />}
                  <span className="font-mono text-xs text-slate-500">{rec.id}</span>
                  <span className={av.allowed ? "min-w-0 flex-1 truncate text-slate-700" : "min-w-0 flex-1 truncate text-slate-400"}>{rec.title}</span>
                  {!av.allowed && <span className="shrink-0 text-xs text-slate-500">{av.reason}</span>}
                </li>
              ))}
            </ul>
            {compatible.length === 0 && <p className="mt-2 text-xs text-rose-700">None of the selected records are compatible with this action.</p>}
          </section>
        </div>
      )}
    </Modal>
  );
}

export { MIN_TEXT };
