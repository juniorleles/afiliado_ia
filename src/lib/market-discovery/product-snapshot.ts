/**
 * Host record domain: product identification snapshot.
 *
 * A frozen copy of the identities and the page evidence taken from landing
 * page snapshots. This module does not choose an order and does not reach an
 * outside system.
 */
import { freezeDeepProduct, type IdentificationEvidence, type ObservedProduct, type ProductIdentity, type ProductMetadata, type ProductOrigin, type ProductProvenance } from "./product-types";

export const PRODUCT_SNAPSHOT_KEYS = ["identificationId", "products", "identities", "evidence", "createdAt", "origin", "provenance", "metadata"] as const;

export interface ProductSnapshot {
  identificationId: string;
  products: readonly ObservedProduct[];
  identities: readonly ProductIdentity[];
  evidence: readonly IdentificationEvidence[];
  createdAt: string;
  origin: ProductOrigin;
  provenance: ProductProvenance;
  metadata: ProductMetadata;
}

export interface ProductSnapshotInit {
  identificationId: string;
  products: readonly ObservedProduct[];
  identities: readonly ProductIdentity[];
  evidence: readonly IdentificationEvidence[];
  createdAt: string;
  metadata?: ProductMetadata;
}

function copyEvidence(item: IdentificationEvidence): IdentificationEvidence {
  return {
    landingPageId: item.landingPageId,
    htmlTitle: item.htmlTitle,
    metaTitle: item.metaTitle,
    openGraphTitle: item.openGraphTitle,
    h1: item.h1,
    canonicalUrl: item.canonicalUrl,
    structuredData: item.structuredData,
    visibleProductName: item.visibleProductName,
    visibleBrand: item.visibleBrand,
    visibleCtas: [...item.visibleCtas],
    visiblePrice: item.visiblePrice,
    brandMentions: [...item.brandMentions],
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
  };
}

export function createProductSnapshot(init: ProductSnapshotInit): ProductSnapshot {
  return freezeDeepProduct({
    identificationId: init.identificationId,
    products: init.products.map((product) => ({
      identity: { ...product.identity },
      evidence: copyEvidence(product.evidence),
      metadata: { ...product.metadata },
      confidenceInputs: { ...product.confidenceInputs },
    })),
    identities: init.identities.map((item) => ({ ...item })),
    evidence: init.evidence.map((item) => copyEvidence(item)),
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: freezeDeepProduct({ ...(init.metadata ?? {}) }),
  });
}
