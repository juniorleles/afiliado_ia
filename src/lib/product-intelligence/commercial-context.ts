/**
 * Host record domain: read-only commercial intelligence context.
 *
 * Interface only. The host is given ProductFacts, optional landing page
 * evidence, optional SearchEvidence, CompetitionEvidence, and flat metadata.
 * It does not fetch a page, does not change the input, and does not run
 * another engine.
 */
import type { CommercialMetadata } from "./commercial-evidence";

export const COMMERCIAL_CONTEXT_MEMBERS = [
  "productFacts",
  "landingPageEvidence",
  "searchEvidence",
  "competitionEvidence",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/**
 * Duck-typed ProductFacts fields this host may restate. Nested marketplace
 * records are allowed. Only identity and operational text fields are read.
 */
export interface CommercialProductFacts {
  productName?: string;
  name?: string;
  vendor?: string;
  category?: string;
  landingPage?: string;
  affiliatePage?: string;
  commissionType?: string;
  refundPolicy?: string;
  supportUrl?: string;
  language?: string;
  affiliateResources?: readonly string[];
}

/**
 * Read-only bundle one analysis may be given. Nothing here is written back to
 * another engine.
 */
export interface CommercialContext {
  productFacts: CommercialProductFacts | Record<string, unknown>;
  landingPageEvidence?: Record<string, unknown>;
  searchEvidence?: Record<string, unknown>;
  competitionEvidence: Record<string, unknown>;
  executionMetadata?: CommercialMetadata;
  runtimeMetadata?: CommercialMetadata;
  configuration?: CommercialMetadata;
}
