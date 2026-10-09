// Pilot build only (see next.config.mjs). Runs once per server process.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { pilotConfig } = await import("./pilot/config");
  const { log } = await import("./pilot/log");
  const cfg = pilotConfig();
  if (!cfg.ok) {
    // Fail closed: every request will show the configuration problem; nothing falls back to demo data.
    log.error("config.incomplete", { problems: cfg.problems });
    return;
  }
  log.info("pilot.start", { appMode: cfg.config.appMode, authMode: cfg.config.authMode, subscriptions: cfg.config.subscriptionIds.length, db: cfg.config.db.dialect });
  const { startScheduler } = await import("./pilot/sync/runtime");
  startScheduler(cfg.config);
}
