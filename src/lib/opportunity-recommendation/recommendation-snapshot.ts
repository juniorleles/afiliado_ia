/**
 * Host record domain: recommendation snapshot.
 *
 * A frozen copy of one recommendation set. Counts restate which types were
 * named. This module does not reach an outside system.
 */
import type { RecommendationMetadata } from "./recommendation-context";
import type {
  OpportunityRecommendation,
  OpportunityRecommendationEvidence,
  RecommendationIssue,
  RecommendationOrigin,
  RecommendationProvenance,
  RecommendationRule,
  RecommendationStatus,
} from "./recommendation-types";

export const RECOMMENDATION_STATISTICS_KEYS = [
  "opportunityCount",
  "recommendationCount",
  "testFirstCount",
  "monitorCount",
  "watchCount",
  "skipCount",
  "manualReviewCount",
  "issueCount",
  "executionTime",
] as const;

export interface RecommendationStatistics {
  opportunityCount: number;
  recommendationCount: number;
  testFirstCount: number;
  monitorCount: number;
  watchCount: number;
  skipCount: number;
  manualReviewCount: number;
  issueCount: number;
  executionTime: number;
}

export const RECOMMENDATION_CONTEXT_RECORD_KEYS = ["policyId", "opportunityIds"] as const;

export interface RecommendationContextRecord {
  policyId: string;
  opportunityIds: readonly string[];
}

export const RECOMMENDATION_SET_KEYS = ["policyId", "recommendations", "origin", "provenance"] as const;

export interface RecommendationSet {
  policyId: string;
  recommendations: readonly OpportunityRecommendation[];
  origin: RecommendationOrigin;
  provenance: RecommendationProvenance;
}

export const RECOMMENDATION_EVIDENCE_KEYS = ["policyId", "rules", "opportunities"] as const;

export interface RecommendationEvidence {
  policyId: string;
  rules: readonly RecommendationRule[];
  opportunities: readonly OpportunityRecommendationEvidence[];
}

export const RECOMMENDATION_SNAPSHOT_KEYS = [
  "recommendationId",
  "recommendations",
  "evidence",
  "statistics",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface RecommendationSnapshot {
  recommendationId: string;
  recommendations: RecommendationSet;
  evidence: RecommendationEvidence;
  statistics: RecommendationStatistics;
  context: RecommendationContextRecord;
  createdAt: string;
  origin: RecommendationOrigin;
  provenance: RecommendationProvenance;
  metadata: RecommendationMetadata;
}

export const RECOMMENDATION_RESULT_KEYS = [
  "status",
  "issues",
  "recommendations",
  "evidence",
  "statistics",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface RecommendationResult {
  status: RecommendationStatus;
  issues: RecommendationIssue[];
  recommendations: RecommendationSet | null;
  evidence: RecommendationEvidence | null;
  statistics: RecommendationStatistics;
  snapshot: RecommendationSnapshot | null;
  metadata: RecommendationMetadata;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepRecommendation<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepRecommendation(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function createRecommendationStatistics(init: RecommendationStatistics): RecommendationStatistics {
  return freezeDeepRecommendation({
    opportunityCount: init.opportunityCount,
    recommendationCount: init.recommendationCount,
    testFirstCount: init.testFirstCount,
    monitorCount: init.monitorCount,
    watchCount: init.watchCount,
    skipCount: init.skipCount,
    manualReviewCount: init.manualReviewCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

export function createRecommendationSnapshot(init: {
  recommendationId: string;
  recommendations: RecommendationSet;
  evidence: RecommendationEvidence;
  statistics: RecommendationStatistics;
  context: RecommendationContextRecord;
  createdAt: string;
  metadata?: RecommendationMetadata;
}): RecommendationSnapshot {
  return freezeDeepRecommendation({
    recommendationId: init.recommendationId,
    recommendations: init.recommendations,
    evidence: init.evidence,
    statistics: init.statistics,
    context: {
      policyId: init.context.policyId,
      opportunityIds: [...init.context.opportunityIds],
    },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
