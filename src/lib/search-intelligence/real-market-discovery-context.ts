/**
 * Host record domain: read-only real market discovery context.
 *
 * Interface only. One walk is given a keyword, locale, device, and any
 * supplied destination pages. It does not request a page.
 */
import type { LandingPageResponse } from "../market-discovery/landing-page-context";

export type RealMarketDiscoveryMetadata = Record<string, string | number | boolean | null>;

export const REAL_MARKET_DISCOVERY_CONTEXT_MEMBERS = [
  "keyword",
  "country",
  "language",
  "device",
  "market",
  "pages",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/**
 * Read-only bundle one real market discovery walk may be given.
 * Nothing here is written back.
 */
export interface RealMarketDiscoveryContext {
  keyword?: string;
  country?: string;
  language?: string;
  device?: string;
  market?: string;
  pages?: readonly LandingPageResponse[];
  executionMetadata?: RealMarketDiscoveryMetadata;
  runtimeMetadata?: RealMarketDiscoveryMetadata;
  configuration?: RealMarketDiscoveryMetadata;
}
