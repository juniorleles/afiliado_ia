import fs from "node:fs";
import path from "node:path";

/** Attempts per provider call. Waits between them are the first two backoff steps. */
export const MAX_ATTEMPTS = 3;

/** Wait after attempt 1, after attempt 2, and the next backoff step. */
export const BACKOFF_MS = [2000, 5000, 10000] as const;

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_CIRCUIT_THRESHOLD = 3;
const DEFAULT_CIRCUIT_COOLDOWN_MS = 30_000;

export type FailureClass = "retry" | "stop";

export type ProviderCallLog = {
  provider: string;
  model: string;
  requestId: string;
  httpStatus: number | null;
  providerErrorCode: string | null;
  retryCount: number;
  elapsedMs: number;
  timeoutMs: number;
  recoverySuccess: boolean;
  failureReason: string | null;
  promptId: string;
};

export type OperatorStatus = {
  message: string;
  attempt: number;
  maxAttempts: number;
  remainingAttempts: number;
  waitingSeconds: number | null;
};

export type ProviderFetchOptions = {
  provider: string;
  model: string;
  promptId: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  log?: (record: ProviderCallLog) => void;
  maxAttempts?: number;
  circuitThreshold?: number;
  circuitCooldownMs?: number;
};

type CircuitState = {
  consecutiveFailures: number;
  state: "closed" | "open" | "half_open";
  openedAt: number;
  threshold: number;
  cooldownMs: number;
};

const circuits = new Map<string, CircuitState>();

let operatorStatus: OperatorStatus = idleStatus();

function idleStatus(): OperatorStatus {
  return {
    message: "Generating recommendation...",
    attempt: 0,
    maxAttempts: MAX_ATTEMPTS,
    remainingAttempts: MAX_ATTEMPTS,
    waitingSeconds: null,
  };
}

export function readOperatorStatus(): OperatorStatus {
  return { ...operatorStatus };
}

export function resetResilienceForTests(): void {
  circuits.clear();
  operatorStatus = idleStatus();
}

export function fallbackEnabledFromConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AI_PROVIDER_FALLBACK === "1";
}

