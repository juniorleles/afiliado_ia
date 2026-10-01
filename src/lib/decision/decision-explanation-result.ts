/**
 * Decision Explanation Engine: input and output shapes.
 *
 * The input is the Resolver's analysis and nothing else. The analysis is a
 * snapshot of the run: it holds the rule results, the recorded executions,
 * and the execution and pipeline metadata. Explaining needs no rule to run
 * and no action to be taken.
 *
 * The output has exactly the fields below. There is no plan and no numeric
 * result, and the validator rejects any extra field.
 */
import type { DecisionIssue } from "./decision-validator";
import type { DecisionMetadata } from "./decision-types";
import type { DecisionRuleCategory, DecisionRuleResultStatus } from "./decision-rule-contract";
import type { ResolvedDecisionAnalysis } from "./decision-resolver-analysis";
import type { DecisionExplanationSection } from "./decision-explanation-section";

/** The whole input: the analysis a Resolver run produced. */
export type DecisionExplanationInput = ResolvedDecisionAnalysis;

export interface DecisionTraceEntry {
  ruleId: string;
  category: DecisionRuleCategory | null;
  status: DecisionRuleResultStatus;
  executionTime: number;
  /** One sentence restating how the rule ended. */
  statement: string;
}

export const DECISION_EXPLANATION_KEYS = [
  "analysisId",
  "candidateId",
  "summary",
  "sectionBreakdown",
  "decisionTrace",
  "blockingReasons",
  "eligibleActions",
  "warnings",
  "missingInformation",
  "metadata",
  "executionTime",
] as const;

export interface DecisionExplanation {
  analysisId: string;
  candidateId: string | null;
  /** The short summary: one paragraph, no judgement. */
  summary: string;
  /** The ten sections, in a fixed order. */
  sectionBreakdown: DecisionExplanationSection[];
  decisionTrace: DecisionTraceEntry[];
  blockingReasons: string[];
  eligibleActions: string[];
  warnings: string[];
  missingInformation: string[];
  /** Flat. */
  metadata: DecisionMetadata;
  /** Milliseconds this explanation took to build. */
  executionTime: number;
}

export const DECISION_EXPLANATION_OUTCOME_STATUSES = ["EXPLAINED", "REJECTED"] as const;
export type DecisionExplanationOutcomeStatus = (typeof DECISION_EXPLANATION_OUTCOME_STATUSES)[number];

/** What the engine hands back. It never throws: a rejected input is described, not explained. */
export interface DecisionExplanationOutcome {
  status: DecisionExplanationOutcomeStatus;
  explanation: DecisionExplanation | null;
  issues: DecisionIssue[];
}

/** Said at the end of every detailed explanation, and carried in the metadata. */
export const DECISION_EXPLANATION_SCOPE_NOTE =
  "This explanation restates what the Decision Analysis recorded. It does not execute a rule or an action.";
