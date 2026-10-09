import { Card, CardHeader } from "@/components/ui/primitives";
import { PageHeader } from "@/components/data/blocks";
import { pageSession } from "@/components/pilot/guard";
import { PilotShell } from "@/components/pilot/Shell";
import { RecTable } from "@/components/pilot/RecTable";
import { Note } from "@/components/pilot/ui";
import { listRecommendations } from "@/pilot/queries/recommendations";

export const metadata = { title: "My Work" };

export default async function Engineering() {
  const s = await pageSession(["workflow.engineering"]);
  if (!s.ok) return s.view;
  const q = (stage: string) => listRecommendations(s.db, s.actor, { stage, owner: "me", pageSize: 50, approvedSubscriptions: s.config.subscriptionIds });
  const [assigned, inProgress, submitted, approved, implemented] = await Promise.all([q("assigned"), q("in_progress"), q("submitted"), q("approved"), q("implemented")]);
  const block = (title: string, sub: string, r: Awaited<ReturnType<typeof q>>) => (
    <Card>
      <CardHeader title={`${title} (${r.total})`} subtitle={sub} />
      <div className="px-5 pb-5">
        <RecTable rows={r.rows} caption={title} showOwner={false} />
      </div>
    </Card>
  );
  return (
    <PilotShell actor={s.actor} config={s.config} active="/engineering">
      <PageHeader title="My Work" subtitle="Only recommendations assigned to you. Open one to accept it, record your ticket and change approval references, and submit implementation evidence." />
      {block("Accept or decline", "Assigned to you by FinOps.", assigned)}
      {block("In progress", "Record a ticket reference, then submit your remediation plan.", inProgress)}
      {block("Awaiting change approval", "Record the change approval reference from your change process, or revise the plan.", submitted)}
      {block("Approved — implement", "Implement through your normal change process, then submit evidence.", approved)}
      {block("Awaiting FinOps verification", "Evidence submitted. FinOps measures the result; you cannot verify your own savings.", implemented)}
      <Note>FCC does not change Azure resources. All implementation happens through your own tools and change controls.</Note>
    </PilotShell>
  );
}
