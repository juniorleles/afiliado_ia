/**
 * Host record domain: SearchApi provider snapshot.
 *
 * A frozen copy of one retrieval. The JSON body is stored as it arrived.
 * This module does not read listings inside that body.
 */
import { copyPlainSearchApi, freezeDeepSearchApi, SEARCHAPI_PROVIDER_NAME, type SearchApiDevice, type SearchApiMetadata, type SearchApiSnapshot, type SearchApiStatistics } from "./searchapi-types";

export function createSearchApiStatistics(init: SearchApiStatistics): SearchApiStatistics {
  return freezeDeepSearchApi({
    requestCount: init.requestCount,
    payloadBytes: init.payloadBytes,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

export function createSearchApiSnapshot(init: {
  snapshotId: string;
  keyword: string;
  country: string;
  language: string;
  device: SearchApiDevice;
  searchOptions: Record<string, string>;
  raw: Record<string, unknown>;
  collectedAt: string;
  metadata: SearchApiMetadata;
}): SearchApiSnapshot {
  return freezeDeepSearchApi({
    snapshotId: init.snapshotId,
    provider: SEARCHAPI_PROVIDER_NAME,
    keyword: init.keyword,
    country: init.country,
    language: init.language,
    device: init.device,
    searchOptions: { ...init.searchOptions },
    raw: copyPlainSearchApi(init.raw),
    collectedAt: init.collectedAt,
    origin: "COLLECTED",
    provenance: "DIRECT_SOURCE",
    metadata: copyPlainSearchApi(init.metadata),
  });
}
