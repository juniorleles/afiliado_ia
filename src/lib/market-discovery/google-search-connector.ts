/**
 * Host record domain: google search connector.
 *
 * Turns a read-only keyword, locale, device, market, and supplied page into
 * one frozen search snapshot, metadata, and statistics. It copies the page.
 * It does not read the markup, does not name a listing, and does not reach
 * an outside system. A refused input returns REJECTED with issues and no
 * snapshot. This method never throws.
 */
import { createGoogleSearchClient, type GoogleSearchClient } from "./google-search-client";
import type { SearchContext } from "./google-search-context";
import { createSearchSnapshot, type SearchSnapshot } from "./google-search-snapshot";
import { copyPlainSearch, createSearchStatistics, freezeDeepSearch, type SearchIssue, type SearchMetadata, type SearchStatistics } from "./google-search-types";
import { createGoogleSearchValidator, type GoogleSearchValidator } from "./google-search-validator";

export type SearchClock = () => number;
export type SearchTimestamp = () => string;
export type SearchIdFactory = () => string;

export interface GoogleSearchConnectorResult {
  status: "OK" | "REJECTED";
  issues: SearchIssue[];
  snapshot: SearchSnapshot | null;
  metadata: SearchMetadata;
  statistics: SearchStatistics;
  executionTime: number;
}

export interface GoogleSearchConnector {
  readonly client: GoogleSearchClient;
  readonly validator: GoogleSearchValidator;
  collect(input: unknown): GoogleSearchConnectorResult;
  getSnapshot(snapshotId: string): SearchSnapshot | null;
}

export interface GoogleSearchConnectorOptions {
  client?: GoogleSearchClient;
  validator?: GoogleSearchValidator;
  now?: SearchClock;
  timestamp?: SearchTimestamp;
  idFactory?: SearchIdFactory;
}

const defaultClock: SearchClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refused(issues: SearchIssue[], metadata: SearchMetadata, executionTime = 0): GoogleSearchConnectorResult {
  return {
    status: "REJECTED",
    issues,
    snapshot: null,
    metadata,
    statistics: createSearchStatistics({ collectionCount: 0, htmlLength: 0, issueCount: issues.length, executionTime }),
    executionTime,
  };
}

export function createGoogleSearchConnector(options: GoogleSearchConnectorOptions = {}): GoogleSearchConnector {
  const client = options.client ?? createGoogleSearchClient();
  const validator = options.validator ?? createGoogleSearchValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `snapshot-${++serial}`);
  const snapshots = new Map<string, SearchSnapshot>();

  return {
    client,
    validator,
    getSnapshot: (snapshotId) => snapshots.get(snapshotId) ?? null,
    collect(input) {
      try {
        const start = now();
        const collectedAt = timestamp();
        const id = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainSearch(input.executionMetadata as SearchMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const draft = client.collect(input as SearchContext, collectedAt);
        const executionTime = Math.max(0, now() - start);
        const snapshot = createSearchSnapshot({
          snapshotId: id,
          query: draft.query,
          language: draft.language,
          country: draft.country,
          device: draft.device,
          market: draft.market,
          searchUrl: draft.searchUrl,
          html: draft.html,
          collectedAt: draft.collectedAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata, executionTime);
        snapshots.set(id, snapshot);
        return freezeDeepSearch({
          status: "OK",
          issues: [],
          snapshot,
          metadata,
          statistics: createSearchStatistics({
            collectionCount: 1,
            htmlLength: draft.html.length,
            issueCount: 0,
            executionTime,
          }),
          executionTime,
        });
      } catch (error) {
        return refused([{ field: "connector", message: error instanceof Error ? error.message : "Invalid Metadata: the connector could not restate the page." }], {});
      }
    },
  };
}
