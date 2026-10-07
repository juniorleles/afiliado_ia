/**
 * Host record domain: search provider records.
 *
 * Names the request, response, and snapshot every search provider restates.
 * A page is copied from the caller. This module does not reach an outside
 * system.
 */
export type SearchMetadata = Record<string, string | number | boolean | null>;

export const SEARCH_PROVIDER_STATUSES = ["OK", "REJECTED"] as const;
export type SearchProviderStatus = (typeof SEARCH_PROVIDER_STATUSES)[number];

export const SEARCH_SNAPSHOT_ORIGINS = ["COLLECTED"] as const;
export type SearchSnapshotOrigin = (typeof SEARCH_SNAPSHOT_ORIGINS)[number];

export const SEARCH_PROVIDER_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type SearchProviderProvenance = (typeof SEARCH_PROVIDER_PROVENANCE)[number];

export const PROVIDER_CONFIGURATION_ORIGINS = ["REGISTERED"] as const;
export type ProviderConfigurationOrigin = (typeof PROVIDER_CONFIGURATION_ORIGINS)[number];

export const SEARCH_PROVIDER_DEVICES = ["desktop", "mobile", "tablet"] as const;
export type SearchProviderDevice = (typeof SEARCH_PROVIDER_DEVICES)[number];

export interface SearchIssue {
  field: string;
  message: string;
}

export const SEARCH_REQUEST_KEYS = ["provider", "keyword", "language", "country", "device", "market", "searchHtml"] as const;

export interface SearchRequest {
  provider: string;
  keyword: string;
  language: string;
  country: string;
  device: SearchProviderDevice;
  market: string;
  searchHtml: string;
  executionMetadata?: SearchMetadata;
  runtimeMetadata?: SearchMetadata;
  configuration?: SearchMetadata;
}

export const SEARCH_SNAPSHOT_KEYS = [
  "snapshotId",
  "provider",
  "query",
  "language",
  "country",
  "device",
  "market",
  "html",
  "collectedAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface SearchSnapshot {
  snapshotId: string;
  provider: string;
  query: string;
  language: string;
  country: string;
  device: SearchProviderDevice;
  market: string;
  html: string;
  collectedAt: string;
  origin: SearchSnapshotOrigin;
  provenance: SearchProviderProvenance;
  metadata: SearchMetadata;
}

export const SEARCH_RESPONSE_KEYS = ["status", "issues", "snapshot", "metadata", "executionTime"] as const;

export interface SearchResponse {
  status: SearchProviderStatus;
  issues: readonly SearchIssue[];
  snapshot: SearchSnapshot | null;
  metadata: SearchMetadata;
  executionTime: number;
}

export const PROVIDER_CONFIGURATION_KEYS = ["providers", "origin", "provenance"] as const;

export interface ProviderConfiguration {
  providers: readonly string[];
  origin: ProviderConfigurationOrigin;
  provenance: SearchProviderProvenance;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepSearchProvider<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepSearchProvider(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainSearchProvider<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainSearchProvider(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainSearchProvider(inner)])) as T;
  }
  return value;
}
