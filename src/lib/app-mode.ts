// Runtime mode resolution. Demo conveniences (persona selector, synthetic data) exist ONLY in demo mode.
export type AppMode = "demo" | "pilot" | "production";

export function resolveAppMode(env: Record<string, string | undefined> = process.env): AppMode {
  const raw = (env.APP_MODE ?? "").trim().toLowerCase();
  if (raw === "demo" || raw === "pilot" || raw === "production") return raw;
  if (raw) return "pilot"; // unknown values fail closed
  // Unset: local `next dev` is a demo; any production build fails closed to pilot.
  return env.NODE_ENV === "production" ? "pilot" : "demo";
}

/** The demo persona selector and synthetic data bypass enterprise identity — allowed in demo mode only. */
export function isDemoBypassAllowed(mode: AppMode): boolean {
  return mode === "demo";
}

export function clientLabel(env: Record<string, string | undefined> = process.env): string {
  const label = (env.DEMO_CLIENT_LABEL ?? "").trim();
  return label && label.length <= 48 ? label : "Enterprise Client Demo";
}
