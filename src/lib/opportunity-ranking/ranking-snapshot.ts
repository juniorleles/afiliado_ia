/**
 * Host record domain: opportunity ranking snapshot.
 *
 * A frozen copy of one ordering. Positions restate the policy order.
 * This module does not reach an outside system.
 */
import type { RankingMetadata } from "./ranking-context";
import type {
  OpportunityMetricRecord,
  RankedOpportunity,
  RankingOrigin,
  RankingProvenance,
  RankingRule,
  RankingStatus,
  RankingStep,
  RankingIssue,
} from "./ranking-types";

export const RANKING_EXECUTION_STATISTICS_KEYS = [
  "opportunityCount",
  "ruleCount",
  "tieCount",
  "issueCount",
  "executionTime",
] as const;

export interface RankingExecutionStatistics {
  opportunityCount: number;
  ruleCount: number;
  tieCount: number;
  issueCount: number;
  executionTime: number;
}

export const RANKING_CONTEXT_RECORD_KEYS = ["policyId", "opportunityIds", "orderedIds"] as const;

export interface RankingContextRecord {
  policyId: string;
  opportunityIds: readonly string[];
  orderedIds: readonly string[];
}

export const OPPORTUNITY_RANKING_KEYS = ["policyId", "ordered", "origin", "provenance"] as const;

export interface OpportunityRanking {
  policyId: string;
  ordered: readonly RankedOpportunity[];
  origin: RankingOrigin;
  provenance: RankingProvenance;
}

export const RANKING_EVIDENCE_KEYS = [
  "policyId",
  "rules",
  "nullPlacement",
  "tieBreak",
  "opportunities",
  "steps",
] as const;

export interface RankingEvidence {
  policyId: string;
  rules: readonly RankingRule[];
  nullPlacement: "after-measured";
  tieBreak: "opportunityId";
  opportunities: readonly OpportunityMetricRecord[];
  steps: readonly RankingStep[];
}

export const RANKING_SNAPSHOT_KEYS = [
  "rankingId",
  "ranking",
  "evidence",
  "statistics",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface RankingSnapshot {
  rankingId: string;
  ranking: OpportunityRanking;
  evidence: RankingEvidence;
  statistics: RankingExecutionStatistics;
  context: RankingContextRecord;
  createdAt: string;
  origin: RankingOrigin;
  provenance: RankingProvenance;
  metadata: RankingMetadata;
}

export const RANKING_RESULT_KEYS = [
  "status",
  "issues",
  "ranking",
  "evidence",
  "statistics",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface RankingResult {
  status: RankingStatus;
  issues: RankingIssue[];
  ranking: OpportunityRanking | null;
  evidence: RankingEvidence | null;
  statistics: RankingExecutionStatistics;
  snapshot: RankingSnapshot | null;
  metadata: RankingMetadata;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepRanking<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepRanking(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function createRankingExecutionStatistics(init: RankingExecutionStatistics): RankingExecutionStatistics {
  return freezeDeepRanking({
    opportunityCount: init.opportunityCount,
    ruleCount: init.ruleCount,
    tieCount: init.tieCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

export function createRankingSnapshot(init: {
  rankingId: string;
  ranking: OpportunityRanking;
  evidence: RankingEvidence;
  statistics: RankingExecutionStatistics;
  context: RankingContextRecord;
  createdAt: string;
  metadata?: RankingMetadata;
}): RankingSnapshot {
  return freezeDeepRanking({
    rankingId: init.rankingId,
    ranking: init.ranking,
    evidence: init.evidence,
    statistics: init.statistics,
    context: {
      policyId: init.context.policyId,
      opportunityIds: [...init.context.opportunityIds],
      orderedIds: [...init.context.orderedIds],
    },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
