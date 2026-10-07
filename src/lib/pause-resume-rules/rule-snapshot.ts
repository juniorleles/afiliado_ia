/**
 * Host record domain: pause and resume snapshot.
 *
 * A frozen copy of one action plan. Pending actions stay unexecuted.
 * Credential values are not members.
 */
import type { RuleMetadata } from "./rule-context";
import type { ApprovalState, PlanOutcome, RuleEvidenceRow, RuleIssue } from "./rule-types";

export const RULE_STATUSES = ["OK", "REJECTED"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export const RULE_ORIGINS = ["OBSERVED"] as const;
export type RuleOrigin = (typeof RULE_ORIGINS)[number];

export const RULE_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type RuleProvenance = (typeof RULE_PROVENANCE)[number];

export const EVIDENCE_ROW_KEYS = ["ruleId", "kind", "matched", "current", "threshold", "detail"] as const;

export const RECOMMENDATION_CITE_KEYS = ["recommendationId", "kind"] as const;

export interface RecommendationCite {
  recommendationId: string;
  kind: string;
}

export const RULE_EVIDENCE_KEYS = ["campaignResourceName", "currentWindow", "historicalWindow", "recommendations", "rows"] as const;

export interface RuleEvidence {
  campaignResourceName: string;
  currentWindow: string;
  historicalWindow: string;
  recommendations: RecommendationCite[];
  rows: RuleEvidenceRow[];
}

export const PENDING_ACTION_KEYS = ["actionId", "outcome", "approval", "executed", "reason", "triggeredRules", "evidence"] as const;

export interface PendingAction {
  actionId: string;
  outcome: PlanOutcome;
  approval: ApprovalState;
  executed: false;
  reason: string;
  triggeredRules: string[];
  evidence: { rows: RuleEvidenceRow[] };
}

export const ACTION_PLAN_KEYS = ["campaignResourceName", "campaignId", "status", "outcome", "pendingActions", "evidence"] as const;

export interface ActionPlan {
  campaignResourceName: string;
  campaignId: string;
  status: string;
  outcome: PlanOutcome;
  pendingActions: PendingAction[];
  evidence: RuleEvidence;
}

export const RULE_STATISTICS_KEYS = ["ruleCount", "matchedRuleCount", "pendingActionCount", "issueCount", "executionTime"] as const;

export interface RuleStatistics {
  ruleCount: number;
  matchedRuleCount: number;
  pendingActionCount: number;
  issueCount: number;
  executionTime: number;
}

export const RULE_CONTEXT_RECORD_KEYS = ["campaignResourceName", "currentWindow", "historicalWindow"] as const;

export interface RuleContextRecord {
  campaignResourceName: string;
  currentWindow: string;
  historicalWindow: string;
}

export const RULE_SNAPSHOT_KEYS = [
  "actionPlanId",
  "actionPlan",
  "pendingActions",
  "evidence",
  "statistics",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface RuleSnapshot {
  actionPlanId: string;
  actionPlan: ActionPlan;
  pendingActions: PendingAction[];
  evidence: RuleEvidence;
  statistics: RuleStatistics;
  context: RuleContextRecord;
  createdAt: string;
  origin: RuleOrigin;
  provenance: RuleProvenance;
  metadata: RuleMetadata;
}

export const RULE_RESULT_KEYS = [
  "status",
  "issues",
  "actionPlan",
  "pendingActions",
  "evidence",
  "statistics",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface RuleResult {
  status: RuleStatus;
  issues: RuleIssue[];
  actionPlan: ActionPlan | null;
  pendingActions: PendingAction[] | null;
  evidence: RuleEvidence | null;
  statistics: RuleStatistics;
  snapshot: RuleSnapshot | null;
  metadata: RuleMetadata;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepRules<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepRules(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function createRuleStatistics(init: RuleStatistics): RuleStatistics {
  return freezeDeepRules({
    ruleCount: init.ruleCount,
    matchedRuleCount: init.matchedRuleCount,
    pendingActionCount: init.pendingActionCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

function copyRow(row: RuleEvidenceRow): RuleEvidenceRow {
  return {
    ruleId: row.ruleId,
    kind: row.kind,
    matched: row.matched,
    current: row.current,
    threshold: row.threshold,
    detail: row.detail,
  };
}

function copyCite(cite: RecommendationCite): RecommendationCite {
  return { recommendationId: cite.recommendationId, kind: cite.kind };
}

function copyEvidence(evidence: RuleEvidence): RuleEvidence {
  return {
    campaignResourceName: evidence.campaignResourceName,
    currentWindow: evidence.currentWindow,
    historicalWindow: evidence.historicalWindow,
    recommendations: evidence.recommendations.map(copyCite),
    rows: evidence.rows.map(copyRow),
  };
}

function copyAction(action: PendingAction): PendingAction {
  return {
    actionId: action.actionId,
    outcome: action.outcome,
    approval: "REQUIRED",
    executed: false,
    reason: action.reason,
    triggeredRules: [...action.triggeredRules],
    evidence: { rows: action.evidence.rows.map(copyRow) },
  };
}

export function createRuleSnapshot(init: {
  actionPlanId: string;
  campaignResourceName: string;
  campaignId: string;
  status: string;
  outcome: PlanOutcome;
  pendingActions: PendingAction[];
  evidence: RuleEvidence;
  statistics: RuleStatistics;
  createdAt: string;
  metadata?: RuleMetadata;
}): RuleSnapshot {
  const pendingActions = init.pendingActions.map(copyAction);
  const evidence = copyEvidence(init.evidence);
  const actionPlan: ActionPlan = {
    campaignResourceName: init.campaignResourceName,
    campaignId: init.campaignId,
    status: init.status,
    outcome: init.outcome,
    pendingActions,
    evidence,
  };
  return freezeDeepRules({
    actionPlanId: init.actionPlanId,
    actionPlan,
    pendingActions,
    evidence,
    statistics: init.statistics,
    context: {
      campaignResourceName: init.campaignResourceName,
      currentWindow: init.evidence.currentWindow,
      historicalWindow: init.evidence.historicalWindow,
    },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
