import type { FetchImpl } from "@/lib/source-resolution/types";

export class FetchTimeoutError extends Error {
  readonly url: string;
  constructor(url: string, timeoutMs: number) {
    super(`FETCH_TIMEOUT after ${timeoutMs}ms`);
    this.name = "FetchTimeoutError";
    this.url = url;
  }
}

export function isAbortLike(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name || "";
  return name === "AbortError" || name === "TimeoutError" || name === "FetchTimeoutError";
}

function abortError(message = "The operation was aborted"): Error {
  const err = new Error(message);
  err.name = "AbortError";
  return err;
}

export async function fetchWithTimeout(
  fetchImpl: FetchImpl,
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
  external?: AbortSignal,
): Promise<Response> {
  if (external?.aborted) throw abortError();
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (external) external.addEventListener("abort", onExternalAbort, { once: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new FetchTimeoutError(url, timeoutMs));
    }, timeoutMs);
  });

  const fetchPromise = Promise.resolve(fetchImpl(url, { ...init, signal: controller.signal })).catch((err) => {
    if (external?.aborted && !timedOut) throw abortError();
    if (timedOut || isAbortLike(err)) throw new FetchTimeoutError(url, timeoutMs);
    throw err;
  });
  fetchPromise.catch(() => undefined);

  try {
    return await Promise.race([fetchPromise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    external?.removeEventListener("abort", onExternalAbort);
  }
}

export function combineAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const active = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  const anyFn = (AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") return anyFn(active);
  const controller = new AbortController();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, url: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promiseCatch = Promise.resolve(promise);
  promiseCatch.catch(() => undefined);
  try {
    return await Promise.race([
      promiseCatch,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new FetchTimeoutError(url, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await mapper(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return out;
}
