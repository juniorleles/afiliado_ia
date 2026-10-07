/**
 * Host record domain: read-only google search connector context.
 *
 * Interface only. The host is given a keyword, language, country, device,
 * market, the supplied page text, and flat metadata. It does not request a
 * page and it does not read the markup.
 */
import type { SearchDevice, SearchMetadata } from "./google-search-types";

export const SEARCH_CONTEXT_MEMBERS = [
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
 * Read-only bundle one collection may be given. Nothing here is written back.
 */
export interface SearchContext {
  keyword: string;
  language: string;
  country: string;
  device: SearchDevice;
  market: string;
  searchHtml: string;
  executionMetadata?: SearchMetadata;
  runtimeMetadata?: SearchMetadata;
  configuration?: SearchMetadata;
}
