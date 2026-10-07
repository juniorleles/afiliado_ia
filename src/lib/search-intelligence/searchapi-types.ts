/**
 * Host record domain: SearchApi normalizer records.
 *
 * Names the normalized search snapshot, SERP records, and sponsored results
 * one provider response may become. SearchApi field names stay inside the mapper.
 */
export type FlatRecord = Record<string, string | number | boolean | null>;

export const NORMALIZER_STATUSES = ["OK", "REJECTED"] as const;
export type NormalizerStatus = (typeof NORMALIZER_STATUSES)[number];

export const NORMALIZER_ORIGINS = ["OBSERVED"] as const;
export type NormalizerOrigin = (typeof NORMALIZER_ORIGINS)[number];

export const NORMALIZER_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type NormalizerProvenance = (typeof NORMALIZER_PROVENANCE)[number];

export interface NormalizerIssue {
  field: string;
  message: string;
}

export const NORMALIZER_STATISTICS_KEYS = ["serpCount", "sponsoredCount", "issueCount", "executionTime"] as const;

export interface NormalizerStatistics {
  serpCount: number;
  sponsoredCount: number;
  issueCount: number;
  executionTime: number;
}

export const NORMALIZER_SNAPSHOT_KEYS = [
  "normalizationId",
  "searchSnapshot",
  "serpRecords",
  "sponsoredResults",
  "searchMetadata",
  "statistics",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export const NORMALIZER_RESPONSE_KEYS = ["status", "issues", "snapshot", "metadata", "statistics"] as const;

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepNormalizer<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepNormalizer(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainNormalizer<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainNormalizer(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainNormalizer(inner)])) as T;
  }
  return value;
}
