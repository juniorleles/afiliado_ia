/**
 * Host record domain: read-only competition intelligence context.
 *
 * Interface only. The host is given ProductFacts, optional landing page
 * evidence, SearchEvidence, and flat metadata. It does not fetch a page,
 * does not change the input, and does not run another engine.
 */
import type { CompetitionMetadata } from "./competition-evidence";

export const COMPETITION_CONTEXT_MEMBERS = [
  "productFacts",
  "landingPageEvidence",
  "searchEvidence",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/**
 * Duck-typed ProductFacts fields this host may restate. Nested marketplace
 * records are allowed. Only text identity fields are read.
 */
export interface CompetitionProductFacts {
  productName?: string;
  name?: string;
  vendor?: string;
  category?: string;
  landingPage?: string;
  affiliatePage?: string;
}

/**
 * Read-only bundle one analysis may be given. Nothing here is written back to
 * another engine.
 */
export interface CompetitionContext {
  productFacts: CompetitionProductFacts | Record<string, unknown>;
  landingPageEvidence?: Record<string, unknown>;
  searchEvidence: Record<string, unknown>;
  executionMetadata?: CompetitionMetadata;
  runtimeMetadata?: CompetitionMetadata;
  configuration?: CompetitionMetadata;
}
