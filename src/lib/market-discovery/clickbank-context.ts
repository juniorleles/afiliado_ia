/**
 * Host record domain: read-only marketplace resolution context.
 *
 * Interface only. The host is given an observed product and supplied listing
 * records. It does not request a listing.
 */
import type { ObservedProduct, ResolutionMetadata } from "./clickbank-types";

export const CLICKBANK_CONTEXT_MEMBERS = ["observedProduct", "marketplaceRecords", "marketplaceSource", "executionMetadata", "runtimeMetadata", "configuration"] as const;

/**
 * Read-only bundle one resolution may be given. Nothing here is written back.
 */
export interface ClickBankContext {
  observedProduct?: ObservedProduct;
  marketplaceRecords?: readonly unknown[];
  marketplaceSource?: string;
  executionMetadata?: ResolutionMetadata;
  runtimeMetadata?: ResolutionMetadata;
  configuration?: ResolutionMetadata;
}
