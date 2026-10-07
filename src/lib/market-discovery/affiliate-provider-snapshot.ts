/**
 * Host record domain: affiliate network resolution snapshot.
 *
 * A frozen copy of the products and match evidence returned by provider
 * adapters. Provider order is the order that was requested. This module does
 * not reach an outside system.
 */
import {
  freezeDeepAffiliate,
  type AffiliateOrigin,
  type AffiliateProvenance,
  type ResolutionEvidence,
  type ResolutionMetadata,
  type ResolvedAffiliateProduct,
} from "./affiliate-provider-types";

export const AFFILIATE_SNAPSHOT_KEYS = ["resolutionId", "products", "evidence", "marketReportId", "createdAt", "origin", "provenance", "metadata"] as const;

export interface AffiliateSnapshot {
  resolutionId: string;
  products: readonly ResolvedAffiliateProduct[];
  evidence: readonly ResolutionEvidence[];
  marketReportId: string | null;
  createdAt: string;
  origin: AffiliateOrigin;
  provenance: AffiliateProvenance;
  metadata: ResolutionMetadata;
}

export interface AffiliateSnapshotInit {
  resolutionId: string;
  products: readonly ResolvedAffiliateProduct[];
  evidence: readonly ResolutionEvidence[];
  marketReportId: string | null;
  createdAt: string;
  metadata?: ResolutionMetadata;
}

function copyProduct(product: ResolvedAffiliateProduct): ResolvedAffiliateProduct {
  return {
    observedProductName: product.observedProductName,
    observedVendor: product.observedVendor,
    network: product.network,
    vendor: product.vendor,
    productName: product.productName,
    category: product.category,
    affiliateUrl: product.affiliateUrl,
    commission: product.commission,
    gravity: product.gravity,
    marketplaceMetadata: { ...product.marketplaceMetadata },
    affiliateResources: [...product.affiliateResources],
    origin: "RESOLVED",
    provenance: "DIRECT_SOURCE",
  };
}

function copyEvidence(evidence: ResolutionEvidence): ResolutionEvidence {
  return {
    network: evidence.network,
    matchedProductName: evidence.matchedProductName,
    matchedVendor: evidence.matchedVendor,
    matchMethod: evidence.matchMethod,
    marketplaceSource: evidence.marketplaceSource,
    evidenceMetadata: { ...evidence.evidenceMetadata },
    origin: "RESOLVED",
    provenance: "DIRECT_SOURCE",
  };
}

export function createAffiliateSnapshot(init: AffiliateSnapshotInit): AffiliateSnapshot {
  return freezeDeepAffiliate({
    resolutionId: init.resolutionId,
    products: init.products.map((product) => copyProduct(product)),
    evidence: init.evidence.map((item) => copyEvidence(item)),
    marketReportId: init.marketReportId,
    createdAt: init.createdAt,
    origin: "RESOLVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
