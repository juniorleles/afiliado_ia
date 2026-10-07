/**
 * Host record domain: sponsored results snapshot.
 *
 * A frozen copy of the sponsored records taken from one SERP record list.
 * This module does not choose an order and does not reach an outside system.
 */
import { freezeDeepSponsored, type SponsoredMetadata, type SponsoredOrigin, type SponsoredProvenance, type SponsoredResult } from "./sponsored-types";

export const SPONSORED_SNAPSHOT_KEYS = ["sponsoredId", "sourceCount", "results", "createdAt", "origin", "provenance", "metadata"] as const;

export interface SponsoredSnapshot {
  sponsoredId: string;
  sourceCount: number;
  results: readonly SponsoredResult[];
  createdAt: string;
  origin: SponsoredOrigin;
  provenance: SponsoredProvenance;
  metadata: SponsoredMetadata;
}

export interface SponsoredSnapshotInit {
  sponsoredId: string;
  sourceCount: number;
  results: readonly SponsoredResult[];
  createdAt: string;
  metadata?: SponsoredMetadata;
}

export function createSponsoredSnapshot(init: SponsoredSnapshotInit): SponsoredSnapshot {
  return freezeDeepSponsored({
    sponsoredId: init.sponsoredId,
    sourceCount: init.sourceCount,
    results: init.results.map((item) => ({ ...item })),
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: freezeDeepSponsored({ ...(init.metadata ?? {}) }),
  });
}
