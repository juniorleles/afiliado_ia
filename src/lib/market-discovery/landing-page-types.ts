/**
 * Host record domain: landing page collector records.
 *
 * Names the destination, final address, status, headers, and supplied page
 * text one collection may store. The page text is copied. It is not read.
 * This module does not reach an outside system.
 */
export type LandingPageMetadata = Record<string, string | number | boolean | null>;

export const LANDING_PAGE_STATUSES = ["OK", "REJECTED"] as const;
export type LandingPageStatus = (typeof LANDING_PAGE_STATUSES)[number];

export const LANDING_PAGE_ORIGINS = ["COLLECTED"] as const;
export type LandingPageOrigin = (typeof LANDING_PAGE_ORIGINS)[number];

export const LANDING_PAGE_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type LandingPageProvenance = (typeof LANDING_PAGE_PROVENANCE)[number];

export interface LandingPageIssue {
  field: string;
  message: string;
}

export const LANDING_PAGE_STATISTICS_KEYS = ["pageCount", "htmlLength", "issueCount", "executionTime"] as const;

export interface LandingPageStatistics {
  pageCount: number;
  htmlLength: number;
  issueCount: number;
  executionTime: number;
}

export function createLandingPageStatistics(init: LandingPageStatistics): LandingPageStatistics {
  return freezeDeepLandingPage({
    pageCount: init.pageCount,
    htmlLength: init.htmlLength,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepLandingPage<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepLandingPage(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainLandingPage<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainLandingPage(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainLandingPage(inner)])) as T;
  }
  return value;
}
