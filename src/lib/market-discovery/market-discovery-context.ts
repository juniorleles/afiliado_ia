/**
 * Host record domain: read-only market discovery pipeline context.
 *
 * Interface only. The host is given a keyword, locale, supplied page text,
 * supplied destination responses, and flat metadata. It does not request a
 * page.
 */
import type { LandingPageResponse } from "./landing-page-context";

export type MarketDiscoveryMetadata = Record<string, string | number | boolean | null>;

export const MARKET_DISCOVERY_CONTEXT_MEMBERS = [
  "keyword",
  "language",
  "country",
  "device",
  "market",
  "searchHtml",
  "pages",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/**
 * Read-only bundle one pipeline run may be given. Nothing here is written back.
 */
export interface MarketDiscoveryContext {
  keyword?: string;
  language?: string;
  country?: string;
  device?: string;
  market?: string;
  searchHtml?: string;
  pages?: readonly LandingPageResponse[];
  executionMetadata?: MarketDiscoveryMetadata;
  runtimeMetadata?: MarketDiscoveryMetadata;
  configuration?: MarketDiscoveryMetadata;
}
