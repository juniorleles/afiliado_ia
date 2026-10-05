/**
 * Host record domain: product opportunity mapping snapshot.
 *
 * Frozen discovery, opportunity, and evidence-provider contexts plus the
 * evidence mapping and snapshot. Presence tokens are restated observations.
 * They are not a judgment of a product. This module does not fetch a page
 * and does not run another engine.
 */
import type { DiscoveryCandidate } from "../discovery/discovery-types";
import type { SignalContext } from "../opportunity/opportunity-signal-context";
import type { EvidenceContext } from "../opportunity/providers/evidence-provider-context";

export type ProductOpportunityMetadata = Record<string, string | number | boolean | null>;

export const PRODUCT_OPPORTUNITY_STATUSES = ["OK", "REJECTED"] as const;
export type ProductOpportunityStatus = (typeof PRODUCT_OPPORTUNITY_STATUSES)[number];

export const PRODUCT_OPPORTUNITY_ORIGINS = ["OBSERVED"] as const;
export type ProductOpportunityOrigin = (typeof PRODUCT_OPPORTUNITY_ORIGINS)[number];

export const PRODUCT_OPPORTUNITY_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type ProductOpportunityProvenance = (typeof PRODUCT_OPPORTUNITY_PROVENANCE)[number];

export interface ProductOpportunityIssue {
  field: string;
  message: string;
}

export const PRODUCT_OPPORTUNITY_STAGES = [
  "ProductIntelligence",
  "DiscoveryContext",
  "OpportunityContext",
  "EvidenceProvider",
  "SignalPipeline",
] as const;

export const PRODUCT_OPPORTUNITY_MAPPING_ENTRY_KEYS = ["from", "to", "text"] as const;

export interface ProductOpportunityMappingEntry {
  from: string;
  to: string;
  text: string;
}

export const PRODUCT_OPPORTUNITY_EVIDENCE_MAPPING_KEYS = ["stages", "entries", "origin", "provenance"] as const;

export interface ProductOpportunityEvidenceMapping {
  stages: readonly (typeof PRODUCT_OPPORTUNITY_STAGES)[number][];
  entries: readonly ProductOpportunityMappingEntry[];
  origin: ProductOpportunityOrigin;
  provenance: ProductOpportunityProvenance;
}

export type DiscoveryReadyContext = DiscoveryCandidate;
export type OpportunityReadyContext = SignalContext;
export type EvidenceProviderReadyContext = EvidenceContext;

export const PRODUCT_OPPORTUNITY_SNAPSHOT_KEYS = [
  "mappingId",
  "productName",
  "landingPage",
  "createdAt",
  "metadata",
] as const;

export interface ProductOpportunitySnapshot {
  mappingId: string;
  productName: string;
  landingPage: string;
  createdAt: string;
  metadata: ProductOpportunityMetadata;
}

export interface ProductOpportunitySnapshotInit {
  mappingId: string;
  productName: string;
  landingPage: string;
  createdAt: string;
  metadata?: ProductOpportunityMetadata;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepProductOpportunity<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepProductOpportunity(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainProductOpportunity<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainProductOpportunity(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainProductOpportunity(inner)])) as T;
  }
  return value;
}

export function createProductOpportunitySnapshot(init: ProductOpportunitySnapshotInit): ProductOpportunitySnapshot {
  return freezeDeepProductOpportunity({
    mappingId: init.mappingId,
    productName: init.productName,
    landingPage: init.landingPage,
    createdAt: init.createdAt,
    metadata: copyPlainProductOpportunity(init.metadata ?? {}),
  });
}

export function createEvidenceMapping(
  entries: readonly ProductOpportunityMappingEntry[],
): ProductOpportunityEvidenceMapping {
  return freezeDeepProductOpportunity({
    stages: [...PRODUCT_OPPORTUNITY_STAGES],
    entries: entries.map((entry) => ({ from: entry.from, to: entry.to, text: entry.text })),
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
  });
}
