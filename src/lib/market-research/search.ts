import { getBraveApiKey, createWebSearch } from "@/lib/source-resolution/provider";
import { createBraveWebSearch } from "@/lib/source-resolution/brave";
import {
  SearchAbortedError,
  SearchHttpError,
  SearchParseError,
  SearchTimeoutError,
} from "@/lib/source-resolution/search";
import type { FetchImpl, SearchFn, SearchHit, SearchProviderStatus } from "@/lib/source-resolution/types";
import type {
  MarketProviderAttempt,
  MarketProviderMix,
  MarketQueryOutcomeStatus,
  MarketSearchProvider,
} from "@/lib/market-research/types";

export type MarketQuerySearchResult = {
  hits: SearchHit[];
  status: MarketQueryOutcomeStatus;
  providerUsed: MarketSearchProvider;
  providerAttempts: MarketProviderAttempt[];
  durationMs: number;
};

const INFRA_FAILURE: MarketQueryOutcomeStatus[] = ["SEARCH_TIMEOUT", "HTTP_ERROR", "PARSE_ERROR"];

export type MarketResearchSearchers = {
  primary: SearchFn;
  fallback: SearchFn | null;
  fallbackConfigured: boolean;
  status: SearchProviderStatus;
};

/** Market Research provider composition. Independent from Import Facts search fallback. */
export function createMarketResearchSearch(fetchImpl: FetchImpl, signal?: AbortSignal): MarketResearchSearchers {
  const created = createWebSearch(fetchImpl, signal);
  const key = getBraveApiKey();
  return {
    primary: created.search,
    fallback: key ? createBraveWebSearch(fetchImpl, key, signal) : null,
    fallbackConfigured: Boolean(key),
    status: created.status,
  };
}

export function emptyProviderMix(): MarketProviderMix {
  return {
    DDG_QUERY_SUCCESS: 0,
    BRAVE_FALLBACK_ATTEMPTS: 0,
    BRAVE_FALLBACK_SUCCESS: 0,
    BRAVE_FALLBACK_FAILED: 0,
  };
}

export async function searchMarketQuery(input: {
  query: string;
  primary: SearchFn;
  fallback: SearchFn | null;
  fallbackConfigured: boolean;
  signal?: AbortSignal;
}): Promise<MarketQuerySearchResult> {
  const attempts: MarketProviderAttempt[] = [];
  const wall = Date.now();

  if (input.signal?.aborted) {
    attempts.push({ provider: "DUCKDUCKGO_HTML", status: "ABORTED", durationMs: 0 });
    return {
      hits: [],
      status: "ABORTED",
      providerUsed: "DUCKDUCKGO_HTML",
      providerAttempts: attempts,
      durationMs: 0,
    };
  }

  const ddg = await runProvider("DUCKDUCKGO_HTML", input.primary, input.query, input.signal);
  attempts.push(ddg.attempt);

  if (ddg.status === "SUCCESS" || ddg.status === "SUCCESS_EMPTY" || ddg.status === "ABORTED") {
    return finish(ddg.hits, ddg.status, "DUCKDUCKGO_HTML", attempts, wall);
  }

  if (!INFRA_FAILURE.includes(ddg.status)) {
    return finish([], ddg.status, "DUCKDUCKGO_HTML", attempts, wall);
  }

  if (input.signal?.aborted) {
    attempts.push({ provider: "BRAVE", status: "ABORTED", durationMs: 0 });
    return finish([], "ABORTED", "DUCKDUCKGO_HTML", attempts, wall);
  }

  if (!input.fallbackConfigured || !input.fallback) {
    attempts.push({ provider: "BRAVE", status: "BRAVE_NOT_CONFIGURED", durationMs: 0 });
    return finish([], ddg.status, "DUCKDUCKGO_HTML", attempts, wall);
  }

  const brave = await runProvider("BRAVE", input.fallback, input.query, input.signal);
  attempts.push(brave.attempt);
  return finish(brave.hits, brave.status, "BRAVE", attempts, wall);
}

