/**
 * Host record domain: read-only product opportunity context.
 *
 * Interface only. The host is given a Product Intelligence Report, an
 * evidence graph, ProductFacts, optional evidence records, and flat
 * metadata. It does not fetch a page, does not change the input, and does
 * not run another engine.
 */
import type { ProductOpportunityMetadata } from "./product-opportunity-snapshot";

export const PRODUCT_OPPORTUNITY_CONTEXT_MEMBERS = [
  "productIntelligenceReport",
  "evidenceGraph",
  "productFacts",
  "landingPageEvidence",
  "searchEvidence",
  "competitionEvidence",
  "commercialEvidence",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

export const PRODUCT_OPPORTUNITY_GRAPH_KINDS = [
  "ProductFacts",
  "LandingPageEvidence",
  "SearchEvidence",
  "CompetitionEvidence",
  "CommercialEvidence",
] as const;

export const PRODUCT_OPPORTUNITY_GRAPH_FIELDS = {
  ProductFacts: "productFacts",
  LandingPageEvidence: "landingPageEvidence",
  SearchEvidence: "searchEvidence",
  CompetitionEvidence: "competitionEvidence",
  CommercialEvidence: "commercialEvidence",
} as const;

/**
 * Read-only bundle one mapping may be given. Nothing here is written back to
 * another engine.
 */
export interface ProductOpportunityContext {
  productIntelligenceReport?: Record<string, unknown>;
  evidenceGraph: Record<string, unknown>;
  productFacts: Record<string, unknown>;
  landingPageEvidence?: Record<string, unknown>;
  searchEvidence?: Record<string, unknown>;
  competitionEvidence?: Record<string, unknown>;
  commercialEvidence?: Record<string, unknown>;
  executionMetadata?: ProductOpportunityMetadata;
  runtimeMetadata?: ProductOpportunityMetadata;
  configuration?: ProductOpportunityMetadata;
}
