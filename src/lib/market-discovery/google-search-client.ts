/**
 * Host record domain: google search client.
 *
 * Builds the normalized search address from a keyword, language, country,
 * and device, and copies the supplied page text. It does not request a page
 * and it does not read the markup.
 */
import type { SearchContext } from "./google-search-context";
import type { SearchDevice } from "./google-search-types";

export const SEARCH_ENDPOINT = "https://www.google.com/search";

export interface SearchDraft {
  query: string;
  language: string;
  country: string;
  device: SearchDevice;
  market: string;
  searchUrl: string;
  html: string;
  collectedAt: string;
}

export interface GoogleSearchClient {
  collect(input: SearchContext, collectedAt: string): SearchDraft;
}

export function searchUrlOf(query: string, language: string, country: string, device: SearchDevice): string {
  const params = new URLSearchParams({
    q: query,
    hl: language,
    gl: country.toLowerCase(),
    device,
  });
  return `${SEARCH_ENDPOINT}?${params.toString()}`;
}

export function createGoogleSearchClient(): GoogleSearchClient {
  return {
    collect(input, collectedAt) {
      const query = input.keyword.trim();
      return {
        query,
        language: input.language,
        country: input.country,
        device: input.device,
        market: input.market,
        searchUrl: searchUrlOf(query, input.language, input.country, input.device),
        html: input.searchHtml,
        collectedAt,
      };
    },
  };
}
