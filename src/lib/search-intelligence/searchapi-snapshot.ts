/**
 * Host record domain: SearchApi normalizer snapshot.
 *
 * A frozen copy of one normalization. The search snapshot, SERP records, and
 * sponsored results use the Market Discovery field order.
 */
import type { SearchSnapshot } from "../market-discovery/google-search-snapshot";
import type { SerpRecord } from "../market-discovery/serp-types";
import type { SponsoredResult } from "../market-discovery/sponsored-types";
import { copyPlainNormalizer, freezeDeepNormalizer, type FlatRecord, type NormalizerOrigin, type NormalizerProvenance, type NormalizerStatistics } from "./searchapi-types";

export interface NormalizerSnapshot {
  normalizationId: string;
  searchSnapshot: SearchSnapshot;
  serpRecords: readonly SerpRecord[];
  sponsoredResults: readonly SponsoredResult[];
  searchMetadata: FlatRecord;
  statistics: NormalizerStatistics;
  createdAt: string;
  origin: NormalizerOrigin;
  provenance: NormalizerProvenance;
  metadata: FlatRecord;
}

export function createNormalizerStatistics(init: NormalizerStatistics): NormalizerStatistics {
  return freezeDeepNormalizer({
    serpCount: init.serpCount,
    sponsoredCount: init.sponsoredCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

export function createNormalizerSnapshot(init: {
  normalizationId: string;
  searchSnapshot: SearchSnapshot;
  serpRecords: readonly SerpRecord[];
  sponsoredResults: readonly SponsoredResult[];
  searchMetadata: FlatRecord;
  statistics: NormalizerStatistics;
  createdAt: string;
  metadata: FlatRecord;
}): NormalizerSnapshot {
  return freezeDeepNormalizer({
    normalizationId: init.normalizationId,
    searchSnapshot: copyPlainNormalizer(init.searchSnapshot),
    serpRecords: copyPlainNormalizer(init.serpRecords),
    sponsoredResults: copyPlainNormalizer(init.sponsoredResults),
    searchMetadata: copyPlainNormalizer(init.searchMetadata),
    statistics: createNormalizerStatistics(init.statistics),
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: copyPlainNormalizer(init.metadata),
  });
}
