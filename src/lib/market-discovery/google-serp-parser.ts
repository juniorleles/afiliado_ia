/**
 * Host record domain: google SERP parser.
 *
 * Turns one read-only search snapshot into frozen structural records. It
 * copies titles, addresses, descriptions, stated positions, stated result
 * types, and stated markers. It does not choose an order, does not name a
 * listing, and does not reach an outside system. A refused input returns
 * REJECTED with issues and no snapshot. This method never throws.
 */
import type { SearchSnapshot } from "./google-search-snapshot";
import { createSerpParser, type SerpParser } from "./serp-parser";
import { createSerpSnapshot, type SerpSnapshot } from "./serp-snapshot";
import { copyPlainSerp, createSerpStatistics, freezeDeepSerp, type SerpIssue, type SerpMetadata, type SerpRecord, type SerpStatistics } from "./serp-types";
import { createSerpValidator, type SerpValidator } from "./serp-validator";

export type SerpClock = () => number;
export type SerpTimestamp = () => string;
export type SerpIdFactory = () => string;

export interface GoogleSerpParserResult {
  status: "OK" | "REJECTED";
  issues: SerpIssue[];
  snapshot: SerpSnapshot | null;
  records: readonly SerpRecord[] | null;
  metadata: SerpMetadata;
  statistics: SerpStatistics;
  executionTime: number;
}

export interface GoogleSerpParser {
  readonly parser: SerpParser;
  readonly validator: SerpValidator;
  parse(input: unknown): GoogleSerpParserResult;
  getSnapshot(serpId: string): SerpSnapshot | null;
}

export interface GoogleSerpParserOptions {
  parser?: SerpParser;
  validator?: SerpValidator;
  now?: SerpClock;
  timestamp?: SerpTimestamp;
  idFactory?: SerpIdFactory;
}

const defaultClock: SerpClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refused(issues: SerpIssue[], metadata: SerpMetadata, executionTime = 0): GoogleSerpParserResult {
  return {
    status: "REJECTED",
    issues,
    snapshot: null,
    records: null,
    metadata,
    statistics: createSerpStatistics({ recordCount: 0, issueCount: issues.length, executionTime }),
    executionTime,
  };
}

function searchSnapshotOf(input: Record<string, unknown>): SearchSnapshot {
  return ("searchSnapshot" in input ? input.searchSnapshot : input) as SearchSnapshot;
}

export function createGoogleSerpParser(options: GoogleSerpParserOptions = {}): GoogleSerpParser {
  const parser = options.parser ?? createSerpParser();
  const validator = options.validator ?? createSerpValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `serp-${++serial}`);
  const snapshots = new Map<string, SerpSnapshot>();

  return {
    parser,
    validator,
    getSnapshot: (serpId) => snapshots.get(serpId) ?? null,
    parse(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainSerp(input.executionMetadata as SerpMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0 || !isRecord(input)) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const source = searchSnapshotOf(input);
        const records = parser.parse(source.html);
        const executionTime = Math.max(0, now() - start);
        const snapshot = createSerpSnapshot({
          serpId: id,
          searchSnapshotId: source.snapshotId,
          query: source.query,
          records,
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata, executionTime);
        snapshots.set(id, snapshot);
        return freezeDeepSerp({
          status: "OK",
          issues: [],
          snapshot,
          records: snapshot.records,
          metadata,
          statistics: createSerpStatistics({ recordCount: records.length, issueCount: 0, executionTime }),
          executionTime,
        });
      } catch (error) {
        return refused([{ field: "parser", message: error instanceof Error ? error.message : "Invalid Metadata: the parser could not restate the page." }], {});
      }
    },
  };
}
