/**
 * Host record domain: read-only market intelligence report context.
 *
 * Interface only. The host is given market artifacts and flat metadata.
 * It does not request a page.
 */
import type { SearchSnapshot } from "./google-search-snapshot";
import type { LandingPageSnapshot } from "./landing-page-snapshot";
import type { MarketReportMetadata } from "./market-report-types";
import type { ObservedProduct, ProductIdentity } from "./product-types";
import type { SerpRecord } from "./serp-types";
import type { SponsoredResult } from "./sponsored-types";

export const MARKET_REPORT_CONTEXT_MEMBERS = [
  "searchSnapshot",
  "serpRecords",
  "sponsoredResults",
  "landingPageSnapshots",
  "observedProducts",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/**
 * Read-only bundle one report may be given. Nothing here is written back.
 */
export interface MarketReportContext {
  searchSnapshot?: SearchSnapshot;
  serpRecords?: readonly SerpRecord[];
  sponsoredResults?: readonly SponsoredResult[];
  landingPageSnapshots?: readonly LandingPageSnapshot[];
  observedProducts?: readonly (ProductIdentity | ObservedProduct)[];
  executionMetadata?: MarketReportMetadata;
  runtimeMetadata?: MarketReportMetadata;
  configuration?: MarketReportMetadata;
}
