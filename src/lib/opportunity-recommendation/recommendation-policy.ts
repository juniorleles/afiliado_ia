/**
 * Host record domain: recommendation policies.
 *
 * A policy is an ordered list of rules. The first rule whose comparisons all
 * hold supplies the type. Later matches stay visible and do not replace it.
 * Named policies differ by that order. A custom policy supplies its own list.
 */
import {
  NULLABLE_METRIC_KEYS,
  OPPORTUNITY_METRIC_KEYS,
  type MetricKey,
  type RecommendationCondition,
  type RecommendationPolicy,
  type RecommendationPolicyId,
  type RecommendationRule,
  type RecommendationType,
} from "./recommendation-types";

function rule(ruleId: string, recommendationType: RecommendationType, reason: string, conditions: readonly RecommendationCondition[]): RecommendationRule {
  return { ruleId, recommendationType, reason, conditions };
}

const NULL_RULES: readonly RecommendationRule[] = [
  rule("manual-price", "MANUAL_REVIEW", "Price variance was not measured.", [{ kind: "metricIsNull", metricId: "priceVariance" }]),
  rule("manual-language", "MANUAL_REVIEW", "Language consistency was not measured.", [{ kind: "metricIsNull", metricId: "languageConsistency" }]),
  rule("manual-serp", "MANUAL_REVIEW", "SERP coverage was not measured.", [{ kind: "metricIsNull", metricId: "serpCoverage" }]),
];

const SKIP: RecommendationRule = rule("skip", "SKIP", "No earlier rule matched.", []);

const POLICIES: Record<RecommendationPolicyId, readonly RecommendationRule[]> = {
  balanced: [
    rule("test-first", "TEST_FIRST", "Position 1, complete evidence, and at least one portfolio.", [
      { kind: "positionEquals", value: 1 },
      { kind: "metricAtLeast", metricId: "evidenceCompleteness", value: 1 },
      { kind: "portfolioCountAtLeast", value: 1 },
    ]),
    rule("monitor", "MONITOR", "Position at most 3, evidence completeness at least 0.5, and at least one portfolio.", [
      { kind: "positionAtMost", value: 3 },
      { kind: "metricAtLeast", metricId: "evidenceCompleteness", value: 0.5 },
      { kind: "portfolioCountAtLeast", value: 1 },
    ]),
    rule("watch", "WATCH", "At least one portfolio and numeric evidence completeness.", [
      { kind: "portfolioCountAtLeast", value: 1 },
      { kind: "metricIsNumber", metricId: "evidenceCompleteness" },
    ]),
    ...NULL_RULES,
    SKIP,
  ],
  "portfolio-coverage": [
    rule("test-first", "TEST_FIRST", "Position 1 and at least two portfolios.", [
      { kind: "positionEquals", value: 1 },
      { kind: "portfolioCountAtLeast", value: 2 },
    ]),
    rule("monitor", "MONITOR", "At least two portfolios.", [{ kind: "portfolioCountAtLeast", value: 2 }]),
    rule("watch", "WATCH", "At least one portfolio.", [{ kind: "portfolioCountAtLeast", value: 1 }]),
    rule("manual-review", "MANUAL_REVIEW", "No portfolio contains this opportunity.", [{ kind: "portfolioCountAtMost", value: 0 }]),
    SKIP,
  ],
  "evidence-coverage": [
    rule("test-first", "TEST_FIRST", "Position 1, complete evidence, and at least one observed product.", [
      { kind: "positionEquals", value: 1 },
      { kind: "metricAtLeast", metricId: "evidenceCompleteness", value: 1 },
      { kind: "metricAtLeast", metricId: "observedProductCount", value: 1 },
    ]),
    rule("monitor", "MONITOR", "Evidence completeness is at least 0.8.", [{ kind: "metricAtLeast", metricId: "evidenceCompleteness", value: 0.8 }]),
    rule("watch", "WATCH", "Evidence completeness is at least 0.5.", [{ kind: "metricAtLeast", metricId: "evidenceCompleteness", value: 0.5 }]),
    ...NULL_RULES,
    SKIP,
  ],
};

export function isRecommendationPolicyId(value: string): value is RecommendationPolicyId {
  return (["balanced", "portfolio-coverage", "evidence-coverage"] as readonly string[]).includes(value);
}

export function isMetricKey(value: string): value is MetricKey {
  return (OPPORTUNITY_METRIC_KEYS as readonly string[]).includes(value);
}

export function isNullableMetricKey(value: string): boolean {
  return (NULLABLE_METRIC_KEYS as readonly string[]).includes(value);
}

export function rulesForRecommendationPolicy(policyId: RecommendationPolicyId): readonly RecommendationRule[] {
  return POLICIES[policyId].map((item) => ({
    ruleId: item.ruleId,
    recommendationType: item.recommendationType,
    reason: item.reason,
    conditions: item.conditions.map((condition) => ({ ...condition })),
  }));
}

export function resolveRecommendationPolicy(policy: RecommendationPolicy): RecommendationPolicy {
  return {
    policyId: policy.policyId,
    rules: policy.rules.map((item) => ({
      ruleId: item.ruleId,
      recommendationType: item.recommendationType,
      reason: item.reason,
      conditions: item.conditions.map((condition) => ({ ...condition })),
    })),
  };
}
