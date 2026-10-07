/**
 * Host record domain: landing page collector.
 *
 * Turns read-only sponsored results and supplied destination responses into
 * frozen landing page snapshots, metadata, and statistics. It copies each
 * page and keeps the last address of a supplied redirect chain. It does not
 * read the markup, does not name a listing, and does not reach an outside
 * system. A refused input returns REJECTED with issues and
 * no snapshot. This method never throws.
 */
import { createLandingPageClient, type LandingPageClient } from "./landing-page-client";
import type { LandingPageResponse } from "./landing-page-context";
import { createLandingPageCollection, createLandingPageSnapshot, type LandingPageCollection, type LandingPageSnapshot } from "./landing-page-snapshot";
import { copyPlainLandingPage, createLandingPageStatistics, freezeDeepLandingPage, type LandingPageIssue, type LandingPageMetadata, type LandingPageStatistics } from "./landing-page-types";
import { createLandingPageValidator, type LandingPageValidator } from "./landing-page-validator";
import type { SponsoredResult } from "./sponsored-types";

export type LandingPageClock = () => number;
export type LandingPageTimestamp = () => string;
export type LandingPageIdFactory = () => string;

export interface LandingPageCollectorResult {
  status: "OK" | "REJECTED";
  issues: LandingPageIssue[];
  snapshot: LandingPageCollection | null;
  pages: readonly LandingPageSnapshot[] | null;
  metadata: LandingPageMetadata;
  statistics: LandingPageStatistics;
  executionTime: number;
}

export interface LandingPageCollector {
  readonly client: LandingPageClient;
  readonly validator: LandingPageValidator;
  collect(input: unknown): LandingPageCollectorResult;
  getSnapshot(collectionId: string): LandingPageCollection | null;
}

export interface LandingPageCollectorOptions {
  client?: LandingPageClient;
  validator?: LandingPageValidator;
  now?: LandingPageClock;
  timestamp?: LandingPageTimestamp;
  idFactory?: LandingPageIdFactory;
}

const defaultClock: LandingPageClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refused(issues: LandingPageIssue[], metadata: LandingPageMetadata, executionTime = 0): LandingPageCollectorResult {
  return {
    status: "REJECTED",
    issues,
    snapshot: null,
    pages: null,
    metadata,
    statistics: createLandingPageStatistics({ pageCount: 0, htmlLength: 0, issueCount: issues.length, executionTime }),
    executionTime,
  };
}

function pageFor(pages: readonly LandingPageResponse[], url: string): LandingPageResponse | null {
  return pages.find((page) => page.destinationUrl.trim() === url.trim()) ?? null;
}

export function createLandingPageCollector(options: LandingPageCollectorOptions = {}): LandingPageCollector {
  const client = options.client ?? createLandingPageClient();
  const validator = options.validator ?? createLandingPageValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `collection-${++serial}`);
  const snapshots = new Map<string, LandingPageCollection>();

  return {
    client,
    validator,
    getSnapshot: (collectionId) => snapshots.get(collectionId) ?? null,
    collect(input) {
      try {
        const start = now();
        const retrievedAt = timestamp();
        const collectionId = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainLandingPage(input.executionMetadata as LandingPageMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0 || !isRecord(input)) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const results = input.sponsoredResults as readonly SponsoredResult[];
        const supplied = Array.isArray(input.pages) ? (input.pages as readonly LandingPageResponse[]) : [];
        const pages: LandingPageSnapshot[] = [];
        results.forEach((result, index) => {
          const url = result.url ?? "";
          const page = pageFor(supplied, url);
          if (page === null) return;
          const draft = client.collect(result, page, retrievedAt);
          pages.push(createLandingPageSnapshot({
            landingPageId: `${collectionId}-page-${index + 1}`,
            destinationUrl: draft.destinationUrl,
            finalUrl: draft.finalUrl,
            httpStatus: draft.httpStatus,
            headers: draft.headers,
            html: draft.html,
            retrievedAt: draft.retrievedAt,
            metadata,
          }));
        });
        const executionTime = Math.max(0, now() - start);
        const snapshot = createLandingPageCollection({ collectionId, pages, createdAt: retrievedAt, metadata });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata, executionTime);
        snapshots.set(collectionId, snapshot);
        const htmlLength = pages.reduce((sum, page) => sum + page.html.length, 0);
        return freezeDeepLandingPage({
          status: "OK",
          issues: [],
          snapshot,
          pages: snapshot.pages,
          metadata,
          statistics: createLandingPageStatistics({ pageCount: pages.length, htmlLength, issueCount: 0, executionTime }),
          executionTime,
        });
      } catch (error) {
        return refused([{ field: "collector", message: error instanceof Error ? error.message : "Invalid Metadata: the collector could not restate the pages." }], {});
      }
    },
  };
}
