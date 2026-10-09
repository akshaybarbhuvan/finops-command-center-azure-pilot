// Structured, redacting logger. Writes JSON lines to stdout/stderr (collected by App Service / Application Insights).
// Never log tokens, credentials, connection strings, request bodies or full error payloads from Azure.
const SECRET_KEYS = /(authorization|token|secret|password|pwd|key|cookie|connectionstring|client_?assertion|credential)/i;
const BEARER = /bearer\s+[a-z0-9\-._~+/]+=*/gi;
const JWT = /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g;
const SIG = /([?&](sig|se|sv|skoid|sktid|code|client_secret)=)[^&\s]+/gi;

export function redactString(s: string): string {
  return s.replace(BEARER, "Bearer [redacted]").replace(JWT, "[redacted-jwt]").replace(SIG, "$1[redacted]");
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]";
  if (typeof value === "string") return redactString(value).slice(0, 2000);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
    return out;
  }
  return value;
}

type Level = "info" | "warn" | "error";
function emit(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...(redact(fields) as Record<string, unknown>) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
export const log = {
  info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};
