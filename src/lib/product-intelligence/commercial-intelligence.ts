/**
 * Host record domain: commercial intelligence.
 *
 * Turns read-only ProductFacts, optional landing page evidence, optional
 * SearchEvidence, and CompetitionEvidence into frozen commercial evidence,
 * statistics, metadata, and a snapshot. It restates measurable purchase,
 * market, and business constructs. It never judges a product, never
 * approves or refuses a product, never fetches a page, and never runs
 * another engine. A refused input returns REJECTED with issues and no
 * evidence. This layer stays offline.
 */
import type { CommercialContext } from "./commercial-context";
import { createCommercialParser, type CommercialParser } from "./commercial-parser";
import { createCommercialValidator, type CommercialValidator } from "./commercial-validator";
import {
  computeCommercialStatistics,
  copyPlainCommercial,
  createCommercialEvidence,
  createCommercialSnapshot,
  marketSignalCountOf,
  signalCountOf,
  type CommercialEvidence,
  type CommercialIdentity,
  type CommercialIssue,
  type CommercialMetadata,
  type CommercialSnapshot,
  type CommercialStatistics,
} from "./commercial-evidence";

export type CommercialClock = () => number;
export type CommercialTimestamp = () => string;
export type CommercialIdFactory = () => string;

export interface CommercialIntelligenceResult {
  status: "OK" | "REJECTED";
  issues: CommercialIssue[];
  evidence: CommercialEvidence | null;
  statistics: CommercialStatistics | null;
  snapshot: CommercialSnapshot | null;
  metadata: CommercialMetadata;
  executionTime: number;
}

export interface CommercialIntelligence {
  readonly parser: CommercialParser;
  readonly validator: CommercialValidator;
  analyze(input: unknown): CommercialIntelligenceResult;
  getSnapshot(evidenceId: string): CommercialSnapshot | null;
}

export interface CommercialIntelligenceOptions {
  parser?: CommercialParser;
  validator?: CommercialValidator;
  now?: CommercialClock;
  timestamp?: CommercialTimestamp;
  idFactory?: CommercialIdFactory;
}

const defaultClock: CommercialClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function identityOf(input: CommercialContext): CommercialIdentity {
  const facts = isRecord(input.productFacts) ? input.productFacts : {};
  const competition = isRecord(input.competitionEvidence) ? input.competitionEvidence : {};
  const search = isRecord(input.searchEvidence) ? input.searchEvidence : {};
  return {
    productName: textOf(facts.productName) ?? textOf(facts.name) ?? textOf(competition.productName) ?? textOf(search.productName) ?? "",
    vendor: textOf(facts.vendor) ?? textOf(competition.vendor) ?? textOf(search.vendor),
    category: textOf(facts.category) ?? textOf(competition.category) ?? textOf(search.category),
    landingPage: textOf(facts.landingPage) ?? textOf(facts.affiliatePage) ?? textOf(competition.landingPage) ?? textOf(search.landingPage),
  };
}

function refused(issues: CommercialIssue[], metadata: CommercialMetadata, executionTime = 0): CommercialIntelligenceResult {
  return {
    status: "REJECTED",
    issues,
    evidence: null,
    statistics: computeCommercialStatistics({ signalCount: 0, marketSignalCount: 0, issueCount: issues.length, executionTime }),
    snapshot: null,
    metadata,
    executionTime,
  };
}

export function createCommercialIntelligence(options: CommercialIntelligenceOptions = {}): CommercialIntelligence {
  const parser = options.parser ?? createCommercialParser();
  const validator = options.validator ?? createCommercialValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `evidence-${++serial}`);
  const snapshots = new Map<string, CommercialSnapshot>();

  return {
    parser,
    validator,
    getSnapshot: (evidenceId) => snapshots.get(evidenceId) ?? null,
    analyze(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainCommercial(input.executionMetadata as CommercialMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const draft = input as CommercialContext;
        const parsed = parser.parse(draft);
        if (parsed.issues.length > 0) return refused(parsed.issues, metadata, Math.max(0, now() - start));
        const identity = identityOf(draft);
        const sourceUrl = identity.landingPage ?? "";
        const evidence = createCommercialEvidence(parsed.record, identity, sourceUrl, metadata);
        const executionTime = Math.max(0, now() - start);
        const snapshot = createCommercialSnapshot({
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
          statistics: computeCommercialStatistics({
            signalCount: signalCountOf(evidence),
            marketSignalCount: marketSignalCountOf(evidence),
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
