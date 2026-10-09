"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Info, LogIn } from "lucide-react";
import { Avatar, Button, cx } from "@/components/ui/primitives";
import { LogoMark } from "@/components/shell/AppShell";
import { DEMO_ACCOUNTS, useDemoSession } from "@/lib/demo/store";
import { HOME, safeReturnPath } from "@/lib/rbac";
import { annual } from "@/lib/demo/selectors";
import { isOpen } from "@/lib/demo/workflow";
import { money } from "@/lib/format";

export default function LoginPage() {
  const { user, hydrated, signIn, fullDs } = useDemoSession();
  const router = useRouter();
  const [selected, setSelected] = useState<string>(DEMO_ACCOUNTS[0].userId);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in: go to the role home (no auto-login — only an existing session redirects).
  useEffect(() => {
    if (hydrated && user && !submitting) router.replace(HOME[user.role]);
  }, [hydrated, user, router, submitting]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const account = DEMO_ACCOUNTS.find((a) => a.userId === selected);
    if (!account) return;
    setSubmitting(true);
    if (!signIn(account.userId)) {
      setSubmitting(false);
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next");
    router.replace(safeReturnPath(account.role, next));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_#EAF3FC,_#F4F8FC_60%)] px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark />
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">FinOps Command Center</h1>
          <p className="mt-1 text-sm text-slate-500">Enterprise FinOps Governance &amp; Optimization</p>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden />
            Local demo | Illustrative data
          </span>
        </div>
        <form onSubmit={submit} className="card p-5 sm:p-6" aria-labelledby="login-heading">
          <h2 id="login-heading" className="text-sm font-semibold text-slate-900">
            Choose a demo account
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">Each account sees only what its role permits.</p>
          <fieldset className="mt-4" disabled={!hydrated || submitting}>
            <legend className="sr-only">Demo account</legend>
            <div className="space-y-2" role="radiogroup" aria-label="Demo account">
              {DEMO_ACCOUNTS.map((a) => {
                const u = fullDs.users.find((x) => x.id === a.userId);
                const active = selected === a.userId;
                return (
                  <label
                    key={a.userId}
                    className={cx(
                      "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition focus-within:ring-2 focus-within:ring-brand-400",
                      active ? "border-brand-400 bg-brand-50/60" : "border-line bg-white hover:border-slate-300",
                    )}
                  >
                    <input type="radio" name="account" value={a.userId} checked={active} onChange={() => setSelected(a.userId)} className="sr-only" />
                    <Avatar initials={u?.initials ?? "?"} size="md" tone={active ? "brand" : "slate"} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold text-slate-900">{a.title}</span>
                      <span className="block truncate text-[12px] text-slate-500">
                        {u?.name} · {u?.title}
                      </span>
                      <span className="block text-[11.5px] text-slate-500">{a.purpose}</span>
                      {a.role === "engineering" && <Workload userId={a.userId} />}
                    </span>
                    <span aria-hidden className={cx("h-4 w-4 shrink-0 rounded-full border-2", active ? "border-brand-500 bg-brand-500 shadow-[inset_0_0_0_3px_white]" : "border-slate-300")} />
                  </label>
                );
              })}
            </div>
          </fieldset>
          <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" loading={submitting} disabled={!hydrated} icon={<LogIn className="h-4 w-4" aria-hidden />}>
            Sign in
          </Button>
          <p className="mt-4 flex gap-2 rounded-lg bg-slate-50 p-3 text-[11.5px] leading-relaxed text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Simulated local sign-in for demonstration only. This is not Microsoft Entra ID — pilot and production environments require enterprise single sign-on and do not offer
            this page.
          </p>
        </form>
      </div>
    </div>
  );
}

/** Assigned open workload for an engineering demo account (counts only; record details stay behind sign-in). */
function Workload({ userId }: { userId: string }) {
  const { fullDs } = useDemoSession();
  const open = fullDs.recommendations.filter((r) => r.ownerId === userId && isOpen(r.stage));
  const value = open.reduce((t, r) => t + annual(r), 0);
  return (
    <span className="mt-1 inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600" data-testid={`workload-${userId}`}>
      Assigned workload: {open.length} open {open.length === 1 ? "recommendation" : "recommendations"} · {money(value)}/yr est.
    </span>
  );
}
