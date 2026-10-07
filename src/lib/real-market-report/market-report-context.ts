/**
 * Host record domain: read-only real market report context.
 *
 * Interface only. One report is given search, SERP, sponsored, landing page,
 * and observed product artifacts. It does not request a page.
 */
export type RealMarketReportMetadata = Record<string, string | number | boolean | null>;

export const REAL_MARKET_REPORT_CONTEXT_MEMBERS = [
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
 * Read-only bundle one real market report may be given.
 * Nothing here is written back.
 */
export interface RealMarketReportContext {
  searchSnapshot?: unknown;
  serpRecords?: readonly unknown[];
  sponsoredResults?: readonly unknown[];
  landingPageSnapshots?: readonly unknown[];
  observedProducts?: readonly unknown[];
  executionMetadata?: RealMarketReportMetadata;
  runtimeMetadata?: RealMarketReportMetadata;
  configuration?: RealMarketReportMetadata;
}