async function runProvider(
  provider: MarketSearchProvider,
  search: SearchFn,
  query: string,
  signal?: AbortSignal,
): Promise<{ hits: SearchHit[]; status: MarketQueryOutcomeStatus; attempt: MarketProviderAttempt }> {
  const started = Date.now();
  if (signal?.aborted) {
    return {
      hits: [],
      status: "ABORTED",
      attempt: { provider, status: "ABORTED", durationMs: 0 },
    };
  }
  try {
    const hits = await search(query, signal);
    if (signal?.aborted) {
      return {
        hits: [],
        status: "ABORTED",
        attempt: { provider, status: "ABORTED", durationMs: Date.now() - started },
      };
    }
    const status: MarketQueryOutcomeStatus = hits.length > 0 ? "SUCCESS" : "SUCCESS_EMPTY";
    return {
      hits,
      status,
      attempt: { provider, status, durationMs: Date.now() - started },
    };
  } catch (err) {
    const status = outcomeStatusFromError(err, signal);
    return {
      hits: [],
      status,
      attempt: { provider, status, durationMs: Date.now() - started },
    };
  }
}

function finish(
  hits: SearchHit[],
  status: MarketQueryOutcomeStatus,
  providerUsed: MarketSearchProvider,
  providerAttempts: MarketProviderAttempt[],
  wall: number,
): MarketQuerySearchResult {
  return {
    hits,
    status,
    providerUsed,
    providerAttempts,
    durationMs: Date.now() - wall,
  };
}

export function outcomeStatusFromError(err: unknown, signal?: AbortSignal): MarketQueryOutcomeStatus {
  if (signal?.aborted) return "ABORTED";
  if (err instanceof SearchAbortedError) return "ABORTED";
  if (err instanceof SearchTimeoutError) return "SEARCH_TIMEOUT";
  if (err instanceof SearchHttpError) return "HTTP_ERROR";
  if (err instanceof SearchParseError) return "PARSE_ERROR";
  if (err && typeof err === "object") {
    const name = (err as { name?: string }).name || "";
    if (name === "AbortError") return "ABORTED";
    if (name === "SearchTimeoutError" || name === "FetchTimeoutError" || name === "TimeoutError") {
      return "SEARCH_TIMEOUT";
    }
    if (name === "SearchHttpError") return "HTTP_ERROR";
    if (name === "SearchParseError") return "PARSE_ERROR";
  }
  return "PARSE_ERROR";
}

export function summarizeProviderMix(
  outcomes: Array<{
    providerAttempts: MarketProviderAttempt[];
  }>,
): MarketProviderMix {
  let DDG_QUERY_SUCCESS = 0;
  let BRAVE_FALLBACK_ATTEMPTS = 0;
  let BRAVE_FALLBACK_SUCCESS = 0;
  let BRAVE_FALLBACK_FAILED = 0;
  for (const row of outcomes) {
    const ddg = row.providerAttempts.find((item) => item.provider === "DUCKDUCKGO_HTML");
    if (ddg?.status === "SUCCESS") DDG_QUERY_SUCCESS += 1;
    const brave = row.providerAttempts.find((item) => item.provider === "BRAVE");
    if (!brave || brave.status === "BRAVE_NOT_CONFIGURED") continue;
    BRAVE_FALLBACK_ATTEMPTS += 1;
    if (brave.status === "SUCCESS" || brave.status === "SUCCESS_EMPTY") BRAVE_FALLBACK_SUCCESS += 1;
    else BRAVE_FALLBACK_FAILED += 1;
  }
  return { DDG_QUERY_SUCCESS, BRAVE_FALLBACK_ATTEMPTS, BRAVE_FALLBACK_SUCCESS, BRAVE_FALLBACK_FAILED };
}
