/**
 * Host record domain: landing page intelligence.
 *
 * Turns a read-only landing page URL, raw HTML, and optional DOM snapshot
 * into frozen landing page evidence, statistics, metadata, and a snapshot.
 * It restates measurable signals. It never judges a product, never fetches a
 * page, and never runs another engine. A refused input returns REJECTED with
 * issues and no evidence. This layer stays offline.
 */
import type { LandingPageContext } from "./landing-page-context";
import { createLandingPageParser, type LandingPageParser } from "./landing-page-parser";
import { createLandingPageValidator, type LandingPageValidator } from "./landing-page-validator";
import {
  computeLandingPageStatistics,
  copyPlainLandingPage,
  createLandingPageEvidence,
  createLandingPageSnapshot,
  signalCountOf,
  type LandingPageEvidence,
  type LandingPageIssue,
  type LandingPageMetadata,
  type LandingPageSnapshot,
  type LandingPageStatistics,
} from "./landing-page-evidence";

export type LandingPageClock = () => number;
export type LandingPageTimestamp = () => string;
export type LandingPageIdFactory = () => string;

export interface LandingPageIntelligenceResult {
  status: "OK" | "REJECTED";
  issues: LandingPageIssue[];
  evidence: LandingPageEvidence | null;
  statistics: LandingPageStatistics | null;
  snapshot: LandingPageSnapshot | null;
  metadata: LandingPageMetadata;
  executionTime: number;
}

export interface LandingPageIntelligence {
  readonly parser: LandingPageParser;
  readonly validator: LandingPageValidator;
  analyze(input: unknown): LandingPageIntelligenceResult;
  getSnapshot(evidenceId: string): LandingPageSnapshot | null;
}

export interface LandingPageIntelligenceOptions {
  parser?: LandingPageParser;
  validator?: LandingPageValidator;
  now?: LandingPageClock;
  timestamp?: LandingPageTimestamp;
  idFactory?: LandingPageIdFactory;
}

const defaultClock: LandingPageClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refused(issues: LandingPageIssue[], metadata: LandingPageMetadata, executionTime = 0): LandingPageIntelligenceResult {
  return {
    status: "REJECTED",
    issues,
    evidence: null,
    statistics: computeLandingPageStatistics({ signalCount: 0, assetCount: 0, issueCount: issues.length, executionTime }),
    snapshot: null,
    metadata,
    executionTime,
  };
}

export function createLandingPageIntelligence(options: LandingPageIntelligenceOptions = {}): LandingPageIntelligence {
  const parser = options.parser ?? createLandingPageParser();
  const validator = options.validator ?? createLandingPageValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `evidence-${++serial}`);
  const snapshots = new Map<string, LandingPageSnapshot>();

  return {
    parser,
    validator,
    getSnapshot: (evidenceId) => snapshots.get(evidenceId) ?? null,
    analyze(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainLandingPage(input.executionMetadata as LandingPageMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const draft = input as LandingPageContext;
        const parsed = parser.parse(draft);
        if (parsed.issues.length > 0) return refused(parsed.issues, metadata, Math.max(0, now() - start));
        const sourceUrl = draft.landingPageUrl.trim();
        const evidence = createLandingPageEvidence(parsed.record, sourceUrl, metadata);
        const executionTime = Math.max(0, now() - start);
        const snapshot = createLandingPageSnapshot({
          evidenceId: id,
          sourceUrl,
          headline: evidence.headline,
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata, executionTime);
        snapshots.set(id, snapshot);
        return {
          status: "OK",
          issues: [],
          evidence,
          statistics: computeLandingPageStatistics({
            signalCount: signalCountOf(evidence),
            assetCount: evidence.assetCount,
            issueCount: 0,
            executionTime,
          }),
          snapshot,
          metadata: evidence.metadata,
          executionTime,
        };
      } catch (error) {
        return refused(
          [{ field: "analyzer", message: error instanceof Error ? error.message : "Invalid Metadata: the analyzer could not restate the records." }],
          {},
        );
      }
    },
  };
}
