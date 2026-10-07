/**
 * Host record domain: read-only SERP parser context.
 *
 * Interface only. The host is given one search snapshot and flat metadata.
 * It does not request a page.
 */
import type { SearchSnapshot } from "./google-search-snapshot";
import type { SerpMetadata } from "./serp-types";

export const SERP_CONTEXT_MEMBERS = ["searchSnapshot", "executionMetadata", "runtimeMetadata", "configuration"] as const;

/**
 * Read-only bundle one parse may be given. Nothing here is written back.
 */
export interface SerpContext {
  searchSnapshot: SearchSnapshot;
  executionMetadata?: SerpMetadata;
  runtimeMetadata?: SerpMetadata;
  configuration?: SerpMetadata;
}
