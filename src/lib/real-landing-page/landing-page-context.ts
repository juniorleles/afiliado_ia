/**
 * Host record domain: read-only real landing page context.
 *
 * Interface only. One collection is given sponsored destinations. It does
 * not name a product.
 */
import type { SponsoredResult } from "../market-discovery/sponsored-types";

export type RealLandingPageMetadata = Record<string, string | number | boolean | null>;

export const REAL_LANDING_PAGE_CONTEXT_MEMBERS = [
  "sponsoredResults",
  "maxPages",
  "maxRequests",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/**
 * Read-only bundle one landing page collection may be given.
 * Nothing here is written back.
 */
export interface RealLandingPageContext {
  sponsoredResults?: readonly SponsoredResult[];
  maxPages?: number;
  maxRequests?: number;
  executionMetadata?: RealLandingPageMetadata;
  runtimeMetadata?: RealLandingPageMetadata;
  configuration?: RealLandingPageMetadata;
}
