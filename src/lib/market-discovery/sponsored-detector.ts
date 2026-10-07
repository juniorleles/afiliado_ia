/**
 * Host record domain: sponsored record selector.
 *
 * Keeps SERP records whose sponsored marker is already present, in the order
 * they were given. A missing marker stays out. This module does not read
 * titles for a label and does not choose an order.
 */
import type { SerpRecord } from "./serp-types";
import type { SponsoredResult } from "./sponsored-types";

export interface SponsoredDetector {
  select(records: readonly SerpRecord[]): SponsoredResult[];
}

export function createSponsoredDetector(): SponsoredDetector {
  return {
    select(records) {
      const selected: SponsoredResult[] = [];
      for (const record of records) {
        if (typeof record.sponsoredMarker !== "string") continue;
        selected.push({
          title: record.title,
          url: record.url,
          description: record.description,
          position: record.position,
          sponsoredMarker: record.sponsoredMarker,
          resultMetadata: record.resultMetadata,
          origin: "OBSERVED",
          provenance: "DIRECT_SOURCE",
        });
      }
      return selected;
    },
  };
}
