/**
 * Host record domain: read-only google search intelligence context.
 *
 * Interface only. The host is given ProductFacts, product name, vendor,
 * category, landing page, a search context, and flat metadata. It does not
 * fetch a page, does not change the input, and does not run another engine.
 */
import type { GoogleSearchMetadata } from "./google-search-evidence";

export const GOOGLE_SEARCH_CONTEXT_MEMBERS = [
  "productFacts",
  "productName",
  "vendor",
  "category",
  "landingPage",
  "searchContext",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/**
 * Duck-typed ProductFacts fields this host may restate. Nested marketplace
 * records are allowed. Only text identity fields are read.
 */
export interface GoogleSearchProductFacts {
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
export interface GoogleSearchContext {
  productFacts: GoogleSearchProductFacts | Record<string, unknown>;
  productName?: string;
  vendor?: string;
  category?: string;
  landingPage?: string;
  searchContext?: unknown;
  executionMetadata?: GoogleSearchMetadata;
  runtimeMetadata?: GoogleSearchMetadata;
  configuration?: GoogleSearchMetadata;
}
