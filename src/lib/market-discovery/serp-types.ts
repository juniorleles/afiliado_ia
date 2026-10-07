/**
 * Host record domain: SERP parser records.
 *
 * Names the structural fields one search page may restate. A marker is copied
 * from the page. It is not a judgment. This module does not reach an outside
 * system.
 */
export type SerpMetadata = Record<string, string | number | boolean | null>;

export const SERP_STATUSES = ["OK", "REJECTED"] as const;
export type SerpStatus = (typeof SERP_STATUSES)[number];

export const SERP_ORIGINS = ["OBSERVED"] as const;
export type SerpOrigin = (typeof SERP_ORIGINS)[number];

export const SERP_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type SerpProvenance = (typeof SERP_PROVENANCE)[number];

export interface SerpIssue {
  field: string;
  message: string;
}

export const SERP_RECORD_KEYS = [
  "title",
  "url",
  "description",
  "position",
  "resultType",
  "sponsoredMarker",
  "organicMarker",
  "resultMetadata",
  "origin",
  "provenance",
] as const;

export interface SerpRecord {
  title: string | null;
  url: string | null;
  description: string | null;
  position: number | null;
  resultType: string | null;
  sponsoredMarker: string | null;
  organicMarker: string | null;
  resultMetadata: string | null;
  origin: SerpOrigin;
  provenance: SerpProvenance;
}

export const SERP_STATISTICS_KEYS = ["recordCount", "issueCount", "executionTime"] as const;

export interface SerpStatistics {
  recordCount: number;
  issueCount: number;
  executionTime: number;
}

export function createSerpStatistics(init: SerpStatistics): SerpStatistics {
  return freezeDeepSerp({
    recordCount: init.recordCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepSerp<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepSerp(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainSerp<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainSerp(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainSerp(inner)])) as T;
  }
  return value;
}
