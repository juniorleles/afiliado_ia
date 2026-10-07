/**
 * Host record domain: opportunity ranking types.
 *
 * A ranking orders supplied metrics. It does not measure a new value.
 */
import { OPPORTUNITY_METRIC_KEYS, type OpportunityMetrics } from "../opportunity-scoring/opportunity-score-types";

export { OPPORTUNITY_METRIC_KEYS, type OpportunityMetrics };

export const RANKING_STATUSES = ["OK", "REJECTED"] as const;
export type RankingStatus = (typeof RANKING_STATUSES)[number];

export const RANKING_ORIGINS = ["OBSERVED"] as const;
export type RankingOrigin = (typeof RANKING_ORIGINS)[number];

export const RANKING_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type RankingProvenance = (typeof RANKING_PROVENANCE)[number];

export const RANKING_DIRECTIONS = ["higher", "lower"] as const;
export type RankingDirection = (typeof RANKING_DIRECTIONS)[number];

export const RANKING_NULL_PLACEMENT = "after-measured" as const;
export const RANKING_TIE_BREAK = "opportunityId" as const;

export const NULLABLE_METRIC_KEYS = ["priceVariance", "languageConsistency", "serpCoverage"] as const;

export interface RankingIssue {
  field: string;
  message: string;
}

export interface RankingRule {
  metricId: (typeof OPPORTUNITY_METRIC_KEYS)[number];
  direction: RankingDirection;
}

export const RANKING_POLICY_IDS = ["balanced", "competition-first", "low-competition", "high-commercial-intent"] as const;
export type RankingPolicyId = (typeof RANKING_POLICY_IDS)[number];

export interface RankingPolicy {
  policyId: string;
  rules: readonly RankingRule[];
}

export interface RankedOpportunity {
  position: number;
  opportunityId: string;
}

export interface RankingStep {
  aheadId: string;
  behindId: string;
  ruleIndex: number;
  decidedBy: string;
  direction: RankingDirection | "ascending";
  aheadValue: number | string | null;
  behindValue: number | string | null;
}

export interface OpportunityMetricRecord {
  opportunityId: string;
  metrics: OpportunityMetrics;
}
