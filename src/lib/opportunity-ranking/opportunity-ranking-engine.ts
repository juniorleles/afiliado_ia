/**
 * Host record domain: opportunity ranking engine.
 *
 * One entry point from opportunity metrics and a policy to a frozen order.
 * It stores snapshots in memory. A refused ranking returns REJECTED and
 * stores nothing. This method never throws.
 */
import type { RankingMetadata } from "./ranking-context";
import { compareOpportunities, isRankingPolicyId, resolvePolicy, rulesForPolicy, stepBetween } from "./ranking-policy";
import {
  createRankingExecutionStatistics,
  createRankingSnapshot,
  freezeDeepRanking,
  type RankingResult,
  type RankingSnapshot,
} from "./ranking-snapshot";
import {
  OPPORTUNITY_METRIC_KEYS,
  RANKING_NULL_PLACEMENT,
  RANKING_TIE_BREAK,
  type OpportunityMetricRecord,
  type OpportunityMetrics,
  type RankingPolicy,
  type RankingRule,
} from "./ranking-types";
import { createRankingValidator, type RankingValidator } from "./ranking-validator";

export type RankingClock = () => number;
export type RankingTimestamp = () => string;
export type RankingIdFactory = () => string;

export interface OpportunityRankingEngineOptions {
  now?: RankingClock;
  timestamp?: RankingTimestamp;
  idFactory?: RankingIdFactory;
  validator?: RankingValidator;
}

export interface OpportunityRankingEngine {
  readonly validator: RankingValidator;
  rank(input: unknown): RankingResult;
  getSnapshot(rankingId: string): RankingSnapshot | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copyMetrics(metrics: Record<string, unknown>): OpportunityMetrics {
  const out = {} as Record<string, number | null>;
  for (const key of OPPORTUNITY_METRIC_KEYS) out[key] = metrics[key] as number | null;
  return out as unknown as OpportunityMetrics;
}

function recordsOf(opportunities: readonly unknown[]): OpportunityMetricRecord[] {
  return opportunities.map((item) => {
    const record = item as Record<string, unknown>;
    return {
      opportunityId: (record.opportunityId as string).trim(),
      metrics: copyMetrics(record.metrics as Record<string, unknown>),
    };
  });
}

function policyOf(policy: unknown): RankingPolicy {
  if (typeof policy === "string" && isRankingPolicyId(policy)) {
    return { policyId: policy, rules: rulesForPolicy(policy) };
  }
  const record = policy as Record<string, unknown>;
  return resolvePolicy({
    policyId: (record.policyId as string).trim(),
    rules: (record.rules as RankingRule[]).map((rule) => ({ metricId: rule.metricId, direction: rule.direction })),
  });
}

export function createOpportunityRankingEngine(options: OpportunityRankingEngineOptions = {}): OpportunityRankingEngine {
  const validator = options.validator ?? createRankingValidator();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `opportunity-ranking-${++serial}`);
  const snapshots = new Map<string, RankingSnapshot>();

  return {
    validator,
    rank(input) {
      const started = now();
      const refused = (issues: RankingResult["issues"], metadata: RankingMetadata = {}): RankingResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepRanking({
          status: "REJECTED",
          issues,
          ranking: null,
          evidence: null,
          statistics: createRankingExecutionStatistics({
            opportunityCount: 0,
            ruleCount: 0,
            tieCount: 0,
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
        const rankingId = idFactory();
        const metadata = isRecord(input.executionMetadata) ? { ...input.executionMetadata } as RankingMetadata : {};
        const policy = policyOf(input.policy);
        const records = recordsOf(input.opportunities as readonly unknown[]);
        const orderedRecords = records.slice().sort((ahead, behind) => compareOpportunities(ahead, behind, policy.rules));
        const ordered = orderedRecords.map((record, index) => ({ position: index + 1, opportunityId: record.opportunityId }));
        const steps = orderedRecords.slice(1).map((behind, index) => stepBetween(orderedRecords[index] as OpportunityMetricRecord, behind, policy.rules));
        const executionTime = Math.max(0, now() - started);
        const statistics = createRankingExecutionStatistics({
          opportunityCount: ordered.length,
          ruleCount: policy.rules.length,
          tieCount: steps.filter((step) => step.decidedBy === RANKING_TIE_BREAK).length,
          issueCount: 0,
          executionTime,
        });
        const snapshot = createRankingSnapshot({
          rankingId,
          ranking: {
            policyId: policy.policyId,
            ordered,
            origin: "OBSERVED",
            provenance: "DIRECT_SOURCE",
          },
          evidence: {
            policyId: policy.policyId,
            rules: policy.rules,
            nullPlacement: RANKING_NULL_PLACEMENT,
            tieBreak: RANKING_TIE_BREAK,
            opportunities: records,
            steps,
          },
          statistics,
          context: {
            policyId: policy.policyId,
            opportunityIds: records.map((record) => record.opportunityId),
            orderedIds: ordered.map((item) => item.opportunityId),
          },
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata);
        snapshots.set(snapshot.rankingId, snapshot);
        return freezeDeepRanking({
          status: "OK",
          issues: [],
          ranking: snapshot.ranking,
          evidence: snapshot.evidence,
          statistics: snapshot.statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "ranking", message: "Invalid Metadata: the ranking could not restate the order." }]);
      }
    },
    getSnapshot: (rankingId) => snapshots.get(rankingId) ?? null,
  };
}
