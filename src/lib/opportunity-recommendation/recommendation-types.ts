/**
 * Host record domain: recommendation types.
 *
 * A recommendation names one type for each ranked opportunity.
 * The type comes from an explicit rule list. Metrics are copied, not measured.
 */
import { OPPORTUNITY_METRIC_KEYS, type OpportunityMetrics } from "../opportunity-scoring/opportunity-score-types";

export { OPPORTUNITY_METRIC_KEYS, type OpportunityMetrics };

export const RECOMMENDATION_STATUSES = ["OK", "REJECTED"] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export const RECOMMENDATION_ORIGINS = ["OBSERVED"] as const;
export type RecommendationOrigin = (typeof RECOMMENDATION_ORIGINS)[number];

export const RECOMMENDATION_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type RecommendationProvenance = (typeof RECOMMENDATION_PROVENANCE)[number];

export const RECOMMENDATION_TYPES = ["TEST_FIRST", "MONITOR", "WATCH", "SKIP", "MANUAL_REVIEW"] as const;
export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export const RECOMMENDATION_POLICY_IDS = ["balanced", "portfolio-coverage", "evidence-coverage"] as const;
export type RecommendationPolicyId = (typeof RECOMMENDATION_POLICY_IDS)[number];

export const NULLABLE_METRIC_KEYS = ["priceVariance", "languageConsistency", "serpCoverage"] as const;
export type NullableMetricKey = (typeof NULLABLE_METRIC_KEYS)[number];
export type MetricKey = (typeof OPPORTUNITY_METRIC_KEYS)[number];

export const CONDITION_KINDS = [
  "positionEquals",
  "positionAtMost",
  "positionAtLeast",
  "portfolioCountAtLeast",
  "portfolioCountAtMost",
  "metricAtLeast",
  "metricAtMost",
  "metricIsNull",
  "metricIsNumber",
] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];

export type RecommendationCondition =
  | { kind: "positionEquals"; value: number }
  | { kind: "positionAtMost"; value: number }
  | { kind: "positionAtLeast"; value: number }
  | { kind: "portfolioCountAtLeast"; value: number }
  | { kind: "portfolioCountAtMost"; value: number }
  | { kind: "metricAtLeast"; metricId: MetricKey; value: number }
  | { kind: "metricAtMost"; metricId: MetricKey; value: number }
  | { kind: "metricIsNull"; metricId: NullableMetricKey }
  | { kind: "metricIsNumber"; metricId: MetricKey };

export interface RecommendationRule {
  ruleId: string;
  recommendationType: RecommendationType;
  reason: string;
  conditions: readonly RecommendationCondition[];
}

export interface RecommendationPolicy {
  policyId: string;
  rules: readonly RecommendationRule[];
}

export interface RecommendationIssue {
  field: string;
  message: string;
}

export const RECOMMENDATION_CONFIDENCE_KEYS = ["matchedRuleCount", "ruleCount", "value"] as const;

export interface RecommendationConfidence {
  matchedRuleCount: number;
  ruleCount: number;
  value: number;
}

export interface SupportingMetric {
  metricId: MetricKey;
  value: number | null;
}

export interface TriggeredRule {
  ruleId: string;
  recommendationType: RecommendationType;
}

export interface ConditionResult {
  kind: ConditionKind;
  matched: boolean;
  actual: number | string | null;
  expected: number | string | null;
}

export interface RuleEvaluation {
  ruleId: string;
  matched: boolean;
  conditions: readonly ConditionResult[];
}

export interface OpportunityRecommendationEvidence {
  opportunityId: string;
  position: number;
  portfolioCount: number;
  portfolioIds: readonly string[];
  selectedRuleId: string;
  evaluations: readonly RuleEvaluation[];
}

export interface OpportunityRecommendation {
  opportunityId: string;
  position: number;
  recommendationType: RecommendationType;
  reason: string;
  evidence: OpportunityRecommendationEvidence;
  supportingMetrics: readonly SupportingMetric[];
  triggeredRules: readonly TriggeredRule[];
  confidence: RecommendationConfidence;
}
