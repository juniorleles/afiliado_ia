/**
 * Host record domain: opportunity scoring engine.
 *
 * One entry point from a market report to frozen metrics. It stores
 * snapshots in memory. A refused evaluation returns REJECTED and stores
 * nothing. This method never throws.
 */
import type { OpportunityScoreMetadata } from "./opportunity-score-context";
import { createOpportunityScoreBuilder, type OpportunityScoreBuilder } from "./opportunity-score-builder";
import {
  createOpportunityExecutionStatistics,
  createOpportunityScoreSnapshot,
  freezeDeepOpportunityScore,
  type OpportunityScoreResult,
  type OpportunityScoreSnapshot,
} from "./opportunity-score-snapshot";
import { OPPORTUNITY_METRIC_KEYS, type OpportunityMetrics } from "./opportunity-score-types";
import { createOpportunityScoreValidator, type OpportunityScoreValidator } from "./opportunity-score-validator";

export type OpportunityScoreClock = () => number;
export type OpportunityScoreTimestamp = () => string;
export type OpportunityScoreIdFactory = () => string;

export interface OpportunityScoringEngineOptions {
  now?: OpportunityScoreClock;
  timestamp?: OpportunityScoreTimestamp;
  idFactory?: OpportunityScoreIdFactory;
  builder?: OpportunityScoreBuilder;
  validator?: OpportunityScoreValidator;
}

export interface OpportunityScoringEngine {
  readonly validator: OpportunityScoreValidator;
  evaluate(input: unknown): OpportunityScoreResult;
  getSnapshot(scoreId: string): OpportunityScoreSnapshot | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataOf(input: Record<string, unknown>): OpportunityScoreMetadata {
  if (isRecord(input.executionMetadata)) return { ...input.executionMetadata } as OpportunityScoreMetadata;
  if (isRecord(input.metadata)) return { ...input.metadata } as OpportunityScoreMetadata;
  return {};
}

function nullMetricCount(metrics: OpportunityMetrics): number {
  let count = 0;
  for (const key of OPPORTUNITY_METRIC_KEYS) {
    if (metrics[key] === null) count += 1;
  }
  return count;
}

export function createOpportunityScoringEngine(options: OpportunityScoringEngineOptions = {}): OpportunityScoringEngine {
  const validator = options.validator ?? createOpportunityScoreValidator();
  const builder = options.builder ?? createOpportunityScoreBuilder();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `opportunity-score-${++serial}`);
  const snapshots = new Map<string, OpportunityScoreSnapshot>();

  return {
    validator,
    evaluate(input) {
      const started = now();
      const refused = (issues: OpportunityScoreResult["issues"], metadata: OpportunityScoreMetadata = {}): OpportunityScoreResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepOpportunityScore({
          status: "REJECTED",
          issues,
          metrics: null,
          evidence: null,
          statistics: createOpportunityExecutionStatistics({
            metricCount: 0,
            nullMetricCount: 0,
            issueCount: issues.length,
            executionTime,
          }),
          snapshot: null,
          metadata,
          executionTime,
        });
      };
      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0 || !isRecord(input)) return refused(issues);
        const createdAt = timestamp();
        const scoreId = idFactory();
        const metadata = metadataOf(input);
        const draft = builder.build(input);
        const executionTime = Math.max(0, now() - started);
        const statistics = createOpportunityExecutionStatistics({
          metricCount: OPPORTUNITY_METRIC_KEYS.length,
          nullMetricCount: nullMetricCount(draft.metrics),
          issueCount: 0,
          executionTime,
        });
        const snapshot = createOpportunityScoreSnapshot({
          scoreId,
          metrics: draft.metrics,
          evidence: draft.evidence,
          statistics,
          context: draft.context,
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata);
        snapshots.set(snapshot.scoreId, snapshot);
        return freezeDeepOpportunityScore({
          status: "OK",
          issues: [],
          metrics: snapshot.metrics,
          evidence: snapshot.evidence,
          statistics: snapshot.statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "evaluation", message: "Invalid Metadata: the evaluation could not restate the metrics." }]);
      }
    },
    getSnapshot: (scoreId) => snapshots.get(scoreId) ?? null,
  };
}
