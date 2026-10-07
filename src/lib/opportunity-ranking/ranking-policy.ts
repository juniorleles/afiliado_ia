/**
 * Host record domain: ranking policies.
 *
 * A policy is an ordered list of existing metrics and a direction for each.
 * Named policies differ only by that order. A custom policy supplies its own
 * list. No policy measures a new value.
 */
import { OPPORTUNITY_METRIC_KEYS } from "../opportunity-scoring/opportunity-score-types";
import {
  RANKING_POLICY_IDS,
  RANKING_TIE_BREAK,
  type OpportunityMetricRecord,
  type RankingDirection,
  type RankingPolicy,
  type RankingPolicyId,
  type RankingRule,
  type RankingStep,
} from "./ranking-types";

const HIGHER = "higher" as const;
const LOWER = "lower" as const;

function rule(metricId: RankingRule["metricId"], direction: RankingDirection): RankingRule {
  return { metricId, direction };
}

const BALANCED_RULES: readonly RankingRule[] = [
  rule("evidenceCompleteness", HIGHER),
  rule("languageConsistency", HIGHER),
  rule("serpCoverage", HIGHER),
  rule("observedProductCount", HIGHER),
  rule("observedBrandCount", HIGHER),
  rule("observedCategoryCount", HIGHER),
  rule("uniqueLandingPageCount", HIGHER),
  rule("uniqueDomainCount", HIGHER),
  rule("sponsoredAdvertiserCount", HIGHER),
  rule("priceVariance", LOWER),
];

function moveFront(front: readonly RankingRule[]): readonly RankingRule[] {
  const frontIds = new Set(front.map((item) => item.metricId));
  return [...front, ...BALANCED_RULES.filter((item) => !frontIds.has(item.metricId))];
}

const POLICIES: Record<RankingPolicyId, readonly RankingRule[]> = {
  balanced: BALANCED_RULES,
  "competition-first": moveFront([rule("sponsoredAdvertiserCount", HIGHER), rule("uniqueDomainCount", HIGHER)]),
  "low-competition": moveFront([rule("sponsoredAdvertiserCount", LOWER), rule("uniqueDomainCount", LOWER)]),
  "high-commercial-intent": moveFront([
    rule("observedProductCount", HIGHER),
    rule("observedCategoryCount", HIGHER),
    rule("observedBrandCount", HIGHER),
    rule("serpCoverage", HIGHER),
    rule("evidenceCompleteness", HIGHER),
  ]),
};

export function isRankingPolicyId(value: string): value is RankingPolicyId {
  return (RANKING_POLICY_IDS as readonly string[]).includes(value);
}

export function rulesForPolicy(policyId: RankingPolicyId): readonly RankingRule[] {
  return POLICIES[policyId].map((item) => ({ metricId: item.metricId, direction: item.direction }));
}

export function isKnownMetricId(value: string): value is RankingRule["metricId"] {
  return (OPPORTUNITY_METRIC_KEYS as readonly string[]).includes(value);
}

function metricValue(record: OpportunityMetricRecord, metricId: RankingRule["metricId"]): number | null {
  return record.metrics[metricId];
}

function compareMeasured(ahead: number, behind: number, direction: RankingDirection): number {
  if (ahead === behind) return 0;
  if (direction === "higher") return ahead > behind ? -1 : 1;
  return ahead < behind ? -1 : 1;
}

export function compareOpportunities(ahead: OpportunityMetricRecord, behind: OpportunityMetricRecord, rules: readonly RankingRule[]): number {
  for (const item of rules) {
    const left = metricValue(ahead, item.metricId);
    const right = metricValue(behind, item.metricId);
    if (left === null && right === null) continue;
    if (left === null) return 1;
    if (right === null) return -1;
    const compared = compareMeasured(left, right, item.direction);
    if (compared !== 0) return compared;
  }
  if (ahead.opportunityId < behind.opportunityId) return -1;
  if (ahead.opportunityId > behind.opportunityId) return 1;
  return 0;
}

export function stepBetween(ahead: OpportunityMetricRecord, behind: OpportunityMetricRecord, rules: readonly RankingRule[]): RankingStep {
  for (let index = 0; index < rules.length; index += 1) {
    const item = rules[index] as RankingRule;
    const left = metricValue(ahead, item.metricId);
    const right = metricValue(behind, item.metricId);
    if (left === null && right === null) continue;
    if (left === null || right === null || compareMeasured(left, right, item.direction) !== 0) {
      return {
        aheadId: ahead.opportunityId,
        behindId: behind.opportunityId,
        ruleIndex: index,
        decidedBy: item.metricId,
        direction: item.direction,
        aheadValue: left,
        behindValue: right,
      };
    }
  }
  return {
    aheadId: ahead.opportunityId,
    behindId: behind.opportunityId,
    ruleIndex: rules.length,
    decidedBy: RANKING_TIE_BREAK,
    direction: "ascending",
    aheadValue: ahead.opportunityId,
    behindValue: behind.opportunityId,
  };
}

export function resolvePolicy(policy: RankingPolicy): RankingPolicy {
  return {
    policyId: policy.policyId,
    rules: policy.rules.map((item) => ({ metricId: item.metricId, direction: item.direction })),
  };
}
