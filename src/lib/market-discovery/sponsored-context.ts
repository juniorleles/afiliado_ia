/**
 * Host record domain: read-only sponsored detector context.
 *
 * Interface only. The host is given SERP records and flat metadata.
 * It does not request a page.
 */
import type { SerpRecord } from "./serp-types";
import type { SponsoredMetadata } from "./sponsored-types";

export const SPONSORED_CONTEXT_MEMBERS = ["serpRecords", "executionMetadata", "runtimeMetadata", "configuration"] as const;

/**
 * Read-only bundle one pass may be given. Nothing here is written back.
 */
export interface SponsoredContext {
  serpRecords: readonly SerpRecord[];
  executionMetadata?: SponsoredMetadata;
  runtimeMetadata?: SponsoredMetadata;
  configuration?: SponsoredMetadata;
}
