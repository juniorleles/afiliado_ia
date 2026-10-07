/**
 * Host record domain: recommendation engine.
 *
 * One entry point from a ranking, a portfolio, metrics, and a policy to a
 * frozen recommendation set. It stores snapshots in memory. A refused run
 * returns REJECTED and stores nothing. This method never throws.
 */
import type { RecommendationMetadata } from "./recommendation-context";
import { isRecommendationPolicyId, resolveRecommendationPolicy, rulesForRecommendationPolicy } from "./recommendation-policy";
import {
  createRecommendationSnapshot,
  createRecommendationStatistics,
  freezeDeepRecommendation,
  type RecommendationResult,
  type RecommendationSnapshot,
  type RecommendationStatistics,
} from "./recommendation-snapshot";
import {
  OPPORTUNITY_METRIC_KEYS,
  type ConditionResult,
  type MetricKey,
  type OpportunityMetrics,
  type OpportunityRecommendation,
  type OpportunityRecommendationEvidence,
  type RecommendationCondition,
  type RecommendationPolicy,
  type RecommendationRule,
  type SupportingMetric,
} from "./recommendation-types";
import { createRecommendationValidator, type RecommendationValidator } from "./recommendation-validator";

export type RecommendationClock = () => number;
export type RecommendationTimestamp = () => string;
export type RecommendationIdFactory = () => string;

export interface OpportunityRecommendationEngineOptions {
  now?: RecommendationClock;
  timestamp?: RecommendationTimestamp;
  idFactory?: RecommendationIdFactory;
  validator?: RecommendationValidator;
}

export interface OpportunityRecommendationEngine {
  readonly validator: RecommendationValidator;
  recommend(input: unknown): RecommendationResult;
  getSnapshot(recommendationId: string): RecommendationSnapshot | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copyMetrics(metrics: Record<string, unknown>): OpportunityMetrics {
  const out = {} as Record<string, number | null>;
  for (const key of OPPORTUNITY_METRIC_KEYS) out[key] = metrics[key] as number | null;
  return out as unknown as OpportunityMetrics;
}

function policyOf(policy: unknown): RecommendationPolicy {
  if (typeof policy === "string" && isRecommendationPolicyId(policy)) {
    return { policyId: policy, rules: rulesForRecommendationPolicy(policy) };
  }
  const record = policy as Record<string, unknown>;
  return resolveRecommendationPolicy({
    policyId: (record.policyId as string).trim(),
    rules: record.rules as RecommendationRule[],
  });
}

interface PreparedOpportunity {
  opportunityId: string;
  position: number;
  portfolioIds: string[];
  metrics: OpportunityMetrics;
}

function prepare(input: Record<string, unknown>): PreparedOpportunity[] {
  const ranking = input.ranking as Record<string, unknown>;
  const portfolio = input.portfolio as Record<string, unknown>;
  const groups = portfolio.portfolios as readonly Record<string, unknown>[];
  const metrics = input.metrics as readonly Record<string, unknown>[];
  const byId = new Map<string, OpportunityMetrics>();
  for (const item of metrics) byId.set((item.opportunityId as string).trim(), copyMetrics(item.metrics as Record<string, unknown>));
  return (ranking.ordered as readonly Record<string, unknown>[]).map((item) => {
    const opportunityId = (item.opportunityId as string).trim();
    const portfolioIds: string[] = [];
    for (const group of groups) {
      const members = group.opportunityIds as readonly string[];
      if (members.includes(opportunityId)) portfolioIds.push(group.portfolioId as string);
    }
    return {
      opportunityId,
      position: item.position as number,
      portfolioIds,
      metrics: byId.get(opportunityId) as OpportunityMetrics,
    };
  });
}

function metricValue(metrics: OpportunityMetrics, metricId: MetricKey): number | null {
  return metrics[metricId];
}

function compareCondition(condition: RecommendationCondition, item: PreparedOpportunity): ConditionResult {
  if (condition.kind === "positionEquals" || condition.kind === "positionAtMost" || condition.kind === "positionAtLeast") {
    const matched =
      condition.kind === "positionEquals"
        ? item.position === condition.value
        : condition.kind === "positionAtMost"
          ? item.position <= condition.value
          : item.position >= condition.value;
    return { kind: condition.kind, matched, actual: item.position, expected: condition.value };
  }
  if (condition.kind === "portfolioCountAtLeast" || condition.kind === "portfolioCountAtMost") {
    const count = item.portfolioIds.length;
    const matched = condition.kind === "portfolioCountAtLeast" ? count >= condition.value : count <= condition.value;
    return { kind: condition.kind, matched, actual: count, expected: condition.value };
  }
  if (condition.kind === "metricAtLeast" || condition.kind === "metricAtMost") {
    const actual = metricValue(item.metrics, condition.metricId);
    const matched = actual !== null && (condition.kind === "metricAtLeast" ? actual >= condition.value : actual <= condition.value);
    return { kind: condition.kind, matched, actual, expected: condition.value };
  }
  if (condition.kind === "metricIsNull") {
    const actual = metricValue(item.metrics, condition.metricId);
    return { kind: condition.kind, matched: actual === null, actual, expected: null };
  }
  const actual = metricValue(item.metrics, condition.metricId);
  return { kind: condition.kind, matched: typeof actual === "number", actual, expected: "number" };
}

function supportingMetricsOf(rule: RecommendationRule, metrics: OpportunityMetrics): SupportingMetric[] {
  const seen = new Set<MetricKey>();
  const out: SupportingMetric[] = [];
  for (const condition of rule.conditions) {
    if (!("metricId" in condition) || seen.has(condition.metricId)) continue;
    seen.add(condition.metricId);
    out.push({ metricId: condition.metricId, value: metricValue(metrics, condition.metricId) });
  }
  return out;
}

function recommendOne(item: PreparedOpportunity, rules: readonly RecommendationRule[]): OpportunityRecommendation | null {
  const evaluations = rules.map((rule) => {
    const conditions = rule.conditions.map((condition) => compareCondition(condition, item));
    return { ruleId: rule.ruleId, matched: conditions.every((condition) => condition.matched), conditions };
  });
  const selectedIndex = evaluations.findIndex((evaluation) => evaluation.matched);
  if (selectedIndex < 0) return null;
  const selected = rules[selectedIndex] as RecommendationRule;
  const matchedRuleCount = evaluations.filter((evaluation) => evaluation.matched).length;
  const evidence: OpportunityRecommendationEvidence = {
    opportunityId: item.opportunityId,
    position: item.position,
    portfolioCount: item.portfolioIds.length,
    portfolioIds: [...item.portfolioIds],
    selectedRuleId: selected.ruleId,
    evaluations,
  };
  return {
    opportunityId: item.opportunityId,
    position: item.position,
    recommendationType: selected.recommendationType,
    reason: selected.reason,
    evidence,
    supportingMetrics: supportingMetricsOf(selected, item.metrics),
    triggeredRules: evaluations
      .filter((evaluation) => evaluation.matched)
      .map((evaluation) => {
        const rule = rules.find((candidate) => candidate.ruleId === evaluation.ruleId) as RecommendationRule;
        return { ruleId: rule.ruleId, recommendationType: rule.recommendationType };
      }),
    confidence: {
      matchedRuleCount,
      ruleCount: rules.length,
      value: Number((matchedRuleCount / rules.length).toFixed(6)),
    },
  };
}

function countOf(recommendations: readonly OpportunityRecommendation[]): Pick<RecommendationStatistics, "testFirstCount" | "monitorCount" | "watchCount" | "skipCount" | "manualReviewCount"> {
  return {
    testFirstCount: recommendations.filter((item) => item.recommendationType === "TEST_FIRST").length,
    monitorCount: recommendations.filter((item) => item.recommendationType === "MONITOR").length,
    watchCount: recommendations.filter((item) => item.recommendationType === "WATCH").length,
    skipCount: recommendations.filter((item) => item.recommendationType === "SKIP").length,
    manualReviewCount: recommendations.filter((item) => item.recommendationType === "MANUAL_REVIEW").length,
  };
}

export function createOpportunityRecommendationEngine(options: OpportunityRecommendationEngineOptions = {}): OpportunityRecommendationEngine {
  const validator = options.validator ?? createRecommendationValidator();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `opportunity-recommendation-${++serial}`);
  const snapshots = new Map<string, RecommendationSnapshot>();

