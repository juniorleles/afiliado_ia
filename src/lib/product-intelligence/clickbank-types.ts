/**
 * Host record domain: ClickBank importer records.
 *
 * Names the marketplace fields one import may restate as immutable
 * ProductFacts. Figures such as gravity are marketplace-stated values.
 * They are copied, never judged. This module does not reach an outside
 * system and does not run another engine.
 */
export type ClickBankMetadata = Record<string, string | number | boolean | null>;

export const CLICKBANK_IMPORT_STATUSES = ["OK", "REJECTED"] as const;
export type ClickBankImportStatus = (typeof CLICKBANK_IMPORT_STATUSES)[number];

export const CLICKBANK_FACT_ORIGINS = ["IMPORTED"] as const;
export type ClickBankFactOrigin = (typeof CLICKBANK_FACT_ORIGINS)[number];

export const CLICKBANK_FACT_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type ClickBankFactProvenance = (typeof CLICKBANK_FACT_PROVENANCE)[number];

export interface ClickBankIssue {
  field: string;
  message: string;
}

export const CLICKBANK_MONEY_KEYS = ["amount", "currency", "text"] as const;

export interface ClickBankMoney {
  amount: number;
  currency: string;
  text: string;
}

export const CLICKBANK_SOURCE_FACT_KEYS = ["field", "text", "sourceUrl", "confidence"] as const;

export interface ClickBankSourceFact {
  field: string;
  text: string;
  sourceUrl: string;
  confidence: ClickBankFactProvenance;
}

export const CLICKBANK_PRODUCT_FACTS_KEYS = [
  "productName",
  "vendor",
  "vendorId",
  "category",
  "gravity",
  "initialSale",
  "averageSale",
  "averageRebill",
  "commissionType",
  "language",
  "marketplaceUrl",
  "affiliatePage",
  "supportUrl",
  "refundPolicy",
  "affiliateResources",
  "description",
  "disclaimer",
  "origin",
  "provenance",
  "sourceUrl",
  "sourceFacts",
  "metadata",
] as const;

/** Normalized ProductFacts for one marketplace product. Restated, never judged. */
export interface ProductFacts {
  productName: string;
  vendor: string;
  vendorId: string | null;
  category: string | null;
  gravity: number | null;
  initialSale: ClickBankMoney | null;
  averageSale: ClickBankMoney | null;
  averageRebill: ClickBankMoney | null;
  commissionType: string | null;
  language: string | null;
  marketplaceUrl: string;
  affiliatePage: string | null;
  supportUrl: string | null;
  refundPolicy: string | null;
  affiliateResources: readonly string[];
  description: string | null;
  disclaimer: string | null;
  origin: ClickBankFactOrigin;
  provenance: ClickBankFactProvenance;
  sourceUrl: string;
  sourceFacts: readonly ClickBankSourceFact[];
  metadata: ClickBankMetadata;
}

export type ClickBankProductFacts = ProductFacts;

export const CLICKBANK_EXTRACTED_KEYS = [
  "productName",
  "vendor",
  "vendorId",
  "category",
  "gravity",
  "initialSale",
  "averageSale",
  "averageRebill",
  "commissionType",
  "language",
  "marketplaceUrl",
  "affiliatePage",
  "supportUrl",
  "refundPolicy",
  "affiliateResources",
  "description",
  "disclaimer",
] as const;

export interface ClickBankExtractedRecord {
  productName: string | null;
  vendor: string | null;
  vendorId: string | null;
  category: string | null;
  gravity: string | null;
  initialSale: string | null;
  averageSale: string | null;
  averageRebill: string | null;
  commissionType: string | null;
  language: string | null;
  marketplaceUrl: string | null;
  affiliatePage: string | null;
  supportUrl: string | null;
  refundPolicy: string | null;
  affiliateResources: readonly string[];
  description: string | null;
  disclaimer: string | null;
}

export const CLICKBANK_SNAPSHOT_KEYS = [
  "importId",
  "productId",
  "productName",
  "vendorId",
  "marketplaceUrl",
  "createdAt",
  "metadata",
] as const;

export interface ClickBankImportSnapshot {
  importId: string;
  productId: string;
  productName: string | null;
  vendorId: string | null;
  marketplaceUrl: string | null;
  createdAt: string;
  metadata: ClickBankMetadata;
}

export interface ClickBankImportSnapshotInit {
  importId: string;
  productId: string;
  productName: string | null;
  vendorId: string | null;
  marketplaceUrl: string | null;
  createdAt: string;
  metadata?: ClickBankMetadata;
}

export const CLICKBANK_STATISTICS_KEYS = ["importCount", "fieldCount", "issueCount", "executionTime"] as const;

export interface ClickBankImportStatistics {
  importCount: number;
  fieldCount: number;
  issueCount: number;
  executionTime: number;
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

export function createClickBankImportSnapshot(init: ClickBankImportSnapshotInit): ClickBankImportSnapshot {
  return freezeDeepClickBank({
    importId: init.importId,
    productId: init.productId,
    productName: init.productName,
    vendorId: init.vendorId,
    marketplaceUrl: init.marketplaceUrl,
    createdAt: init.createdAt,
    metadata: copyPlainClickBank(init.metadata ?? {}),
  });
}

export function computeClickBankImportStatistics(init: ClickBankImportStatistics): ClickBankImportStatistics {
  return freezeDeepClickBank({
    importCount: init.importCount,
    fieldCount: init.fieldCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

export function fieldCountOf(facts: ProductFacts | null): number {
  if (!facts) return 0;
  let count = 0;
  if (facts.productName) count += 1;
  if (facts.vendor) count += 1;
  if (facts.vendorId) count += 1;
  if (facts.category) count += 1;
  if (facts.gravity !== null) count += 1;
  if (facts.initialSale) count += 1;
  if (facts.averageSale) count += 1;
  if (facts.averageRebill) count += 1;
  if (facts.commissionType) count += 1;
  if (facts.language) count += 1;
  if (facts.marketplaceUrl) count += 1;
  if (facts.affiliatePage) count += 1;
  if (facts.supportUrl) count += 1;
  if (facts.refundPolicy) count += 1;
  if (facts.affiliateResources.length > 0) count += 1;
  if (facts.description) count += 1;
  if (facts.disclaimer) count += 1;
  return count;
}
