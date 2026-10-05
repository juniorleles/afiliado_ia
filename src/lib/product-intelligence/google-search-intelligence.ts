/**
 * Host record domain: google search intelligence.
 *
 * Turns a read-only ProductFacts bundle, product name, vendor, category,
 * landing page, and search context into frozen search evidence, statistics,
 * metadata, and a snapshot. It restates measurable signals. It never judges
 * a product, never fetches a page, and never runs another engine. A refused
 * input returns REJECTED with issues and no evidence. This layer stays
 * offline.
 */
import type { GoogleSearchContext } from "./google-search-context";
import { createGoogleSearchParser, type GoogleSearchParser } from "./google-search-parser";
import { createGoogleSearchValidator, type GoogleSearchValidator } from "./google-search-validator";
import {
  computeGoogleSearchStatistics,
  copyPlainGoogleSearch,
  createGoogleSearchEvidence,
  createGoogleSearchSnapshot,
  signalCountOf,
  type GoogleSearchEvidence,
  type GoogleSearchIdentity,
  type GoogleSearchIssue,
  type GoogleSearchMetadata,
  type GoogleSearchSnapshot,
  type GoogleSearchStatistics,
} from "./google-search-evidence";

export type GoogleSearchClock = () => number;
export type GoogleSearchTimestamp = () => string;
export type GoogleSearchIdFactory = () => string;

export interface GoogleSearchIntelligenceResult {
  status: "OK" | "REJECTED";
  issues: GoogleSearchIssue[];
  evidence: GoogleSearchEvidence | null;
  statistics: GoogleSearchStatistics | null;
  snapshot: GoogleSearchSnapshot | null;
  metadata: GoogleSearchMetadata;
  executionTime: number;
}

export interface GoogleSearchIntelligence {
  readonly parser: GoogleSearchParser;
  readonly validator: GoogleSearchValidator;
  analyze(input: unknown): GoogleSearchIntelligenceResult;
  getSnapshot(evidenceId: string): GoogleSearchSnapshot | null;
}

export interface GoogleSearchIntelligenceOptions {
  parser?: GoogleSearchParser;
  validator?: GoogleSearchValidator;
  now?: GoogleSearchClock;
  timestamp?: GoogleSearchTimestamp;
  idFactory?: GoogleSearchIdFactory;
}

const defaultClock: GoogleSearchClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function identityOf(input: GoogleSearchContext): GoogleSearchIdentity {
  const facts = isRecord(input.productFacts) ? input.productFacts : {};
  return {
    productName: textOf(input.productName) ?? textOf(facts.productName) ?? textOf(facts.name) ?? "",
    vendor: textOf(input.vendor) ?? textOf(facts.vendor),
    category: textOf(input.category) ?? textOf(facts.category),
    landingPage: textOf(input.landingPage) ?? textOf(facts.landingPage) ?? textOf(facts.affiliatePage),
  };
}

function refused(issues: GoogleSearchIssue[], metadata: GoogleSearchMetadata, executionTime = 0): GoogleSearchIntelligenceResult {
  return {
    status: "REJECTED",
    issues,
    evidence: null,
    statistics: computeGoogleSearchStatistics({ signalCount: 0, sponsoredResultCount: 0, issueCount: issues.length, executionTime }),
    snapshot: null,
    metadata,
    executionTime,
  };
}

export function createGoogleSearchIntelligence(options: GoogleSearchIntelligenceOptions = {}): GoogleSearchIntelligence {
  const parser = options.parser ?? createGoogleSearchParser();
  const validator = options.validator ?? createGoogleSearchValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `evidence-${++serial}`);
  const snapshots = new Map<string, GoogleSearchSnapshot>();

  return {
    parser,
    validator,
    getSnapshot: (evidenceId) => snapshots.get(evidenceId) ?? null,
    analyze(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainGoogleSearch(input.executionMetadata as GoogleSearchMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const draft = input as GoogleSearchContext;
        const parsed = parser.parse(draft);
        if (parsed.issues.length > 0) return refused(parsed.issues, metadata, Math.max(0, now() - start));
        const identity = identityOf(draft);
        const sourceUrl = identity.landingPage ?? "";
        const evidence = createGoogleSearchEvidence(parsed.record, identity, sourceUrl, metadata);
        const executionTime = Math.max(0, now() - start);
        const snapshot = createGoogleSearchSnapshot({
          evidenceId: id,
          productName: identity.productName,
          landingPage: identity.landingPage,
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
          statistics: computeGoogleSearchStatistics({
            signalCount: signalCountOf(evidence),
            sponsoredResultCount: evidence.sponsoredResultCount,
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
