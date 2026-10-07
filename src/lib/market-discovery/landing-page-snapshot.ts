/**
 * Host record domain: landing page snapshot.
 *
 * A frozen copy of one supplied destination page. The markup is stored as
 * text. This module does not read that text and does not reach an outside
 * system.
 */
import { freezeDeepLandingPage, type LandingPageMetadata, type LandingPageOrigin, type LandingPageProvenance } from "./landing-page-types";

export const LANDING_PAGE_SNAPSHOT_KEYS = [
  "landingPageId",
  "destinationUrl",
  "finalUrl",
  "httpStatus",
  "headers",
  "html",
  "retrievedAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface LandingPageSnapshot {
  landingPageId: string;
  destinationUrl: string;
  finalUrl: string;
  httpStatus: number;
  headers: LandingPageMetadata;
  html: string;
  retrievedAt: string;
  origin: LandingPageOrigin;
  provenance: LandingPageProvenance;
  metadata: LandingPageMetadata;
}

export interface LandingPageSnapshotInit {
  landingPageId: string;
  destinationUrl: string;
  finalUrl: string;
  httpStatus: number;
  headers: LandingPageMetadata;
  html: string;
  retrievedAt: string;
  metadata?: LandingPageMetadata;
}

export const LANDING_PAGE_COLLECTION_KEYS = ["collectionId", "pageCount", "pages", "createdAt", "origin", "provenance", "metadata"] as const;

export interface LandingPageCollection {
  collectionId: string;
  pageCount: number;
  pages: readonly LandingPageSnapshot[];
  createdAt: string;
  origin: LandingPageOrigin;
  provenance: LandingPageProvenance;
  metadata: LandingPageMetadata;
}

export interface LandingPageCollectionInit {
  collectionId: string;
  pages: readonly LandingPageSnapshot[];
  createdAt: string;
  metadata?: LandingPageMetadata;
}

export function createLandingPageSnapshot(init: LandingPageSnapshotInit): LandingPageSnapshot {
  return freezeDeepLandingPage({
    landingPageId: init.landingPageId,
    destinationUrl: init.destinationUrl,
    finalUrl: init.finalUrl,
    httpStatus: init.httpStatus,
    headers: freezeDeepLandingPage({ ...init.headers }),
    html: init.html,
    retrievedAt: init.retrievedAt,
    origin: "COLLECTED",
    provenance: "DIRECT_SOURCE",
    metadata: freezeDeepLandingPage({ ...(init.metadata ?? {}) }),
  });
}

export function createLandingPageCollection(init: LandingPageCollectionInit): LandingPageCollection {
  return freezeDeepLandingPage({
    collectionId: init.collectionId,
    pageCount: init.pages.length,
    pages: init.pages.map((page) => ({ ...page, headers: { ...page.headers }, metadata: { ...page.metadata } })),
    createdAt: init.createdAt,
    origin: "COLLECTED",
    provenance: "DIRECT_SOURCE",
    metadata: freezeDeepLandingPage({ ...(init.metadata ?? {}) }),
  });
}
