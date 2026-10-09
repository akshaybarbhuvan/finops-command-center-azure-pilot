import "server-only";
// Wires the sync service to real Azure credentials, and runs the optional in-process schedule.
import type { PilotConfig } from "../config";
import { getDb } from "../db";
import { log } from "../log";
import { createArmClient } from "../azure/arm";
import { armTokenProvider, createCredential } from "../azure/token";
import { runSync, type SyncReport, type SyncSource, type Trigger } from "./service";

export function liveArmClient(config: PilotConfig) {
  return createArmClient({ getToken: armTokenProvider(createCredential(process.env, config.managedIdentityClientId)) });
}

export async function runLiveSync(config: PilotConfig, opts: { sources?: SyncSource[]; trigger: Trigger; triggeredBy?: string | null }): Promise<SyncReport> {
  const db = await getDb(config);
  const ctl = new AbortController();
  const deadline = setTimeout(() => ctl.abort(), 45 * 60_000); // hard stop; lock TTL is 60 minutes
  try {
    return await runSync({ db, config, client: liveArmClient(config), signal: ctl.signal }, opts);
  } finally {
    clearTimeout(deadline);
  }
}

let started = false;
/** Starts the scheduled refresh when FCC_SYNC_INTERVAL_MINUTES > 0. DB lease locks make it safe on several instances. */
export function startScheduler(config: PilotConfig) {
  if (started || !config.syncIntervalMinutes) return;
  started = true;
  const every = config.syncIntervalMinutes * 60_000;
  const tick = async () => {
    try {
      const r = await runLiveSync(config, { trigger: "scheduled" });
      log.info("sync.scheduled_complete", { runs: r.outcomes.length, skipped: r.skipped.length });
    } catch (e) {
      log.error("sync.scheduled_failed", { error: (e as Error)?.message });
    }
  };
  setTimeout(tick, 60_000).unref?.(); // first run one minute after start-up
  setInterval(tick, every).unref?.();
  log.info("sync.scheduler_started", { everyMinutes: config.syncIntervalMinutes });
}
