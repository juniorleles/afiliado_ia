/**
 * Host record domain: product identification records.
 *
 * Names the identity fields and the page evidence one landing page may
 * restate. A field is copied when the page shows it. This module does not
 * reach an outside system.
 */
export type ProductMetadata = Record<string, string | number | boolean | null>;
export type IdentificationMetadata = ProductMetadata;

export const PRODUCT_STATUSES = ["OK", "REJECTED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_ORIGINS = ["OBSERVED"] as const;
export type ProductOrigin = (typeof PRODUCT_ORIGINS)[number];

export const PRODUCT_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type ProductProvenance = (typeof PRODUCT_PROVENANCE)[number];

export interface ProductIssue {
  field: string;
  message: string;
}

export const PRODUCT_IDENTITY_KEYS = [
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

export interface ProductIdentity {
  landingPageId: string;
  productName: string;
  brand: string | null;
  vendor: string | null;
  primaryOffer: string | null;
  primaryDomain: string | null;
  offerUrl: string | null;
  category: string | null;
  language: string | null;
  visiblePrice: string | null;
  currency: string | null;
  origin: ProductOrigin;
  provenance: ProductProvenance;
}

export const PRODUCT_EVIDENCE_KEYS = [
  "landingPageId",
  "htmlTitle",
  "metaTitle",
  "openGraphTitle",
  "h1",
  "canonicalUrl",
  "structuredData",
  "visibleProductName",
  "visibleBrand",
  "visibleCtas",
  "visiblePrice",
  "brandMentions",
  "origin",
  "provenance",
] as const;

export interface IdentificationEvidence {
  landingPageId: string;
  htmlTitle: string | null;
  metaTitle: string | null;
  openGraphTitle: string | null;
  h1: string | null;
  canonicalUrl: string | null;
  structuredData: string | null;
  visibleProductName: string | null;
  visibleBrand: string | null;
  visibleCtas: readonly string[];
  visiblePrice: string | null;
  brandMentions: readonly string[];
  origin: ProductOrigin;
  provenance: ProductProvenance;
}

export const CONFIDENCE_INPUT_KEYS = [
  "productName",
  "brand",
  "vendor",
  "primaryDomain",
  "offerUrl",
  "category",
  "language",
  "price",
  "currency",
  "htmlTitle",
  "h1",
  "structuredData",
] as const;

/** Which observed fields were present. These are inputs, not a computed figure. */
export interface ConfidenceInputs {
  productName: boolean;
  brand: boolean;
  vendor: boolean;
  primaryDomain: boolean;
  offerUrl: boolean;
  category: boolean;
  language: boolean;
  price: boolean;
  currency: boolean;
  htmlTitle: boolean;
  h1: boolean;
  structuredData: boolean;
}

export const OBSERVED_PRODUCT_RECORD_KEYS = ["identity", "evidence", "metadata", "confidenceInputs"] as const;

export interface ObservedProduct {
  identity: ProductIdentity;
  evidence: IdentificationEvidence;
  metadata: IdentificationMetadata;
  confidenceInputs: ConfidenceInputs;
}

export type IdentificationStatistics = ProductStatistics;

export const PRODUCT_STATISTICS_KEYS = ["pageCount", "issueCount", "executionTime"] as const;

export interface ProductStatistics {
  pageCount: number;
  issueCount: number;
  executionTime: number;
}

export function createProductStatistics(init: ProductStatistics): ProductStatistics {
  return freezeDeepProduct({
    pageCount: init.pageCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepProduct<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepProduct(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainProduct<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainProduct(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainProduct(inner)])) as T;
  }
  return value;
}
