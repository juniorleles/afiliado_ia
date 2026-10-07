/**
 * Host record domain: marketplace resolution snapshot.
 *
 * A frozen copy of one resolved product and the match evidence it was copied
 * from. This module does not choose a listing and does not reach an outside
 * system.
 */
import { freezeDeepClickBank, type ClickBankOrigin, type ClickBankProvenance, type ResolutionEvidence, type ResolutionMetadata, type ResolvedProduct } from "./clickbank-types";

export const RESOLUTION_SNAPSHOT_KEYS = ["resolutionId", "product", "evidence", "createdAt", "origin", "provenance", "metadata"] as const;

export interface ClickBankSnapshot {
  resolutionId: string;
  product: ResolvedProduct;
  evidence: ResolutionEvidence;
  createdAt: string;
  origin: ClickBankOrigin;
  provenance: ClickBankProvenance;
  metadata: ResolutionMetadata;
}

export interface ClickBankSnapshotInit {
  resolutionId: string;
  product: ResolvedProduct;
  evidence: ResolutionEvidence;
  createdAt: string;
  metadata?: ResolutionMetadata;
}

function copyMoney<T extends { amount: number; currency: string; text: string } | null>(value: T): T {
  if (value === null) return value;
  return { amount: value.amount, currency: value.currency, text: value.text } as T;
}

export function createClickBankSnapshot(init: ClickBankSnapshotInit): ClickBankSnapshot {
  const product = init.product;
  const evidence = init.evidence;
  return freezeDeepClickBank({
    resolutionId: init.resolutionId,
    product: {
      observedProductName: product.observedProductName,
      observedVendor: product.observedVendor,
      vendor: product.vendor,
      product: product.product,
      marketplaceUrl: product.marketplaceUrl,
      gravity: product.gravity,
      initialSale: copyMoney(product.initialSale),
      averageSale: copyMoney(product.averageSale),
      averageRebill: copyMoney(product.averageRebill),
      commissionType: product.commissionType,
      category: product.category,
      language: product.language,
      affiliateResources: [...product.affiliateResources],
      marketplaceMetadata: { ...product.marketplaceMetadata },
      origin: "RESOLVED" as const,
      provenance: "DIRECT_SOURCE" as const,
    },
    evidence: {
      matchedProductName: evidence.matchedProductName,
      matchedVendor: evidence.matchedVendor,
      matchMethod: evidence.matchMethod,
      matchConfidence: evidence.matchConfidence,
      marketplaceSource: evidence.marketplaceSource,
      evidenceMetadata: { ...evidence.evidenceMetadata },
      origin: "RESOLVED" as const,
      provenance: "DIRECT_SOURCE" as const,
    },
    createdAt: init.createdAt,
    origin: "RESOLVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
