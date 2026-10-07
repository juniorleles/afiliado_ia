/**
 * Host record domain: product recommendation snapshot.
 *
 * Frozen recommendation records. A recommendation names which observed
 * products are ready to be considered for execution. It is not an approval,
 * and it does not change a Discovery, Opportunity, or Decision record.
 * This module does not reach an outside system and does not run another engine.
 */
export type RecommendationMetadata = Record<string, string | number | boolean | null>;

export const RECOMMENDATION_STATUSES = ["OK", "REJECTED"] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export const RECOMMENDATION_LEVELS = ["EXECUTION_CANDIDATE", "HOLD", "INSUFFICIENT"] as const;
export type RecommendationLevel = (typeof RECOMMENDATION_LEVELS)[number];

export const RECOMMENDATION_ORIGINS = ["OBSERVED"] as const;
export type RecommendationOrigin = (typeof RECOMMENDATION_ORIGINS)[number];

export const RECOMMENDATION_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type RecommendationProvenance = (typeof RECOMMENDATION_PROVENANCE)[number];

export interface RecommendationIssue {
  field: string;
  message: string;
}

export const RECOMMENDATION_CONTEXT_MEMBERS = [
  "products",
  "productIntelligenceReport",
  "evidenceGraph",
  "discoveryAnalysis",
  "opportunityAnalysis",
  "trafficAnalysis",
  "decisionAnalysis",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

export const RECOMMENDATION_PRODUCT_MEMBERS = [
  "productIntelligenceReport",
  "evidenceGraph",
  "discoveryAnalysis",
  "opportunityAnalysis",
  "trafficAnalysis",
  "decisionAnalysis",
] as const;

export const RECOMMENDATION_GRAPH_KINDS = [
  "ProductFacts",
  "LandingPageEvidence",
  "SearchEvidence",
  "CompetitionEvidence",
  "CommercialEvidence",
] as const;

export interface RecommendationEvidenceItem {
  field: string;
  text: string;
}

export interface RecommendationRiskSummary {
  items: readonly string[];
  text: string;
}

export interface RecommendationReadinessSummary {
  discoveryStatus: string;
  opportunityStatus: string;
  trafficStatus: string;
  decisionStatus: string;
  text: string;
}

export const RECOMMENDATION_ENTRY_KEYS = [
  "productName",
  "candidateId",
  "level",
  "confidence",
  "positiveEvidence",
  "negativeEvidence",
  "missingEvidence",
  "riskSummary",
  "readinessSummary",
  "rankingPosition",
  "origin",
  "provenance",
] as const;

export interface RecommendationEntry {
  productName: string;
  candidateId: string;
  level: RecommendationLevel;
  confidence: number;
  positiveEvidence: readonly RecommendationEvidenceItem[];
  negativeEvidence: readonly RecommendationEvidenceItem[];
  missingEvidence: readonly string[];
  riskSummary: RecommendationRiskSummary;
  readinessSummary: RecommendationReadinessSummary;
  rankingPosition: number;
  origin: RecommendationOrigin;
  provenance: RecommendationProvenance;
}

export interface ProductRecommendation {
  recommendations: readonly RecommendationEntry[];
  ranking: readonly { candidateId: string; rankingPosition: number }[];
}

export const RECOMMENDATION_STATISTICS_KEYS = [
  "productCount",
  "executionCandidateCount",
  "holdCount",
  "insufficientCount",
  "executionTime",
] as const;

export interface RecommendationStatistics {
  productCount: number;
  executionCandidateCount: number;
  holdCount: number;
  insufficientCount: number;
  executionTime: number;
}

export const RECOMMENDATION_SNAPSHOT_KEYS = ["recommendationId", "productName", "rankingPosition", "createdAt", "metadata"] as const;

export interface RecommendationSnapshot {
  recommendationId: string;
  productName: string;
  rankingPosition: number;
  createdAt: string;
  metadata: RecommendationMetadata;
}

export interface RecommendationSnapshotInit {
  recommendationId: string;
  productName: string;
  rankingPosition: number;
  createdAt: string;
  metadata?: RecommendationMetadata;
}

export interface RecommendationResult {
  status: RecommendationStatus;
  issues: RecommendationIssue[];
  recommendation: ProductRecommendation | null;
  statistics: RecommendationStatistics | null;
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

export function copyPlainRecommendation<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainRecommendation(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainRecommendation(inner)])) as T;
  }
  return value;
}

export function createRecommendationSnapshot(init: RecommendationSnapshotInit): RecommendationSnapshot {
  return freezeDeepRecommendation({
    recommendationId: init.recommendationId,
    productName: init.productName,
    rankingPosition: init.rankingPosition,
    createdAt: init.createdAt,
    metadata: copyPlainRecommendation(init.metadata ?? {}),
  });
}

export function createRecommendationStatistics(init: RecommendationStatistics): RecommendationStatistics {
  return freezeDeepRecommendation({
    productCount: init.productCount,
    executionCandidateCount: init.executionCandidateCount,
    holdCount: init.holdCount,
    insufficientCount: init.insufficientCount,
    executionTime: init.executionTime,
  });
}