  return {
    validator,
    recommend(input) {
      const started = now();
      const refused = (issues: RecommendationResult["issues"], metadata: RecommendationMetadata = {}): RecommendationResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepRecommendation({
          status: "REJECTED",
          issues,
          recommendations: null,
          evidence: null,
          statistics: createRecommendationStatistics({
            opportunityCount: 0,
            recommendationCount: 0,
            testFirstCount: 0,
            monitorCount: 0,
            watchCount: 0,
            skipCount: 0,
            manualReviewCount: 0,
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
        const recommendationId = idFactory();
        const metadata = isRecord(input.executionMetadata) ? ({ ...input.executionMetadata } as RecommendationMetadata) : {};
        const policy = policyOf(input.policy);
        const prepared = prepare(input);
        const recommendations: OpportunityRecommendation[] = [];
        for (const item of prepared) {
          const recommendation = recommendOne(item, policy.rules);
          if (recommendation === null) {
            return refused([{ field: "policy", message: "Invalid Recommendation Policy: no rule matched an opportunity." }], metadata);
          }
          recommendations.push(recommendation);
        }
        const executionTime = Math.max(0, now() - started);
        const counts = countOf(recommendations);
        const statistics = createRecommendationStatistics({
          opportunityCount: prepared.length,
          recommendationCount: recommendations.length,
          ...counts,
          issueCount: 0,
          executionTime,
        });
        const snapshot = createRecommendationSnapshot({
          recommendationId,
          recommendations: {
            policyId: policy.policyId,
            recommendations,
            origin: "OBSERVED",
            provenance: "DIRECT_SOURCE",
          },
          evidence: {
            policyId: policy.policyId,
            rules: policy.rules,
            opportunities: recommendations.map((item) => item.evidence),
          },
          statistics,
          context: {
            policyId: policy.policyId,
            opportunityIds: prepared.map((item) => item.opportunityId),
          },
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata);
        snapshots.set(snapshot.recommendationId, snapshot);
        return freezeDeepRecommendation({
          status: "OK",
          issues: [],
          recommendations: snapshot.recommendations,
          evidence: snapshot.evidence,
          statistics: snapshot.statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "recommendations", message: "Invalid Metadata: the recommendation could not restate the rules." }]);
      }
    },
    getSnapshot: (recommendationId) => snapshots.get(recommendationId) ?? null,
  };
}
