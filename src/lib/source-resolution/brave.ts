import { assertSafeOutboundUrl } from "@/lib/fetch-guard";
import { FetchTimeoutError, combineAbortSignals, fetchWithTimeout, isAbortLike } from "@/lib/source-resolution/http";
import { hitsFromSearchOutcome } from "@/lib/source-resolution/search";
import { SEARCH_PROVIDER_TIMEOUT_MS } from "@/lib/source-resolution/timeouts";
import type { FetchImpl, SearchFn, SearchHit, SearchOutcome } from "@/lib/source-resolution/types";

export async function executeBraveSearch(input: {
  fetchImpl: FetchImpl;
  query: string;
  apiKey: string;
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
  const endpoint = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(input.query)}&count=8`;
  try {
    assertSafeOutboundUrl(endpoint);
    const response = await fetchWithTimeout(
      input.fetchImpl,
      endpoint,
      {
        headers: {
          accept: "application/json",
          "x-subscription-token": input.apiKey,
        },
        cache: "no-store",
      },
      timeoutMs,
      signal,
    );
    if (response.status !== 200) {
      return { status: "HTTP_ERROR", hits: [], httpStatus: response.status, error: `HTTP ${response.status}` };
    }
    let data: { web?: { results?: Array<{ url?: string; title?: string; description?: string }> } };
    try {
      data = (await response.json()) as typeof data;
    } catch (err) {
      return {
        status: "PARSE_ERROR",
        hits: [],
        httpStatus: 200,
        error: err instanceof Error ? err.message : "invalid JSON",
      };
    }
    const hits = toHits(
      (data.web?.results || []).map((row) => ({ url: row.url, title: row.title, snippet: row.description })),
    );
    return hits.length > 0 ? { status: "SUCCESS", hits, httpStatus: 200 } : { status: "SUCCESS_EMPTY", hits: [], httpStatus: 200 };
  } catch (err) {
    if (input.signal?.aborted) {
      return { status: "GLOBAL_ABORT", hits: [], error: err instanceof Error ? err.message : "aborted" };
    }
    if (timeoutController.signal.aborted || err instanceof FetchTimeoutError || isAbortLike(err)) {
      return {
        status: "SEARCH_TIMEOUT",
        hits: [],
        error: err instanceof Error ? err.message : `SEARCH_TIMEOUT after ${timeoutMs}ms`,
      };
    }
    return { status: "HTTP_ERROR", hits: [], error: err instanceof Error ? err.message : "brave request failed" };
  } finally {
    clearTimeout(timer);
  }
}

export function createBraveWebSearch(fetchImpl: FetchImpl, apiKey: string, signal?: AbortSignal): SearchFn {
  return async (query: string, callSignal?: AbortSignal) => {
    const combined = combineAbortSignals(signal, callSignal);
    const outcome = await executeBraveSearch({
      fetchImpl,
      query,
      apiKey,
      timeoutMs: SEARCH_PROVIDER_TIMEOUT_MS,
      signal: combined,
    });
    return hitsFromSearchOutcome(query, SEARCH_PROVIDER_TIMEOUT_MS, outcome);
  };
}

function toHits(rows: Array<{ url?: string; title?: string; snippet?: string }>): SearchHit[] {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const url = (row.url || "").trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    hits.push({
      url,
      title: (row.title || "").trim(),
      snippet: (row.snippet || "").trim(),
    });
  }
  return hits;
}
