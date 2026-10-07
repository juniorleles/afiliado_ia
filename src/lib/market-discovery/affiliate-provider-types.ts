/**
 * Host record domain: affiliate network resolution records.
 *
 * Names the observed product, the listing fields a provider may restate, and
 * the match evidence. Listing figures are copied. This module does not reach
 * an outside system.
 */
export type AffiliateMetadata = Record<string, string | number | boolean | null>;
export type ResolutionMetadata = AffiliateMetadata;

export const AFFILIATE_STATUSES = ["OK", "REJECTED"] as const;
export type AffiliateStatus = (typeof AFFILIATE_STATUSES)[number];

export const AFFILIATE_ORIGINS = ["RESOLVED"] as const;
export type AffiliateOrigin = (typeof AFFILIATE_ORIGINS)[number];

export const AFFILIATE_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type AffiliateProvenance = (typeof AFFILIATE_PROVENANCE)[number];

export const MATCH_METHODS = ["EXACT_PRODUCT_AND_VENDOR", "EXACT_PRODUCT", "UNMATCHED"] as const;
export type MatchMethod = (typeof MATCH_METHODS)[number];

export interface AffiliateIssue {
  field: string;
  message: string;
}

export const OBSERVED_PRODUCT_KEYS = [
  "landingPageId",
  "productName",
  "brand",
  "vendor",
  "primaryOffer",
  "primaryDomain",
  "offerUrl",
  "category",
  "language",
  "visiblePrice",
  "currency",
  "origin",
  "provenance",
] as const;

export interface ObservedProduct {
  productName: string;
  vendor: string | null;
  brand: string | null;
  offerUrl: string | null;
  primaryDomain: string | null;
  primaryOffer: string | null;
  category: string | null;
  language: string | null;
  visiblePrice: string | null;
  currency: string | null;
  landingPageId: string | null;
}

export const AFFILIATE_RECORD_KEYS = ["productName", "vendor", "category", "affiliateUrl", "commission", "gravity", "marketplaceMetadata", "affiliateResources"] as const;

export interface AffiliateRecord {
  productName: string;
  vendor: string | null;
  category: string | null;
  affiliateUrl: string | null;
  commission: string | null;
  gravity: number | null;
  marketplaceMetadata: ResolutionMetadata;
  affiliateResources: readonly string[];
}

export const RESOLVED_AFFILIATE_PRODUCT_KEYS = [
  "observedProductName",
  "observedVendor",
  "network",
  "vendor",
  "productName",
  "category",
  "affiliateUrl",
  "commission",
  "gravity",
  "marketplaceMetadata",
  "affiliateResources",
  "origin",
  "provenance",
] as const;

export interface ResolvedAffiliateProduct {
  observedProductName: string;
  observedVendor: string | null;
  network: string;
  vendor: string | null;
  productName: string | null;
  category: string | null;
  affiliateUrl: string | null;
  commission: string | null;
  gravity: number | null;
  marketplaceMetadata: ResolutionMetadata;
  affiliateResources: readonly string[];
  origin: AffiliateOrigin;
  provenance: AffiliateProvenance;
}

export const RESOLUTION_EVIDENCE_KEYS = ["network", "matchedProductName", "matchedVendor", "matchMethod", "marketplaceSource", "evidenceMetadata", "origin", "provenance"] as const;

export interface ResolutionEvidence {
  network: string;
  matchedProductName: string | null;
  matchedVendor: string | null;
  matchMethod: MatchMethod;
  marketplaceSource: string;
  evidenceMetadata: ResolutionMetadata;
  origin: AffiliateOrigin;
  provenance: AffiliateProvenance;
}

export const AFFILIATE_STATISTICS_KEYS = ["providerCount", "resolutionCount", "issueCount", "executionTime"] as const;

export interface AffiliateStatistics {
  providerCount: number;
  resolutionCount: number;
  issueCount: number;
  executionTime: number;
}

export function createAffiliateStatistics(init: AffiliateStatistics): AffiliateStatistics {
  return freezeDeepAffiliate({
    providerCount: init.providerCount,
    resolutionCount: init.resolutionCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepAffiliate<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepAffiliate(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainAffiliate<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainAffiliate(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainAffiliate(inner)])) as T;
  }
  return value;
}
