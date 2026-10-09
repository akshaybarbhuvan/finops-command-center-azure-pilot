"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Activity, CheckCircle2, Database, KeyRound, Plug, RotateCcw, ShieldCheck, Ticket, Users } from "lucide-react";
import { KpiGrid, MetricCard, PageHeader } from "@/components/data/blocks";
import { DataTable } from "@/components/data/DataTable";
import { Modal, useToast } from "@/components/ui/overlay";
import { Avatar, Badge, Button, Card, Tabs, type Tone } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { lookup } from "@/lib/demo/selectors";
import { validateDataset } from "@/lib/demo/validation";
import { getSeedDataset } from "@/lib/demo/seed";
import { DEMO_SEED } from "@/lib/demo/org";
import { ROLE_LABEL } from "@/lib/demo/workflow";
import { getTicketingClient } from "@/lib/demo/ticketing";
import { date, num } from "@/lib/format";

type T = "health" | "users" | "audit";

export function ResetDemoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { reset, isDirty } = useDemo();
  const toast = useToast();
  const router = useRouter();
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Reset demo data?"
      description="Restores the deterministic seed dataset, clears workflow changes made in this browser. Your sign-in is unchanged; reset never signs anyone in."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              reset();
              onClose();
              router.push("/overview");
              toast({ kind: "success", title: "Demo data reset", body: "Seed dataset restored. Ready for the next walkthrough." });
            }}
          >
            Reset
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{isDirty ? "Changes made during this session will be discarded." : "No changes have been made yet — the data is already at its seed state."}</p>
    </Modal>
  );
}

