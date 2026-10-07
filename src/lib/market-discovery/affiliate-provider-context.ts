/**
 * Host record domain: read-only affiliate resolution context.
 *
 * Interface only. The host is given an observed product, an optional market
 * report, provider names, and supplied catalogs. It does not request a listing.
 */
import type { ObservedProduct, ResolutionMetadata } from "./affiliate-provider-types";

export const AFFILIATE_CONTEXT_MEMBERS = ["observedProduct", "marketReport", "providers", "catalogs", "executionMetadata", "runtimeMetadata", "configuration"] as const;

/**
 * Read-only bundle one resolution may be given. Nothing here is written back.
 */
export interface AffiliateContext {
  observedProduct?: ObservedProduct;
  marketReport?: Record<string, unknown> | null;
  providers?: readonly string[];
  catalogs?: Record<string, readonly unknown[]>;
  executionMetadata?: ResolutionMetadata;
  runtimeMetadata?: ResolutionMetadata;
  configuration?: ResolutionMetadata;
}
