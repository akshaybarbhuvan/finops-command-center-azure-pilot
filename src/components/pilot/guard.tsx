import "server-only";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/pilot/session";
import { can, type Permission } from "@/pilot/auth/permissions";
import type { Actor } from "@/pilot/auth/principal";
import type { PilotConfig } from "@/pilot/config";
import type { Db } from "@/pilot/db/types";
import { SchemaNotReadyError } from "@/pilot/db";
import { Card } from "@/components/ui/primitives";

export type PageSession = { ok: true; actor: Actor; config: PilotConfig; db: Db } | { ok: false; view: ReactNode };

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mx-auto mt-10 max-w-lg p-6">
      <h1 className="text-base font-semibold text-slate-900">{title}</h1>
      <div className="mt-2 space-y-2 text-sm text-slate-600">{children}</div>
    </Card>
  );
}

/** Resolves the session for a page and checks that the actor holds at least one of `anyOf`. */
export async function pageSession(anyOf: Permission[]): Promise<PageSession> {
  let s;
  try {
    s = await getSession();
  } catch (e) {
    if (e instanceof SchemaNotReadyError)
      return { ok: false, view: <Message title="Database not ready">The database schema has not been migrated to this application version. An operator must run the migration step in docs/DEPLOYMENT.md.</Message> };
    throw e;
  }
  if (s.kind === "anonymous") redirect("/.auth/login/aad");
  if (s.kind === "config_error") return { ok: false, view: <Message title="Pilot configuration is incomplete">An administrator must complete the configuration. No demonstration data is used as a fallback.</Message> };
  if (s.kind === "rejected") return { ok: false, view: <Message title="Access denied">Your sign-in is not accepted by this pilot.</Message> };
  if (s.kind === "no_role")
    return {
      ok: false,
      view: (
        <Message title="No FCC role assigned">
          <p>You are signed in as {s.actor.name}, but no FCC application role (Executive, FinOps, Engineering or Administrator) is assigned to your account.</p>
          <p>Ask the pilot administrator to assign a role in Microsoft Entra ID (Enterprise applications → FinOps Command Center → Users and groups).</p>
        </Message>
      ),
    };
  if (anyOf.length && !anyOf.some((p) => can(s.actor, p))) {
    return { ok: false, view: <Message title="Not available for your role">This page is not part of your FCC role. Use the navigation to open the pages available to you.</Message> };
  }
  return { ok: true, actor: s.actor, config: s.config, db: s.db };
}
