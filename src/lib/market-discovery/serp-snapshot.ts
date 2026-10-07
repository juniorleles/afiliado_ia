/**
 * Host record domain: SERP snapshot.
 *
 * A frozen copy of the structural records taken from one search snapshot.
 * This module does not read markup and does not reach an outside system.
 */
import { freezeDeepSerp, type SerpMetadata, type SerpOrigin, type SerpProvenance, type SerpRecord } from "./serp-types";

export const SERP_SNAPSHOT_KEYS = ["serpId", "searchSnapshotId", "query", "records", "createdAt", "origin", "provenance", "metadata"] as const;

export interface SerpSnapshot {
  serpId: string;
  searchSnapshotId: string;
  query: string;
  records: readonly SerpRecord[];
  createdAt: string;
  origin: SerpOrigin;
  provenance: SerpProvenance;
  metadata: SerpMetadata;
}

export interface SerpSnapshotInit {
  serpId: string;
  searchSnapshotId: string;
  query: string;
  records: readonly SerpRecord[];
  createdAt: string;
  metadata?: SerpMetadata;
}

export function createSerpSnapshot(init: SerpSnapshotInit): SerpSnapshot {
  return freezeDeepSerp({
    serpId: init.serpId,
    searchSnapshotId: init.searchSnapshotId,
    query: init.query,
    records: init.records.map((record) => ({ ...record })),
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: freezeDeepSerp({ ...(init.metadata ?? {}) }),
  });
}
