/**
 * Host record domain: recommendation snapshot.
 *
 * A frozen copy of one recommendation set. Each row restates figures already
 * present on the performance report and the metric records. Credential values
 * are not members.
 */
import type { OptimizationMetadata } from "./optimization-context";
import type { RecommendationConfidence, RecommendationIssue, RecommendationKind, RuleId } from "./optimization-types";

export const OPTIMIZATION_STATUSES = ["OK", "REJECTED"] as const;
export type OptimizationStatus = (typeof OPTIMIZATION_STATUSES)[number];

export const OPTIMIZATION_ORIGINS = ["OBSERVED"] as const;
export type OptimizationOrigin = (typeof OPTIMIZATION_ORIGINS)[number];

export const OPTIMIZATION_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type OptimizationProvenance = (typeof OPTIMIZATION_PROVENANCE)[number];

export const EVIDENCE_ROW_KEYS = ["name", "resourceName", "level", "current", "historical", "change", "direction"] as const;

export interface OptimizationEvidenceRow {
  name: string;
  resourceName: string;
  level: string;
  current: number | null;
  historical: number | null;
  change: number | null;
  direction: string;
}

export const EVIDENCE_KEYS = ["rows"] as const;

export interface OptimizationEvidenceBody {
  rows: OptimizationEvidenceRow[];
}

export const SUPPORTING_METRIC_KEYS = ["name", "resourceName", "current", "historical"] as const;

export interface SupportingMetric {
  name: string;
  resourceName: string;
  current: number | null;
  historical: number | null;
}

export const SUPPORTING_METRICS_KEYS = ["rows"] as const;

export interface OptimizationSupportingMetrics {
  rows: SupportingMetric[];
}

export const HISTORICAL_COMPARISON_KEYS = ["currentWindow", "historicalWindow", "rows"] as const;

export interface OptimizationHistoricalComparison {
  currentWindow: string;
  historicalWindow: string;
  rows: OptimizationEvidenceRow[];
}

export const RECOMMENDATION_KEYS = [
  "recommendationId",
  "kind",
  "reason",
  "evidence",
  "supportingMetrics",
  "historicalComparison",
  "confidence",
  "triggeredRules",
] as const;

export interface OptimizationRecommendation {
  recommendationId: RuleId;
  kind: RecommendationKind;
  reason: string;
  evidence: OptimizationEvidenceBody;
  supportingMetrics: OptimizationSupportingMetrics;
  historicalComparison: OptimizationHistoricalComparison;
  confidence: RecommendationConfidence;
  triggeredRules: RuleId[];
}

export const RECOMMENDATION_SET_KEYS = ["campaignResourceName", "recommendations"] as const;

export interface OptimizationRecommendationSet {
  campaignResourceName: string;
  recommendations: OptimizationRecommendation[];
}

export const OPTIMIZATION_EVIDENCE_KEYS = ["campaignResourceName", "currentWindow", "historicalWindow", "rows"] as const;

export interface OptimizationEvidence {
  campaignResourceName: string;
  currentWindow: string;
  historicalWindow: string;
  rows: OptimizationEvidenceRow[];
}

export const OPTIMIZATION_STATISTICS_KEYS = ["ruleCount", "triggeredRuleCount", "recommendationCount", "issueCount", "executionTime"] as const;

export interface OptimizationStatistics {
  ruleCount: number;
  triggeredRuleCount: number;
  recommendationCount: number;
  issueCount: number;
  executionTime: number;
}

export const OPTIMIZATION_CONTEXT_RECORD_KEYS = ["campaignResourceName", "currentWindow", "historicalWindow"] as const;

export interface OptimizationContextRecord {
  campaignResourceName: string;
  currentWindow: string;
  historicalWindow: string;
}

export const OPTIMIZATION_SNAPSHOT_KEYS = [
  "recommendationSetId",
  "recommendationSet",
  "evidence",
  "statistics",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface OptimizationSnapshot {
  recommendationSetId: string;
  recommendationSet: OptimizationRecommendationSet;
  evidence: OptimizationEvidence;
  statistics: OptimizationStatistics;
  context: OptimizationContextRecord;
  createdAt: string;
  origin: OptimizationOrigin;
  provenance: OptimizationProvenance;
  metadata: OptimizationMetadata;
}

export const OPTIMIZATION_RESULT_KEYS = [
  "status",
  "issues",
  "recommendationSet",
  "evidence",
  "statistics",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface OptimizationResult {
  status: OptimizationStatus;
  issues: RecommendationIssue[];
  recommendationSet: OptimizationRecommendationSet | null;
  evidence: OptimizationEvidence | null;
  statistics: OptimizationStatistics;
  snapshot: OptimizationSnapshot | null;
  metadata: OptimizationMetadata;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepOptimization<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepOptimization(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function createOptimizationStatistics(init: OptimizationStatistics): OptimizationStatistics {
  return freezeDeepOptimization({
    ruleCount: init.ruleCount,
    triggeredRuleCount: init.triggeredRuleCount,
    recommendationCount: init.recommendationCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

function copyRow(row: OptimizationEvidenceRow): OptimizationEvidenceRow {
  return {
    name: row.name,
    resourceName: row.resourceName,
    level: row.level,
    current: row.current,
    historical: row.historical,
    change: row.change,
    direction: row.direction,
  };
}

function copySupporting(row: SupportingMetric): SupportingMetric {
  return { name: row.name, resourceName: row.resourceName, current: row.current, historical: row.historical };
}

function copyRecommendation(recommendation: OptimizationRecommendation): OptimizationRecommendation {
  const rows = recommendation.evidence.rows.map(copyRow);
  return {
    recommendationId: recommendation.recommendationId,
    kind: recommendation.kind,
    reason: recommendation.reason,
    evidence: { rows },
    supportingMetrics: { rows: recommendation.supportingMetrics.rows.map(copySupporting) },
    historicalComparison: {
      currentWindow: recommendation.historicalComparison.currentWindow,
      historicalWindow: recommendation.historicalComparison.historicalWindow,
      rows: recommendation.evidence.rows.map(copyRow),
    },
    confidence: recommendation.confidence,
    triggeredRules: [...recommendation.triggeredRules],
  };
}

export function createOptimizationSnapshot(init: {
  recommendationSetId: string;
  recommendations: OptimizationRecommendation[];
  evidence: OptimizationEvidence;
  statistics: OptimizationStatistics;
  context: OptimizationContextRecord;
  createdAt: string;
  metadata?: OptimizationMetadata;
}): OptimizationSnapshot {
  const recommendations = init.recommendations.map(copyRecommendation);
  const recommendationSet: OptimizationRecommendationSet = {
    campaignResourceName: init.context.campaignResourceName,
    recommendations,
  };
  return freezeDeepOptimization({
    recommendationSetId: init.recommendationSetId,
    recommendationSet,
    evidence: {
      campaignResourceName: init.evidence.campaignResourceName,
      currentWindow: init.evidence.currentWindow,
      historicalWindow: init.evidence.historicalWindow,
      rows: init.evidence.rows.map(copyRow),
    },
    statistics: init.statistics,
    context: {
      campaignResourceName: init.context.campaignResourceName,
      currentWindow: init.context.currentWindow,
      historicalWindow: init.context.historicalWindow,
    },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
