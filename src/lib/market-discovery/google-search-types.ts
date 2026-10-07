/**
 * Host record domain: google search connector records.
 *
 * Names the query, locale, device, market, and supplied page one collection
 * may restate. The page text is copied. It is not read for listings, and it
 * is not judged. This module does not reach an outside system.
 */
export type SearchMetadata = Record<string, string | number | boolean | null>;

export const SEARCH_STATUSES = ["OK", "REJECTED"] as const;
export type SearchStatus = (typeof SEARCH_STATUSES)[number];

export const SEARCH_ORIGINS = ["COLLECTED"] as const;
export type SearchOrigin = (typeof SEARCH_ORIGINS)[number];

export const SEARCH_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type SearchProvenance = (typeof SEARCH_PROVENANCE)[number];

export const SEARCH_DEVICES = ["desktop", "mobile", "tablet"] as const;
export type SearchDevice = (typeof SEARCH_DEVICES)[number];

export interface SearchIssue {
  field: string;
  message: string;
}

export const SEARCH_STATISTICS_KEYS = ["collectionCount", "htmlLength", "issueCount", "executionTime"] as const;

export interface SearchStatistics {
  collectionCount: number;
  htmlLength: number;
  issueCount: number;
  executionTime: number;
}

export function createSearchStatistics(init: SearchStatistics): SearchStatistics {
  return freezeDeepSearch({
    collectionCount: init.collectionCount,
    htmlLength: init.htmlLength,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepSearch<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepSearch(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainSearch<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainSearch(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainSearch(inner)])) as T;
  }
  return value;
}
