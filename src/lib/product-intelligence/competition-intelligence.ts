/**
 * Host record domain: competition intelligence.
 *
 * Turns read-only ProductFacts, optional landing page evidence, and
 * SearchEvidence into frozen competition evidence, statistics, metadata,
 * and a snapshot. It restates measurable advertiser and market constructs.
 * It never judges a product, never decides whether to advertise, never
 * fetches a page, and never runs another engine. A refused input returns
 * REJECTED with issues and no evidence. This layer stays offline.
 */
import type { CompetitionContext } from "./competition-context";
import { createCompetitionParser, type CompetitionParser } from "./competition-parser";
import { createCompetitionValidator, type CompetitionValidator } from "./competition-validator";
import {
  computeCompetitionStatistics,
  copyPlainCompetition,
  createCompetitionEvidence,
  createCompetitionSnapshot,
  signalCountOf,
  type CompetitionEvidence,
  type CompetitionIdentity,
  type CompetitionIssue,
  type CompetitionMetadata,
  type CompetitionSnapshot,
  type CompetitionStatistics,
} from "./competition-evidence";

export type CompetitionClock = () => number;
export type CompetitionTimestamp = () => string;
export type CompetitionIdFactory = () => string;

export interface CompetitionIntelligenceResult {
  status: "OK" | "REJECTED";
  issues: CompetitionIssue[];
  evidence: CompetitionEvidence | null;
  statistics: CompetitionStatistics | null;
  snapshot: CompetitionSnapshot | null;
  metadata: CompetitionMetadata;
  executionTime: number;
}

export interface CompetitionIntelligence {
  readonly parser: CompetitionParser;
  readonly validator: CompetitionValidator;
  analyze(input: unknown): CompetitionIntelligenceResult;
  getSnapshot(evidenceId: string): CompetitionSnapshot | null;
}

export interface CompetitionIntelligenceOptions {
  parser?: CompetitionParser;
  validator?: CompetitionValidator;
  now?: CompetitionClock;
  timestamp?: CompetitionTimestamp;
  idFactory?: CompetitionIdFactory;
}

const defaultClock: CompetitionClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function identityOf(input: CompetitionContext): CompetitionIdentity {
  const facts = isRecord(input.productFacts) ? input.productFacts : {};
  const search = isRecord(input.searchEvidence) ? input.searchEvidence : {};
  return {
    productName: textOf(facts.productName) ?? textOf(facts.name) ?? textOf(search.productName) ?? textOf(search.name) ?? "",
    vendor: textOf(facts.vendor) ?? textOf(search.vendor),
    category: textOf(facts.category) ?? textOf(search.category),
    landingPage: textOf(facts.landingPage) ?? textOf(facts.affiliatePage) ?? textOf(search.landingPage),
  };
}

function refused(issues: CompetitionIssue[], metadata: CompetitionMetadata, executionTime = 0): CompetitionIntelligenceResult {
  return {
    status: "REJECTED",
    issues,
    evidence: null,
    statistics: computeCompetitionStatistics({ signalCount: 0, advertiserCount: 0, issueCount: issues.length, executionTime }),
    snapshot: null,
    metadata,
    executionTime,
  };
}

export function createCompetitionIntelligence(options: CompetitionIntelligenceOptions = {}): CompetitionIntelligence {
  const parser = options.parser ?? createCompetitionParser();
  const validator = options.validator ?? createCompetitionValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `evidence-${++serial}`);
  const snapshots = new Map<string, CompetitionSnapshot>();

  return {
    parser,
    validator,
    getSnapshot: (evidenceId) => snapshots.get(evidenceId) ?? null,
    analyze(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainCompetition(input.executionMetadata as CompetitionMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const draft = input as CompetitionContext;
        const parsed = parser.parse(draft);
        if (parsed.issues.length > 0) return refused(parsed.issues, metadata, Math.max(0, now() - start));
        const identity = identityOf(draft);
        const sourceUrl = identity.landingPage ?? "";
        const evidence = createCompetitionEvidence(parsed.record, identity, sourceUrl, metadata);
        const executionTime = Math.max(0, now() - start);
        const snapshot = createCompetitionSnapshot({
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
          statistics: computeCompetitionStatistics({
            signalCount: signalCountOf(evidence),
            advertiserCount: evidence.numberOfAdvertisers,
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
