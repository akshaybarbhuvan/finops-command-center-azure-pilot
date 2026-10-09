import { z } from "zod";
import { handleApi, json, readJson } from "@/pilot/http/api";
import { can } from "@/pilot/auth/permissions";
import { log } from "@/pilot/log";
import { runLiveSync } from "@/pilot/sync/runtime";
import { SYNC_SOURCES } from "@/pilot/sync/service";

export const dynamic = "force-dynamic";

const Body = z.object({ sources: z.array(z.enum(["inventory", "cost", "advisor"])).min(1).max(3).optional() }).strict();

/**
 * Starts a refresh in the background and returns 202 immediately (a full refresh can exceed the App Service
 * request timeout). Progress and results appear on the Administration → Connector health screen.
 */
export async function POST(req: Request) {
  return handleApi(req, { mutation: true, limit: { bucket: "sync", capacity: 3, perMinute: 0.1 } }, async ({ actor, config, db, requestId }) => {
    if (!can(actor, "sync.trigger")) return json(403, { error: "forbidden", message: "Only FinOps or Administrators can refresh Azure data" }, requestId);
    const parsed = Body.safeParse(await readJson(req));
    if (!parsed.success) return json(400, { error: "bad_request", message: "Invalid refresh request" }, requestId);
    const sources = parsed.data.sources ?? SYNC_SOURCES;
    const now = new Date().toISOString();
    const held = await db.all<{ name: string }>(`SELECT name FROM sync_locks WHERE expires_at > @now`, { now });
    const busy = new Set(held.map((h) => h.name.replace("sync:", "")));
    const toRun = sources.filter((s) => !busy.has(s));
    if (!toRun.length) return json(409, { error: "already_running", message: "A refresh is already running for these sources. Check Administration → Connector health." }, requestId);
    void runLiveSync(config, { sources: toRun, trigger: "manual", triggeredBy: actor.id }).catch((e: unknown) => log.error("sync.manual_failed", { requestId, error: (e as Error)?.message }));
    return json(202, { summary: `Refresh started for ${toRun.join(", ")}. Results appear on the connector health screen when each source finishes.` }, requestId);
  });
}