export function resolveTimeoutMs(override?: number, env: NodeJS.ProcessEnv = process.env): number {
  if (typeof override === "number" && override > 0) return override;
  const configured = Number(env.AI_PROVIDER_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return DEFAULT_TIMEOUT_MS;
}

export function backoffDelayMs(retryIndex: number, random: () => number = Math.random): number {
  const base = BACKOFF_MS[Math.min(Math.max(retryIndex, 0), BACKOFF_MS.length - 1)] ?? BACKOFF_MS[2];
  const unit = Math.min(1, Math.max(0, random()));
  return Math.round(base * (0.8 + unit * 0.4));
}

export function classifyProviderFailure(input: {
  status: number | null;
  errorCode: string | null;
  retryAfter: string | null;
}): FailureClass {
  const code = (input.errorCode || "").toLowerCase();
  if (input.status === 401 || input.status === 403 || input.status === 404) return "stop";
  if (
    code.includes("authentication") ||
    code.includes("invalid_api_key") ||
    code.includes("invalid api key") ||
    code.includes("permission") ||
    code.includes("invalid_request") ||
    code.includes("invalid_prompt")
  ) {
    return "stop";
  }
  const quota = code.includes("insufficient_quota") || code.includes("quota_exceeded") || code.includes("billing");
  if (quota && !input.retryAfter) return "stop";
  if (code === "overloaded_error") return "retry";
  if (input.status !== null && TRANSIENT_STATUS.has(input.status)) return "retry";
  return "stop";
}

export function classifyNetworkError(error: unknown): FailureClass {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const blob = `${name} ${code} ${message}`.toLowerCase();
  if (name === "AbortError" || blob.includes("aborted") || blob.includes("timeout")) return "retry";
  if (blob.includes("econnreset") || blob.includes("connection reset") || blob.includes("socket hang up")) return "retry";
  if (blob.includes("fetch failed") || blob.includes("econnrefused") || blob.includes("etimedout") || blob.includes("network")) {
    return "retry";
  }
  return "stop";
}

export function safePromptId(value: string): string {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(value) ? value : "unspecified";
}

function publish(next: OperatorStatus): void {
  operatorStatus = next;
}

function circuitKey(provider: string): string {
  return provider.trim().toLowerCase() || "provider";
}

function circuitFor(provider: string, threshold: number, cooldownMs: number): CircuitState {
  const key = circuitKey(provider);
  const existing = circuits.get(key);
  if (existing) {
    existing.threshold = threshold;
    existing.cooldownMs = cooldownMs;
    return existing;
  }
  const created: CircuitState = {
    consecutiveFailures: 0,
    state: "closed",
    openedAt: 0,
    threshold,
    cooldownMs,
  };
  circuits.set(key, created);
  return created;
}

function noteSuccess(provider: string): void {
  const circuit = circuits.get(circuitKey(provider));
  if (!circuit) return;
  circuit.consecutiveFailures = 0;
  circuit.state = "closed";
  circuit.openedAt = 0;
}

function noteExhaustedFailure(provider: string, threshold: number, cooldownMs: number, now: number): void {
  const circuit = circuitFor(provider, threshold, cooldownMs);
  circuit.consecutiveFailures += 1;
  if (circuit.consecutiveFailures >= circuit.threshold) {
    circuit.state = "open";
    circuit.openedAt = now;
  }
}

function readErrorCode(text: string): string | null {
  try {
    const json = JSON.parse(text) as {
      error?: { type?: string; code?: string };
      type?: string;
      code?: string;
    };
    const code = json.error?.type || json.error?.code || json.type || json.code || null;
    return typeof code === "string" && code.length > 0 && code.length <= 80 ? code : null;
  } catch {
    return null;
  }
}

function failureResponse(status: number, errorCode: string): Response {
  return new Response(JSON.stringify({ error: { type: errorCode, message: "Provider unavailable after retries." } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function defaultLog(record: ProviderCallLog): void {
  if (process.env.AI_RESILIENCE_LOG === "0") return;
  const file = process.env.AI_RESILIENCE_LOG_PATH || path.join(process.cwd(), "data", "ai-provider-calls.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
}

function requestIdFrom(response: Response | null): string {
  const header = response?.headers.get("request-id") || response?.headers.get("x-request-id");
  if (header && header.length <= 128 && !/[\r\n]/.test(header)) return header;
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function sleepMs(ms: number, sleep?: (ms: number) => Promise<void>): Promise<void> {
  if (sleep) {
    await sleep(ms);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const parent = init.signal;
  const onParentAbort = () => controller.abort();
  parent?.addEventListener("abort", onParentAbort);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
}

export async function providerFetch(url: string, init: RequestInit, options: ProviderFetchOptions): Promise<Response> {
  const provider = options.provider.trim() || "provider";
  const model = options.model.trim() || "unspecified";
  const promptId = safePromptId(options.promptId);
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const fetchImpl = options.fetchImpl ?? fetch;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const writeLog = options.log ?? defaultLog;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const threshold = options.circuitThreshold ?? DEFAULT_CIRCUIT_THRESHOLD;
  const cooldownMs = options.circuitCooldownMs ?? DEFAULT_CIRCUIT_COOLDOWN_MS;
  const started = now();
  const circuit = circuitFor(provider, threshold, cooldownMs);

  const log = (input: {
    response: Response | null;
    retryCount: number;
    recoverySuccess: boolean;
    failureReason: string | null;
    errorCode: string | null;
  }) => {
    writeLog({
      provider,
      model,
      requestId: requestIdFrom(input.response),
      httpStatus: input.response?.status ?? null,
      providerErrorCode: input.errorCode,
      retryCount: input.retryCount,
      elapsedMs: Math.max(0, now() - started),
      timeoutMs,
      recoverySuccess: input.recoverySuccess,
      failureReason: input.failureReason,
      promptId,
    });
  };

  if (circuit.state === "open") {
    const elapsed = now() - circuit.openedAt;
    if (elapsed < circuit.cooldownMs) {
      publish({
        message: "Provider temporarily unavailable",
        attempt: 0,
        maxAttempts,
        remainingAttempts: 0,
        waitingSeconds: null,
      });
      const response = failureResponse(503, "circuit_open");
      log({
        response,
        retryCount: 0,
        recoverySuccess: false,
        failureReason: "circuit_open",
        errorCode: "circuit_open",
      });
      return response;
    }
    circuit.state = "half_open";
  }

  publish({
    message: "Generating recommendation...",
    attempt: 1,
    maxAttempts,
    remainingAttempts: maxAttempts - 1,
    waitingSeconds: null,
  });

  let lastResponse: Response | null = null;
  let lastCode: string | null = null;
  let lastReason = "provider_unavailable";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      const wait = backoffDelayMs(attempt - 2, random);
      const waitingSeconds = Math.max(1, Math.round(wait / 1000));
      publish({
        message: `Retrying in ${waitingSeconds} seconds...`,
        attempt,
        maxAttempts,
        remainingAttempts: maxAttempts - attempt,
        waitingSeconds,
      });
      await sleepMs(wait, options.sleep);
      publish({
        message: `Retrying (${attempt - 1} of ${maxAttempts})...`,
        attempt,
        maxAttempts,
        remainingAttempts: maxAttempts - attempt,
        waitingSeconds: null,
      });
    }

    try {
      const response = await fetchWithTimeout(url, init, timeoutMs, fetchImpl);
      if (response.ok) {
        if (attempt > 1) {
          publish({
            message: "Recovered successfully.",
            attempt,
            maxAttempts,
            remainingAttempts: maxAttempts - attempt,
            waitingSeconds: null,
          });
        }
        noteSuccess(provider);
        log({
          response,
          retryCount: attempt - 1,
          recoverySuccess: true,
          failureReason: null,
          errorCode: null,
        });
        return response;
      }

      const copy = response.clone();
      const text = await copy.text().catch(() => "");
      const errorCode = readErrorCode(text);
      const decision = classifyProviderFailure({
        status: response.status,
        errorCode,
        retryAfter: response.headers.get("retry-after"),
      });
      lastResponse = response;
      lastCode = errorCode;
      lastReason = errorCode || `http_${response.status}`;
      if (decision === "stop" || attempt === maxAttempts) {
        if (decision === "retry") noteExhaustedFailure(provider, threshold, cooldownMs, now());
        if (decision === "retry") {
          publish({
            message: "Provider unavailable after retries.",
            attempt,
            maxAttempts,
            remainingAttempts: 0,
            waitingSeconds: null,
          });
        }
        log({
          response,
          retryCount: attempt - 1,
          recoverySuccess: false,
          failureReason: lastReason,
          errorCode,
        });
        return response;
      }
      publish({
        message: "AI provider temporarily unavailable...",
        attempt,
        maxAttempts,
        remainingAttempts: maxAttempts - attempt,
        waitingSeconds: null,
      });
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      const decision = classifyNetworkError(error);
      const reason = decision === "retry" ? (error instanceof Error && error.name === "AbortError" ? "timeout" : "network") : "request_failed";
      lastResponse = null;
      lastCode = reason;
      lastReason = reason;
      if (decision === "stop" || attempt === maxAttempts) {
        if (decision === "retry") noteExhaustedFailure(provider, threshold, cooldownMs, now());
        if (decision === "retry") {
          publish({
            message: "Provider unavailable after retries.",
            attempt,
            maxAttempts,
            remainingAttempts: 0,
            waitingSeconds: null,
          });
        }
        const response = failureResponse(503, reason);
        log({
          response,
          retryCount: attempt - 1,
          recoverySuccess: false,
          failureReason: reason,
          errorCode: reason,
        });
        return response;
      }
      publish({
        message: "AI provider temporarily unavailable...",
        attempt,
        maxAttempts,
        remainingAttempts: maxAttempts - attempt,
        waitingSeconds: null,
      });
    }
  }

  noteExhaustedFailure(provider, threshold, cooldownMs, now());
  publish({
    message: "Provider unavailable after retries.",
    attempt: maxAttempts,
    maxAttempts,
    remainingAttempts: 0,
    waitingSeconds: null,
  });
  const response = lastResponse ?? failureResponse(503, lastCode || "provider_unavailable");
  log({
    response,
    retryCount: Math.max(0, maxAttempts - 1),
    recoverySuccess: false,
    failureReason: lastReason,
    errorCode: lastCode,
  });
  return response;
}

export async function runProviderChain<T>(
  providers: Array<{ provider: string; call: () => Promise<T> }>,
  options: { fallbackEnabled?: boolean; isFailure: (result: T) => boolean },
): Promise<T> {
  const enabled = options.fallbackEnabled ?? fallbackEnabledFromConfig();
  const chain = enabled ? providers : providers.slice(0, 1);
  let last: T | undefined;
  for (const entry of chain) {
    last = await entry.call();
    if (!options.isFailure(last)) return last;
  }
  return last as T;
}
