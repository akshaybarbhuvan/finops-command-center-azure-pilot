import { handleApi, json, readJson } from "@/pilot/http/api";
import { applyAction } from "@/pilot/workflow/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleApi(req, { mutation: true, limit: { bucket: "workflow", capacity: 30, perMinute: 30 } }, async ({ actor, db, config, requestId }) => {
    const body = await readJson(req);
    const result = await applyAction(db, actor, id, body, new Date(), config.subscriptionIds);
    return json(200, result, requestId);
  });
}
