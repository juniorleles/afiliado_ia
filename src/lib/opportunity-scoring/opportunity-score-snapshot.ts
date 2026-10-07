/**
 * Host record domain: opportunity scoring snapshot.
 *
 * A frozen copy of one evaluation. Counts restate which metrics were
 * measured. This module does not reach an outside system.
 */
import type { OpportunityScoreMetadata } from "./opportunity-score-context";
import type {
  OpportunityEvidence,
  OpportunityMetrics,
  OpportunityScoreOrigin,
  OpportunityScoreProvenance,
  OpportunityScoreStatus,
  OpportunityScoreIssue,
} from "./opportunity-score-types";

export const OPPORTUNITY_EXECUTION_STATISTICS_KEYS = [
  "metricCount",
  "nullMetricCount",
  "issueCount",
  "executionTime",
] as const;

export interface OpportunityExecutionStatistics {
  metricCount: number;
  nullMetricCount: number;
  issueCount: number;
  executionTime: number;
}

export const OPPORTUNITY_SCORE_CONTEXT_RECORD_KEYS = ["query", "searchSnapshotId"] as const;

export interface OpportunityScoreContextRecord {
  query: string;
  searchSnapshotId: string;
}

export const OPPORTUNITY_SCORE_SNAPSHOT_KEYS = [
  "scoreId",
  "metrics",
  "evidence",
  "statistics",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface OpportunityScoreSnapshot {
  scoreId: string;
  metrics: OpportunityMetrics;
  evidence: OpportunityEvidence;
  statistics: OpportunityExecutionStatistics;
  context: OpportunityScoreContextRecord;
  createdAt: string;
  origin: OpportunityScoreOrigin;
  provenance: OpportunityScoreProvenance;
  metadata: OpportunityScoreMetadata;
}

export const OPPORTUNITY_SCORE_RESULT_KEYS = [
  "status",
  "issues",
  "metrics",
  "evidence",
  "statistics",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface OpportunityScoreResult {
  status: OpportunityScoreStatus;
  issues: OpportunityScoreIssue[];
  metrics: OpportunityMetrics | null;
  evidence: OpportunityEvidence | null;
  statistics: OpportunityExecutionStatistics;
  snapshot: OpportunityScoreSnapshot | null;
  metadata: OpportunityScoreMetadata;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepOpportunityScore<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepOpportunityScore(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function createOpportunityExecutionStatistics(init: OpportunityExecutionStatistics): OpportunityExecutionStatistics {
  return freezeDeepOpportunityScore({
    metricCount: init.metricCount,
    nullMetricCount: init.nullMetricCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

export function createOpportunityScoreSnapshot(init: {
  scoreId: string;
  metrics: OpportunityMetrics;
  evidence: OpportunityEvidence;
  statistics: OpportunityExecutionStatistics;
  context: OpportunityScoreContextRecord;
  createdAt: string;
  metadata?: OpportunityScoreMetadata;
}): OpportunityScoreSnapshot {
  return freezeDeepOpportunityScore({
    scoreId: init.scoreId,
    metrics: init.metrics,
    evidence: init.evidence,
    statistics: init.statistics,
    context: {
      query: init.context.query,
      searchSnapshotId: init.context.searchSnapshotId,
    },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
