import { assertSafeOutboundUrl } from "@/lib/fetch-guard";
import { FetchTimeoutError, combineAbortSignals, fetchWithTimeout, isAbortLike } from "@/lib/source-resolution/http";
import { SEARCH_PROVIDER_TIMEOUT_MS } from "@/lib/source-resolution/timeouts";
import type { FetchImpl, SearchFn, SearchHit, SearchOutcome, SearchOutcomeStatus } from "@/lib/source-resolution/types";

const SEARCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export class SearchTimeoutError extends Error {
  readonly status: SearchOutcomeStatus = "SEARCH_TIMEOUT";
  constructor(query: string, timeoutMs: number) {
    super(`SEARCH_TIMEOUT after ${timeoutMs}ms for ${query}`);
    this.name = "SearchTimeoutError";
  }
}

export class SearchAbortedError extends Error {
  readonly status: SearchOutcomeStatus = "GLOBAL_ABORT";
  constructor(query: string) {
    super(`GLOBAL_ABORT for ${query}`);
    this.name = "SearchAbortedError";
  }
}

export class SearchHttpError extends Error {
  readonly status: SearchOutcomeStatus = "HTTP_ERROR";
  readonly httpStatus: number | null;
  constructor(query: string, httpStatus: number | null) {
    super(`HTTP_ERROR ${httpStatus ?? "unknown"} for ${query}`);
    this.name = "SearchHttpError";
    this.httpStatus = httpStatus;
  }
}

export class SearchParseError extends Error {
  readonly status: SearchOutcomeStatus = "PARSE_ERROR";
  constructor(query: string) {
    super(`PARSE_ERROR for ${query}`);
    this.name = "SearchParseError";
  }
}

export function hitsFromSearchOutcome(query: string, timeoutMs: number, outcome: SearchOutcome): SearchHit[] {
  if (outcome.status === "SUCCESS" || outcome.status === "SUCCESS_EMPTY") return outcome.hits;
  if (outcome.status === "SEARCH_TIMEOUT") throw new SearchTimeoutError(query, timeoutMs);
  if (outcome.status === "GLOBAL_ABORT") throw new SearchAbortedError(query);
  if (outcome.status === "HTTP_ERROR") throw new SearchHttpError(query, outcome.httpStatus ?? null);
  if (outcome.status === "PARSE_ERROR") throw new SearchParseError(query);
  return outcome.hits;
}

export function unwrapDuckDuckGoUrl(href: string): string {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    return url.href;
  } catch {
    return href;
  }
}