export function ResetDemoButton({ variant = "secondary", label = "Reset demo data" }: { variant?: "secondary" | "danger" | "ghost"; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} icon={<RotateCcw className="h-4 w-4" aria-hidden />} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ResetDemoDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function Administration() {
  const { ds, isDirty } = useDemo();
  const L = lookup(ds);
  const toast = useToast();
  const [tab, setTab] = useState<T>("health");
  const [validation, setValidation] = useState(() => validateDataset(getSeedDataset()));
  const ticketing = getTicketingClient();
  const sessionEvents = ds.audit.filter((a) => !a.id.startsWith("seed-")).length;

  const health: { name: string; status: string; tone: Tone; detail: string; icon: typeof Activity }[] = useMemo(
    () => [
      { name: "Application", status: "Healthy", tone: "success", detail: "Next.js app serving locally; all routes available", icon: Activity },
      { name: "Demo dataset", status: validation.ok ? "Valid" : "Failed", tone: validation.ok ? "success" : "danger", detail: `${validation.checks.filter((c) => c.ok).length}/${validation.checks.length} integrity checks passed`, icon: Database },
      { name: "Identity", status: "Simulated sign-in", tone: "warning", detail: "Local demo sign-in (not Entra ID); enterprise SSO enforced in pilot/production", icon: KeyRound },
      { name: "Ticketing", status: "Local demo", tone: "info", detail: ticketing.describe(), icon: Ticket },
      { name: "Azure Cost Management", status: "Not connected", tone: "neutral", detail: "Demo mode uses synthetic cost data; no Azure calls are made", icon: Plug },
      { name: "Azure Resource Graph", status: "Not connected", tone: "neutral", detail: "Inventory is illustrative; no tenant access", icon: Plug },
    ],
    [validation, ticketing],
  );

  return (
    <div className="space-y-5">
      <PageHeader crumbs={[{ label: "Platform" }, { label: "Administration" }]} title="Administration" subtitle="Platform governance and health: users and roles, integrations, configuration, demo data controls and audit trail." actions={<ResetDemoButton variant="secondary" />} />
      <KpiGrid cols={4}>
        <MetricCard label="Users" value={ds.users.filter((u) => u.id !== "u-system").length} format={num} context={`${ds.teams.length} teams · 4 roles`} icon={<Users className="h-4 w-4" aria-hidden />} />
        <MetricCard label="Data integrity" value={validation.checks.filter((c) => c.ok).length} format={(n) => `${Math.round(n)}/${validation.checks.length}`} context="Seed validation checks passed" icon={<ShieldCheck className="h-4 w-4" aria-hidden />} accent="teal" />
        <MetricCard label="Session changes" value={sessionEvents} format={num} context={isDirty ? "Workflow actions since last reset" : "Data at seed state"} icon={<Activity className="h-4 w-4" aria-hidden />} accent="violet" />
        <MetricCard label="External calls" value={0} format={num} context="No Azure, ticketing or identity calls in demo mode" icon={<Plug className="h-4 w-4" aria-hidden />} accent="slate" />
      </KpiGrid>

      <Card>
        <Tabs<T>
          className="px-3"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "health", label: "Health & configuration" },
            { id: "users", label: "Users & roles", count: ds.users.length - 1 },
            { id: "audit", label: "Audit log", count: ds.audit.length },
          ]}
        />
        {tab === "health" && (
          <div className="grid gap-6 p-5 xl:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">System health & integrations</h3>
              <ul className="space-y-2">
                {health.map((h) => (
                  <li key={h.name} className="flex items-start gap-3 rounded-xl border border-line p-3">
                    <h.icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900">{h.name}</span>
                        <Badge tone={h.tone} dot>
                          {h.status}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{h.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Configuration</h3>
                <dl className="divide-y divide-slate-100 rounded-xl border border-line text-sm">
                  {[
                    ["Runtime mode", "demo (APP_MODE)"],
                    ["Local demo sign-in", "Enabled — demo mode only"],
                    ["Dataset", `Deterministic seed ${DEMO_SEED}`],
                    ["Data as of", date(ds.asOf)],
                    ["Subscriptions / resources", `${ds.subscriptions.length} / ${num(ds.resources.length)}`],
                    ["Recommendations / tickets", `${num(ds.recommendations.length)} / ${num(ds.tickets.length)}`],
                    ["State storage", "This browser only (local storage)"],
                    ["Secrets required", "None"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 px-4 py-2">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="text-right font-medium text-slate-900">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Demo data controls</h3>
                <div className="flex flex-wrap gap-2">
                  <ResetDemoButton />
                  <Button
                    icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
                    onClick={() => {
                      const v = validateDataset(getSeedDataset());
                      setValidation(v);
                      toast({ kind: v.ok ? "success" : "error", title: v.ok ? "Validation passed" : "Validation failed", body: `${v.checks.filter((c) => c.ok).length}/${v.checks.length} checks passed` });
                    }}
                  >
                    Run data validation
                  </Button>
                </div>
                <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-line p-3 text-xs scrollbar-thin">
                  {validation.checks.map((c) => (
                    <li key={c.name} className="flex items-start gap-2">
                      <span className={c.ok ? "text-emerald-600" : "text-rose-600"} aria-hidden>
                        {c.ok ? "✓" : "✗"}
                      </span>
                      <span className="text-slate-700">
                        {c.name}
                        <span className="sr-only">{c.ok ? " passed" : " failed"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
        {tab === "users" && (
          <DataTable
            caption="Users and roles"
            rows={ds.users.filter((u) => u.id !== "u-system")}
            rowKey={(u) => u.id}
            pageSize={25}
            columns={[
              { id: "name", header: "User", sortValue: (u) => u.name, cell: (u) => <div className="flex items-center gap-2.5"><Avatar initials={u.initials} size="sm" tone="slate" /><div><div className="font-medium text-slate-900">{u.name}</div><div className="text-[11px] text-slate-500">{u.email}</div></div></div> },
              { id: "title", header: "Title", sortValue: (u) => u.title, cell: (u) => u.title },
              { id: "team", header: "Team", sortValue: (u) => L.teamName(u.teamId), cell: (u) => L.teamName(u.teamId) },
              { id: "role", header: "Role", sortValue: (u) => u.role, cell: (u) => <Badge tone={u.role === "executive" ? "violet" : u.role === "finops" ? "brand" : u.role === "admin" ? "dark" : "neutral"}>{ROLE_LABEL[u.role]}</Badge> },
              { id: "open", header: "Open items owned", align: "right", sortValue: (u) => ds.recommendations.filter((r) => r.ownerId === u.id && !["verified", "closed", "rejected", "deferred"].includes(r.stage)).length, cell: (u) => num(ds.recommendations.filter((r) => r.ownerId === u.id && !["verified", "closed", "rejected", "deferred"].includes(r.stage)).length) },
            ]}
            footer="Synthetic users with demo-only email addresses (@demo.fcc.local). No real personal data."
          />
        )}
        {tab === "audit" && (
          <DataTable
            caption="Audit log"
            rows={ds.audit}
            rowKey={(a) => a.id}
            pageSize={20}
            columns={[
              { id: "at", header: "Date", sortValue: (a) => a.at, cell: (a) => <span className="whitespace-nowrap">{date(a.at)}</span> },
              { id: "actor", header: "Actor", sortValue: (a) => L.userName(a.actorId), cell: (a) => <span className="whitespace-nowrap">{L.userName(a.actorId)}</span> },
              { id: "action", header: "Action", sortValue: (a) => a.action, cell: (a) => <span className="font-medium text-slate-900">{a.action}</span> },
              { id: "target", header: "Target", cell: (a) => <span className="font-mono text-xs">{a.target}</span> },
              { id: "detail", header: "Detail", cell: (a) => <span className="line-clamp-1 text-xs text-slate-600">{a.detail}</span> },
              { id: "src", header: "Source", cell: (a) => <Badge tone={a.id.startsWith("seed-") ? "neutral" : "brand"}>{a.id.startsWith("seed-") ? "Seed history" : "This session"}</Badge> },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
