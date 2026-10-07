/**
 * Host record domain: google search snapshot.
 *
 * A frozen copy of one supplied search page. The markup is stored as text.
 * This module does not read that text and does not reach an outside system.
 */
import { freezeDeepSearch, type SearchDevice, type SearchMetadata, type SearchOrigin, type SearchProvenance } from "./google-search-types";

export const SEARCH_SNAPSHOT_KEYS = [
  "snapshotId",
  "query",
  "language",
  "country",
  "device",
  "market",
  "searchUrl",
  "html",
  "collectedAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface SearchSnapshot {
  snapshotId: string;
  query: string;
  language: string;
  country: string;
  device: SearchDevice;
  market: string;
  searchUrl: string;
  html: string;
  collectedAt: string;
  origin: SearchOrigin;
  provenance: SearchProvenance;
  metadata: SearchMetadata;
}

export interface SearchSnapshotInit {
  snapshotId: string;
  query: string;
  language: string;
  country: string;
  device: SearchDevice;
  market: string;
  searchUrl: string;
  html: string;
  collectedAt: string;
  metadata?: SearchMetadata;
}

export function createSearchSnapshot(init: SearchSnapshotInit): SearchSnapshot {
  return freezeDeepSearch({
    snapshotId: init.snapshotId,
    query: init.query,
    language: init.language,
    country: init.country,
    device: init.device,
    market: init.market,
    searchUrl: init.searchUrl,
    html: init.html,
    collectedAt: init.collectedAt,
    origin: "COLLECTED",
    provenance: "DIRECT_SOURCE",
    metadata: freezeDeepSearch({ ...(init.metadata ?? {}) }),
  });
}
