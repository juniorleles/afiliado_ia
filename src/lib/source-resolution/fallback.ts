import { logEvent } from "@/lib/logger";
import { FetchTimeoutError, isAbortLike } from "@/lib/source-resolution/http";
import {
  SearchAbortedError,
  SearchHttpError,
  SearchParseError,
  SearchTimeoutError,
} from "@/lib/source-resolution/search";
import type { SearchFn, SearchHit } from "@/lib/source-resolution/types";

const INFRA_STATUSES = ["SEARCH_TIMEOUT", "HTTP_ERROR", "PARSE_ERROR"] as const;

export function withSearchFallback(input: {
  primary: SearchFn;
  secondary: SearchFn;
  primaryName?: string;
  secondaryName?: string;
}): SearchFn {
  const primaryName = input.primaryName || "DUCKDUCKGO_HTML";
  const secondaryName = input.secondaryName || "BRAVE";
  return async (query: string, signal?: AbortSignal) => {
    logEvent("INFO", "IMPORT", "SEARCH_PRIMARY_START", { provider: primaryName, query });
    const started = Date.now();
    try {
      const hits = await input.primary(query, signal);
      logEvent("INFO", "IMPORT", "SEARCH_PRIMARY_END", {
        provider: primaryName,
        query,
        status: hits.length > 0 ? "SUCCESS" : "SUCCESS_EMPTY",
        hits: hits.length,
        durationMs: Date.now() - started,
      });
      return hits;
    } catch (err) {
      const status = classifyThrown(err, signal);
      logEvent("INFO", "IMPORT", "SEARCH_PRIMARY_END", {
        provider: primaryName,
        query,
        status,
        hits: 0,
        durationMs: Date.now() - started,
      });
      if (status === "GLOBAL_ABORT" || !INFRA_STATUSES.includes(status as (typeof INFRA_STATUSES)[number])) {
        throw err;
      }
      if (signal?.aborted) throw new SearchAbortedError(query);
      return runSecondary(input.secondary, secondaryName, query, signal);
    }
  };
}

async function runSecondary(
  secondary: SearchFn,
  secondaryName: string,
  query: string,
  signal?: AbortSignal,
): Promise<SearchHit[]> {
  logEvent("INFO", "IMPORT", "SEARCH_FALLBACK_START", { provider: secondaryName, query });
  const started = Date.now();
  try {
    const hits = await secondary(query, signal);
    logEvent("INFO", "IMPORT", "SEARCH_FALLBACK_END", {
      provider: secondaryName,
      query,
      status: hits.length > 0 ? "SUCCESS" : "SUCCESS_EMPTY",
      hits: hits.length,
      durationMs: Date.now() - started,
    });
    return hits;
  } catch (err) {
    logEvent("INFO", "IMPORT", "SEARCH_FALLBACK_END", {
      provider: secondaryName,
      query,
      status: classifyThrown(err, signal),
      hits: 0,
      durationMs: Date.now() - started,
    });
    throw err;
  }
}

function classifyThrown(err: unknown, signal?: AbortSignal): string {
  if (signal?.aborted || err instanceof SearchAbortedError) return "GLOBAL_ABORT";
  if (err instanceof SearchTimeoutError) return "SEARCH_TIMEOUT";
  if (err instanceof SearchHttpError) return "HTTP_ERROR";
  if (err instanceof SearchParseError) return "PARSE_ERROR";
  if (err instanceof FetchTimeoutError || isAbortLike(err)) return "SEARCH_TIMEOUT";
  return "ERROR";
}