export function parseDuckDuckGoHtml(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const re =
    /<a[^>]*class="[^"]*result(?:__a|-link)[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)>|)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    pushHit(hits, seen, unwrapDuckDuckGoUrl(decodeHtml(match[1] || "")), match[2] || "", match[3] || "");
  }
  if (hits.length === 0) {
    const fallback = /uddg=([^&"]+)/gi;
    while ((match = fallback.exec(html))) {
      try {
        pushHit(hits, seen, decodeURIComponent(match[1] || ""), "", "");
      } catch {
        continue;
      }
    }
  }
  return hits;
}

function pushHit(hits: SearchHit[], seen: Set<string>, rawUrl: string, rawTitle: string, rawSnippet: string): void {
  const url = rawUrl.trim();
  const title = decodeHtml(stripTags(rawTitle)).trim();
  const snippet = decodeHtml(stripTags(rawSnippet)).trim();
  if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) return;
  if (/duckduckgo\.com/i.test(url) && !/uddg=/i.test(url)) return;
  seen.add(url);
  hits.push({ url, title, snippet });
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export async function executeDuckDuckGoSearch(input: {
  fetchImpl: FetchImpl;
  query: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<SearchOutcome> {
  const timeoutMs = input.timeoutMs ?? SEARCH_PROVIDER_TIMEOUT_MS;
  if (input.signal?.aborted) {
    return { status: "GLOBAL_ABORT", hits: [], error: "caller aborted" };
  }
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), Math.max(1, timeoutMs));
  const signal = combineAbortSignals(input.signal, timeoutController.signal);
  const encoded = encodeURIComponent(input.query);
  const attempts: Array<{ url: string; method: "GET" | "POST"; body?: string }> = [
    { url: `https://html.duckduckgo.com/html/?q=${encoded}`, method: "GET" },
    { url: "https://html.duckduckgo.com/html/", method: "POST", body: `q=${encoded}` },
    { url: `https://lite.duckduckgo.com/lite/?q=${encoded}`, method: "GET" },
  ];
  const deadline = Date.now() + timeoutMs;
  let lastHttp: number | null = null;
  let sawTimeout = false;
  try {
    for (const attempt of attempts) {
      if (input.signal?.aborted) return { status: "GLOBAL_ABORT", hits: [], error: "caller aborted" };
      if (timeoutController.signal.aborted) {
        return { status: "SEARCH_TIMEOUT", hits: [], error: `SEARCH_TIMEOUT after ${timeoutMs}ms` };
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return { status: "SEARCH_TIMEOUT", hits: [], error: `SEARCH_TIMEOUT after ${timeoutMs}ms` };
      }
      assertSafeOutboundUrl(attempt.url);
      try {
        const response = await fetchWithTimeout(
          input.fetchImpl,
          attempt.url,
          {
            method: attempt.method,
            headers: {
              "user-agent": SEARCH_UA,
              accept: "text/html",
              ...(attempt.method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
            },
            body: attempt.body,
            cache: "no-store",
          },
          remaining,
          signal,
        );
        lastHttp = response.status;
        if (response.status !== 200) continue;
        const html = await response.text();
        const hits = parseDuckDuckGoHtml(html);
        if (hits.length > 0) return { status: "SUCCESS", hits, httpStatus: 200 };
        return { status: "SUCCESS_EMPTY", hits: [], httpStatus: 200 };
      } catch (err) {
        if (input.signal?.aborted) {
          return { status: "GLOBAL_ABORT", hits: [], error: err instanceof Error ? err.message : "aborted" };
        }
        if (timeoutController.signal.aborted || err instanceof FetchTimeoutError || isAbortLike(err)) {
          sawTimeout = true;
          return {
            status: "SEARCH_TIMEOUT",
            hits: [],
            error: err instanceof Error ? err.message : `SEARCH_TIMEOUT after ${timeoutMs}ms`,
          };
        }
        continue;
      }
    }
    if (sawTimeout || timeoutController.signal.aborted) {
      return { status: "SEARCH_TIMEOUT", hits: [], error: `SEARCH_TIMEOUT after ${timeoutMs}ms` };
    }
    if (lastHttp != null && lastHttp !== 200) {
      return { status: "HTTP_ERROR", hits: [], httpStatus: lastHttp, error: `HTTP ${lastHttp}` };
    }
    return { status: "SUCCESS_EMPTY", hits: [], httpStatus: lastHttp };
  } finally {
    clearTimeout(timer);
  }
}

export function defaultWebSearch(fetchImpl: FetchImpl, signal?: AbortSignal): SearchFn {
  return async (query: string, callSignal?: AbortSignal) => {
    const combined = combineAbortSignals(signal, callSignal);
    const outcome = await executeDuckDuckGoSearch({
      fetchImpl,
      query,
      timeoutMs: SEARCH_PROVIDER_TIMEOUT_MS,
      signal: combined,
    });
    if (outcome.status === "SEARCH_TIMEOUT") {
      throw new SearchTimeoutError(query, SEARCH_PROVIDER_TIMEOUT_MS);
    }
    if (outcome.status === "GLOBAL_ABORT") {
      throw new SearchAbortedError(query);
    }
    if (outcome.status === "HTTP_ERROR") {
      throw new SearchHttpError(query, outcome.httpStatus ?? null);
    }
    if (outcome.status === "PARSE_ERROR") {
      throw new SearchParseError(query);
    }
    return outcome.hits;
  };
}

export function sameUrl(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    const norm = (u: URL) => `${u.protocol}//${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
    return norm(left) === norm(right);
  } catch {
    return a === b;
  }
}
