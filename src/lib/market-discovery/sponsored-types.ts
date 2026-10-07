/**
 * Host record domain: sponsored result records.
 *
 * Names the sponsored fields copied from structural SERP records. A marker
 * that is already present is the only signal. This module does not reach an
 * outside system.
 */
export type SponsoredMetadata = Record<string, string | number | boolean | null>;

export const SPONSORED_STATUSES = ["OK", "REJECTED"] as const;
export type SponsoredStatus = (typeof SPONSORED_STATUSES)[number];

export const SPONSORED_ORIGINS = ["OBSERVED"] as const;
export type SponsoredOrigin = (typeof SPONSORED_ORIGINS)[number];

export const SPONSORED_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type SponsoredProvenance = (typeof SPONSORED_PROVENANCE)[number];

export interface SponsoredIssue {
  field: string;
  message: string;
}

export const SPONSORED_RESULT_KEYS = [
  "title",
  "url",
  "description",
  "position",
  "sponsoredMarker",
  "resultMetadata",
  "origin",
  "provenance",
] as const;

export interface SponsoredResult {
  title: string | null;
  url: string | null;
  description: string | null;
  position: number | null;
  sponsoredMarker: string;
  resultMetadata: string | null;
  origin: SponsoredOrigin;
  provenance: SponsoredProvenance;
}

export const SPONSORED_STATISTICS_KEYS = ["sourceCount", "sponsoredCount", "issueCount", "executionTime"] as const;

export interface SponsoredStatistics {
  sourceCount: number;
  sponsoredCount: number;
  issueCount: number;
  executionTime: number;
}

export function createSponsoredStatistics(init: SponsoredStatistics): SponsoredStatistics {
  return freezeDeepSponsored({
    sourceCount: init.sourceCount,
    sponsoredCount: init.sponsoredCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepSponsored<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepSponsored(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainSponsored<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainSponsored(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainSponsored(inner)])) as T;
  }
  return value;
}
