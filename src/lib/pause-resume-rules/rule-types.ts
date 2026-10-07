/**
 * Host record domain: pause and resume rule vocabulary.
 *
 * Kinds, actions, and the read-only view one evaluation may see.
 * Nothing here is sent to an ads account.
 */
import type { CampaignMetrics } from "../optimization-metrics/metrics-snapshot";
import type { OptimizationRecommendationSet } from "../optimization-recommendation/optimization-snapshot";
import type { PerformanceReport } from "../performance-analysis/performance-snapshot";

export const PLAN_OUTCOMES = [
  "Pause Candidate",
  "Resume Candidate",
  "No Action",
  "Manual Review Required",
  "Rule Conflict",
] as const;

export type PlanOutcome = (typeof PLAN_OUTCOMES)[number];

export const RULE_ACTIONS = ["PAUSE", "RESUME"] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

export const OPERATIONAL_RULE_KINDS = [
  "ZERO_IMPRESSIONS",
  "POLICY_REJECTED",
  "COST_THRESHOLD",
  "NO_CLICKS",
  "NO_CONVERSIONS",
  "MANUALLY_LOCKED",
  "MANUALLY_EXCLUDED",
] as const;

export type OperationalRuleKind = (typeof OPERATIONAL_RULE_KINDS)[number];

export const OPERATIONAL_RULE_IDS = [
  "zero-impressions",
  "policy-rejected",
  "cost-threshold",
  "no-clicks",
  "no-conversions",
  "manually-locked",
  "manually-excluded",
] as const;

export type OperationalRuleId = (typeof OPERATIONAL_RULE_IDS)[number];

export const RULE_KIND_BY_ID: Record<OperationalRuleId, OperationalRuleKind> = {
  "zero-impressions": "ZERO_IMPRESSIONS",
  "policy-rejected": "POLICY_REJECTED",
  "cost-threshold": "COST_THRESHOLD",
  "no-clicks": "NO_CLICKS",
  "no-conversions": "NO_CONVERSIONS",
  "manually-locked": "MANUALLY_LOCKED",
  "manually-excluded": "MANUALLY_EXCLUDED",
};

export const APPROVAL_STATES = ["REQUIRED"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export interface RuleIssue {
  field: string;
  message: string;
}

export const OPERATIONAL_RULE_KEYS = ["id", "kind", "enabled", "action", "threshold"] as const;

export const OPERATIONAL_RULES_KEYS = ["locked", "excluded", "observedPeriodDays", "policyApprovalStatus", "rules"] as const;

export const INTEGER_THRESHOLD_KINDS = ["ZERO_IMPRESSIONS", "NO_CLICKS"] as const;

export const COST_THRESHOLD_KINDS = ["COST_THRESHOLD", "NO_CONVERSIONS"] as const;

export interface OperationalRule {
  id: OperationalRuleId;
  kind: OperationalRuleKind;
  enabled: boolean;
  action: RuleAction;
  threshold: number | null;
}

export interface OperationalRules {
  locked: boolean;
  excluded: boolean;
  observedPeriodDays: number | null;
  policyApprovalStatus: string | null;
  rules: OperationalRule[];
}

export interface RuleView {
  recommendationSet: OptimizationRecommendationSet;
  report: PerformanceReport;
  campaign: CampaignMetrics;
  operationalRules: OperationalRules;
}

export interface RuleEvidenceRow {
  ruleId: OperationalRuleId;
  kind: OperationalRuleKind;
  matched: boolean;
  current: number | null;
  threshold: number | null;
  detail: string;
}

export interface CheckedRule {
  rule: OperationalRule;
  state: "matched" | "clear" | "unevaluable";
  row: RuleEvidenceRow;
}
