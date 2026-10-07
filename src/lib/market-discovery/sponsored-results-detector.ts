/**
 * Host record domain: sponsored results detector.
 *
 * Turns a read-only list of SERP records into one frozen group of sponsored
 * results, metadata, and statistics. It keeps records whose sponsored marker
 * is already present. It does not name a seller, does not choose an order,
 * and does not reach an outside system. A refused input returns REJECTED
 * with issues and no snapshot. This method never throws.
 */
import type { SerpRecord } from "./serp-types";
import { createSponsoredDetector, type SponsoredDetector } from "./sponsored-detector";
import { createSponsoredSnapshot, type SponsoredSnapshot } from "./sponsored-snapshot";
import { copyPlainSponsored, createSponsoredStatistics, freezeDeepSponsored, type SponsoredIssue, type SponsoredMetadata, type SponsoredResult, type SponsoredStatistics } from "./sponsored-types";
import { createSponsoredValidator, type SponsoredValidator } from "./sponsored-validator";

export type SponsoredClock = () => number;
export type SponsoredTimestamp = () => string;
export type SponsoredIdFactory = () => string;

export interface SponsoredResultsDetectorResult {
  status: "OK" | "REJECTED";
  issues: SponsoredIssue[];
  snapshot: SponsoredSnapshot | null;
  results: readonly SponsoredResult[] | null;
  metadata: SponsoredMetadata;
  statistics: SponsoredStatistics;
  executionTime: number;
}

export interface SponsoredResultsDetector {
  readonly detector: SponsoredDetector;
  readonly validator: SponsoredValidator;
  detect(input: unknown): SponsoredResultsDetectorResult;
  getSnapshot(sponsoredId: string): SponsoredSnapshot | null;
}

export interface SponsoredResultsDetectorOptions {
  detector?: SponsoredDetector;
  validator?: SponsoredValidator;
  now?: SponsoredClock;
  timestamp?: SponsoredTimestamp;
  idFactory?: SponsoredIdFactory;
}

const defaultClock: SponsoredClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refused(issues: SponsoredIssue[], metadata: SponsoredMetadata, executionTime = 0): SponsoredResultsDetectorResult {
  return {
    status: "REJECTED",
    issues,
    snapshot: null,
    results: null,
    metadata,
    statistics: createSponsoredStatistics({ sourceCount: 0, sponsoredCount: 0, issueCount: issues.length, executionTime }),
    executionTime,
  };
}

function recordsOf(input: unknown): readonly SerpRecord[] {
  if (Array.isArray(input)) return input as readonly SerpRecord[];
  return ((input as Record<string, unknown>).serpRecords ?? []) as readonly SerpRecord[];
}

export function createSponsoredResultsDetector(options: SponsoredResultsDetectorOptions = {}): SponsoredResultsDetector {
  const detector = options.detector ?? createSponsoredDetector();
  const validator = options.validator ?? createSponsoredValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `sponsored-${++serial}`);
  const snapshots = new Map<string, SponsoredSnapshot>();

  return {
    detector,
    validator,
    getSnapshot: (sponsoredId) => snapshots.get(sponsoredId) ?? null,
    detect(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainSponsored(input.executionMetadata as SponsoredMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const source = recordsOf(input);
        const results = detector.select(source);
        const executionTime = Math.max(0, now() - start);
        const snapshot = createSponsoredSnapshot({
          sponsoredId: id,
          sourceCount: source.length,
          results,
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata, executionTime);
        snapshots.set(id, snapshot);
        return freezeDeepSponsored({
          status: "OK",
          issues: [],
          snapshot,
          results: snapshot.results,
          metadata,
          statistics: createSponsoredStatistics({
            sourceCount: source.length,
            sponsoredCount: results.length,
            issueCount: 0,
            executionTime,
          }),
          executionTime,
        });
      } catch (error) {
        return refused([{ field: "detector", message: error instanceof Error ? error.message : "Invalid Metadata: the detector could not restate the records." }], {});
      }
    },
  };
}
