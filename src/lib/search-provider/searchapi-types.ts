/**
 * Host record domain: SearchApi provider records.
 *
 * Names the request, the raw JSON body, and the statistics one retrieval
 * may store. The body is copied. It is not reshaped.
 */
export type SearchApiMetadata = Record<string, string | number | boolean | null>;

export const SEARCHAPI_PROVIDER_NAME = "SEARCHAPI";

export const SEARCHAPI_STATUSES = ["OK", "REJECTED"] as const;
export type SearchApiStatus = (typeof SEARCHAPI_STATUSES)[number];

export const SEARCHAPI_ORIGINS = ["COLLECTED"] as const;
export type SearchApiOrigin = (typeof SEARCHAPI_ORIGINS)[number];

export const SEARCHAPI_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type SearchApiProvenance = (typeof SEARCHAPI_PROVENANCE)[number];

export const SEARCHAPI_DEVICES = ["desktop", "mobile", "tablet"] as const;
export type SearchApiDevice = (typeof SEARCHAPI_DEVICES)[number];

export interface SearchApiIssue {
  field: string;
  message: string;
}

export const SEARCHAPI_STATISTICS_KEYS = ["requestCount", "payloadBytes", "issueCount", "executionTime"] as const;

export interface SearchApiStatistics {
  requestCount: number;
  payloadBytes: number;
  issueCount: number;
  executionTime: number;
}

export const SEARCHAPI_SNAPSHOT_KEYS = [
  "snapshotId",
  "provider",
  "keyword",
  "country",
  "language",
  "device",
  "searchOptions",
  "raw",
  "collectedAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface SearchApiSnapshot {
  snapshotId: string;
  provider: typeof SEARCHAPI_PROVIDER_NAME;
  keyword: string;
  country: string;
  language: string;
  device: SearchApiDevice;
  searchOptions: Readonly<Record<string, string>>;
  raw: Readonly<Record<string, unknown>>;
  collectedAt: string;
  origin: SearchApiOrigin;
  provenance: SearchApiProvenance;
  metadata: SearchApiMetadata;
}

export const PROVIDER_RESPONSE_KEYS = ["status", "issues", "snapshot", "metadata", "statistics"] as const;

export interface ProviderResponse {
  status: SearchApiStatus;
  issues: readonly SearchApiIssue[];
  snapshot: SearchApiSnapshot | null;
  metadata: SearchApiMetadata;
  statistics: SearchApiStatistics;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepSearchApi<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepSearchApi(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainSearchApi<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainSearchApi(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainSearchApi(inner)])) as T;
  }
  return value;
}
