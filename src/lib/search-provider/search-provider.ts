/**
 * Host record domain: search provider contract.
 *
 * Every provider exposes the same search method. The registry selects one
 * by name. This module does not reach an outside system.
 */
import type { SearchResponse } from "./search-provider-types";

export interface SearchProvider {
  readonly provider: string;
  search(input: unknown): SearchResponse;
}
