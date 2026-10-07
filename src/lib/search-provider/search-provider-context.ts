/**
 * Host record domain: read-only search provider context.
 *
 * Interface only. The host is given a provider name, a keyword, locale,
 * supplied page text, and flat metadata. It does not request a page.
 */
import type { SearchMetadata } from "./search-provider-types";

export const SEARCH_PROVIDER_CONTEXT_MEMBERS = [
  "provider",
  "keyword",
  "language",
  "country",
  "device",
  "market",
  "searchHtml",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/**
 * Read-only bundle one search may be given. Nothing here is written back.
 */
export interface SearchProviderContext {
  provider?: string;
  keyword?: string;
  language?: string;
  country?: string;
  device?: string;
  market?: string;
  searchHtml?: string;
  executionMetadata?: SearchMetadata;
  runtimeMetadata?: SearchMetadata;
  configuration?: SearchMetadata;
}
