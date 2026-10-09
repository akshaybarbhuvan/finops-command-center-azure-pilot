// Read-only Azure Resource Manager client used by every connector.
// - Only https://management.azure.com is reachable (pagination links pointing elsewhere are rejected).
// - Only GET and POST-for-query are issued; the client exposes no PUT/PATCH/DELETE.
// - Bounded per-attempt timeout, caller cancellation, bounded retries for 429/5xx/network errors,
//   honouring Retry-After and the Azure rate-limit headers.
// - Errors are classified and redacted; response bodies are never logged.
import { redactString } from "../log";

export const ARM_ORIGIN = "https://management.azure.com";

export type ConnectorErrorKind =
  | "unauthorized" // 401 — token rejected / identity misconfigured
  | "forbidden" // 403 — identity lacks the required role at this scope
  | "not_found"
  | "throttled"
  | "timeout"
  | "network"
  | "server"
  | "bad_request"
  | "invalid_response"
  | "limit_exceeded"
  | "cancelled";

export class ConnectorError extends Error {
  constructor(
    public kind: ConnectorErrorKind,
    message: string,
    public status?: number,
    public armCode?: string,
  ) {
    super(redactString(message).slice(0, 500));
  }
  /** Authorization failures are reported as "unauthorized" sync status. */
  get isAuthorization() {
    return this.kind === "unauthorized" || this.kind === "forbidden";
  }
}

export interface ArmClientOptions {
  getToken: (signal?: AbortSignal) => Promise<string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  maxRetryAfterMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface ArmClient {
  request<T>(method: "GET" | "POST", pathOrUrl: string, body?: unknown, signal?: AbortSignal): Promise<T>;
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new ConnectorError("cancelled", "Request cancelled"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new ConnectorError("cancelled", "Request cancelled"));
    });
  });

/** Parses the delay a 429/503 response asks for, in ms. Supports Retry-After and Azure's rate-limit headers. */
export function retryDelayFromHeaders(h: Headers, now = Date.now()): number | null {
  const candidates = [
    h.get("retry-after"),
    h.get("x-ms-ratelimit-microsoft.costmanagement-qpu-retry-after"),
    h.get("x-ms-ratelimit-microsoft.costmanagement-entity-retry-after"),
    h.get("x-ms-ratelimit-microsoft.costmanagement-tenant-retry-after"),
    h.get("x-ms-ratelimit-microsoft.costmanagement-client-retry-after"),
    h.get("x-ms-ratelimit-microsoft.consumption-retry-after"),
  ].filter((v): v is string => !!v);
  let best: number | null = null;
  for (const v of candidates) {
    let ms: number | null = null;
    if (/^\d+(\.\d+)?$/.test(v.trim())) ms = Number(v) * 1000;
    else {
      const d = Date.parse(v);
      if (!Number.isNaN(d)) ms = Math.max(0, d - now);
    }
    if (ms !== null) best = best === null ? ms : Math.max(best, ms);
  }
  const reset = h.get("x-ms-user-quota-resets-after"); // Resource Graph: hh:mm:ss
  if (reset && /^\d{2}:\d{2}:\d{2}$/.test(reset) && h.get("x-ms-user-quota-remaining") === "0") {
    const [hh, mm, ss] = reset.split(":").map(Number);
    const ms = ((hh * 60 + mm) * 60 + ss) * 1000;
    best = best === null ? ms : Math.max(best, ms);
  }
  return best;
}

function classify(status: number): ConnectorErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "throttled";
  if (status === 408) return "timeout";
  if (status >= 500) return "server";
  return "bad_request";
}

export function resolveArmUrl(pathOrUrl: string): URL {
  const url = pathOrUrl.startsWith("https://") ? new URL(pathOrUrl) : new URL(pathOrUrl, ARM_ORIGIN);
  if (url.origin !== ARM_ORIGIN) throw new ConnectorError("invalid_response", "Refusing to call a host other than Azure Resource Manager");
  return url;
}

export function createArmClient(opts: ArmClientOptions): ArmClient {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxRetries = opts.maxRetries ?? 4;
  const maxRetryAfter = opts.maxRetryAfterMs ?? 120_000;
  const sleep = opts.sleep ?? defaultSleep;

  return {
    async request<T>(method: "GET" | "POST", pathOrUrl: string, body?: unknown, signal?: AbortSignal): Promise<T> {
      const url = resolveArmUrl(pathOrUrl);
      let attempt = 0;
      for (;;) {
        if (signal?.aborted) throw new ConnectorError("cancelled", "Request cancelled");
        const token = await opts.getToken(signal).catch((e: unknown) => {
          throw new ConnectorError("unauthorized", `Could not obtain an Azure access token: ${(e as Error)?.name ?? "error"}`);
        });
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), timeoutMs);
        const onAbort = () => ctl.abort();
        signal?.addEventListener("abort", onAbort);
        let res: Response;
        try {
          res = await doFetch(url, {
            method,
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: ctl.signal,
          });
        } catch (e) {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          if (signal?.aborted) throw new ConnectorError("cancelled", "Request cancelled");
          const kind: ConnectorErrorKind = ctl.signal.aborted ? "timeout" : "network";
          if (attempt < maxRetries) {
            await sleep(backoff(attempt), signal);
            attempt++;
            continue;
          }
          throw new ConnectorError(kind, kind === "timeout" ? `Azure request timed out after ${timeoutMs} ms` : `Network error calling Azure: ${(e as Error)?.name ?? "error"}`);
        }
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);

        if (res.ok) {
          if (res.status === 204) return {} as T;
          try {
            return (await res.json()) as T;
          } catch {
            throw new ConnectorError("invalid_response", "Azure returned a response that is not valid JSON", res.status);
          }
        }

        const armCode = await readArmCode(res);
        if (RETRYABLE.has(res.status) && attempt < maxRetries) {
          const asked = retryDelayFromHeaders(res.headers);
          if (asked !== null && asked > maxRetryAfter) {
            throw new ConnectorError("throttled", `Azure asked to retry after ${Math.round(asked / 1000)} s, beyond the ${Math.round(maxRetryAfter / 1000)} s limit`, res.status, armCode);
          }
          await sleep(asked ?? backoff(attempt), signal);
          attempt++;
          continue;
        }
        throw new ConnectorError(classify(res.status), `Azure returned HTTP ${res.status}${armCode ? ` (${armCode})` : ""}`, res.status, armCode);
      }
    },
  };
}

function backoff(attempt: number) {
  const base = Math.min(30_000, 1000 * 2 ** attempt);
  return base / 2 + Math.random() * (base / 2);
}

async function readArmCode(res: Response): Promise<string | undefined> {
  try {
    const j = (await res.json()) as { error?: { code?: unknown } };
    const code = j?.error?.code;
    return typeof code === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}
