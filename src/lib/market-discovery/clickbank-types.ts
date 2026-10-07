/**
 * Host record domain: marketplace resolution records.
 *
 * Names the observed product, the supplied listing fields, and the match
 * evidence one resolution may restate. Listing figures are copied. This
 * module does not reach an outside system.
 */
export type ClickBankMetadata = Record<string, string | number | boolean | null>;
export type ResolutionMetadata = ClickBankMetadata;

export const CLICKBANK_STATUSES = ["OK", "REJECTED"] as const;
export type ClickBankStatus = (typeof CLICKBANK_STATUSES)[number];

export const CLICKBANK_ORIGINS = ["RESOLVED"] as const;
export type ClickBankOrigin = (typeof CLICKBANK_ORIGINS)[number];

export const CLICKBANK_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type ClickBankProvenance = (typeof CLICKBANK_PROVENANCE)[number];

export const MATCH_METHODS = ["EXACT_PRODUCT_AND_VENDOR", "EXACT_PRODUCT", "UNMATCHED"] as const;
export type MatchMethod = (typeof MATCH_METHODS)[number];

export const MATCH_CONFIDENCE = ["CONFIRMED", "NAME_ONLY", "UNMATCHED"] as const;
export type MatchConfidence = (typeof MATCH_CONFIDENCE)[number];

export interface ClickBankIssue {
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

export const MARKETPLACE_MONEY_KEYS = ["amount", "currency", "text"] as const;

export interface MarketplaceMoney {
  amount: number;
  currency: string;
  text: string;
}

export const MARKETPLACE_RECORD_KEYS = [
  "productName",
  "vendor",
  "marketplaceUrl",
  "gravity",
  "initialSale",
  "averageSale",
  "averageRebill",
  "commissionType",
  "category",
  "language",
  "affiliateResources",
  "marketplaceMetadata",
] as const;

export interface MarketplaceRecord {
  productName: string;
  vendor: string | null;
  marketplaceUrl: string | null;
  gravity: number | null;
  initialSale: MarketplaceMoney | null;
  averageSale: MarketplaceMoney | null;
  averageRebill: MarketplaceMoney | null;
  commissionType: string | null;
  category: string | null;
  language: string | null;
  affiliateResources: readonly string[];
  marketplaceMetadata: ResolutionMetadata;
}

export const RESOLVED_PRODUCT_KEYS = [
  "observedProductName",
  "observedVendor",
  "vendor",
  "product",
  "marketplaceUrl",
  "gravity",
  "initialSale",
  "averageSale",
  "averageRebill",
  "commissionType",
  "category",
  "language",
  "affiliateResources",
  "marketplaceMetadata",
  "origin",
  "provenance",
] as const;

export interface ResolvedProduct {
  observedProductName: string;
  observedVendor: string | null;
  vendor: string | null;
  product: string | null;
  marketplaceUrl: string | null;
  gravity: number | null;
  initialSale: MarketplaceMoney | null;
  averageSale: MarketplaceMoney | null;
  averageRebill: MarketplaceMoney | null;
  commissionType: string | null;
  category: string | null;
  language: string | null;
  affiliateResources: readonly string[];
  marketplaceMetadata: ResolutionMetadata;
  origin: ClickBankOrigin;
  provenance: ClickBankProvenance;
}

export const RESOLUTION_EVIDENCE_KEYS = [
  "matchedProductName",
  "matchedVendor",
  "matchMethod",
  "matchConfidence",
  "marketplaceSource",
  "evidenceMetadata",
  "origin",
  "provenance",
] as const;

export interface ResolutionEvidence {
  matchedProductName: string | null;
  matchedVendor: string | null;
  matchMethod: MatchMethod;
  matchConfidence: MatchConfidence;
  marketplaceSource: string;
  evidenceMetadata: ResolutionMetadata;
  origin: ClickBankOrigin;
  provenance: ClickBankProvenance;
}

export const CLICKBANK_STATISTICS_KEYS = ["catalogCount", "issueCount", "executionTime"] as const;

export interface ClickBankStatistics {
  catalogCount: number;
  issueCount: number;
  executionTime: number;
}

export function createClickBankStatistics(init: ClickBankStatistics): ClickBankStatistics {
  return freezeDeepClickBank({
    catalogCount: init.catalogCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepClickBank<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepClickBank(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainClickBank<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainClickBank(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainClickBank(inner)])) as T;
  }
  return value;
}
