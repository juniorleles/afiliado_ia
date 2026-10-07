/**
 * Decision Resolver: the unified Decision Analysis snapshot.
 *
 * What one run hands back: which dimensions ran, which rules ran, which
 * failed, and how blocking rules, conflicting rules, missing evidence,
 * skipped rules, and warnings were resolved. It is also a snapshot of the
 * run. Anything that wants to inspect a run reads this snapshot; nothing
 * needs to execute a rule again. The Resolver is the only place a run is
 * executed.
 *
 * The snapshot is plain data and deeply frozen. It is held in memory:
 * nothing here writes anywhere. It never names an execution plan and never
 * lists actions to run.
 *
 * Not to be confused with DecisionAnalysis (decision-types.ts), the earlier
 * engine-contract record of an analysis's lifecycle. This is the resolver's
 * output and is named ResolvedDecisionAnalysis to keep the two apart.
 */
import type { DecisionRuleCategory, DecisionRuleResultStatus, DecisionRuleRunResult } from "./decision-rule-contract";
import type { DecisionMetadata, DecisionStatus } from "./decision-types";

export const DECISION_RESOLUTION_STATUSES = ["REFUSED", "BLOCKED", "CONFLICT", "INCOMPLETE", "WARNING", "CLEARED"] as const;
export type DecisionResolutionStatus = (typeof DECISION_RESOLUTION_STATUSES)[number];

export const RESOLVED_DECISION_ANALYSIS_KEYS = [
  "analysisId",
  "candidateId",
  "status",
  "decisionStatus",
  "executedDimensions",
  "executedRules",
  "failedRules",
  "warnings",
  "errors",
  "metadata",
  "executionTime",
  "startedAt",
  "completedAt",
  "opportunityAnalysisId",
  "trafficAnalysisId",
  "pageAnalysisId",
  "ruleResults",
  "recordedExecutions",
  "executionMetadata",
  "pipelineMetadata",
  "blockingRules",
  "conflictingRules",
  "missingEvidence",
  "skippedRules",
] as const;

/** One rule execution as the recorder kept it. The recorder never runs the rule. */
export interface RecordedDecisionExecution {
  readonly ruleId: string;
  readonly category: DecisionRuleCategory;
  readonly status: DecisionRuleResultStatus;
  readonly executionTime: number;
}

export interface ResolvedDecisionAnalysis {
  analysisId: string;
  /** The Discovery candidate analyzed; null only when a run was refused for lacking one. */
  candidateId: string | null;
  /** Lifecycle of this analysis. COMPLETED and FAILED are final. */
  status: DecisionStatus;
  /** How blocking rules, conflicts, missing evidence, skips, and warnings resolved. */
  decisionStatus: DecisionResolutionStatus;
  /** Dimensions whose rules ran in this run, in pipeline order. */
  executedDimensions: DecisionRuleCategory[];
  /** Rules that ran to a result: PASS, FAIL, or WARNING. Skipped rules are not included. */
  executedRules: string[];
  /** The executed rules that failed, or whose result was rejected as invalid. */
  failedRules: string[];
  warnings: string[];
  errors: string[];
  /** Flat. Per-rule status and timing are carried here under `rule.<id>.`. */
  metadata: DecisionMetadata;
  /** Milliseconds for the whole run. */
  executionTime: number;

  // ---------- the snapshot ----------

  /** ISO timestamp. */
  startedAt: string;
  /** ISO timestamp. */
  completedAt: string;
  opportunityAnalysisId: string | null;
  trafficAnalysisId: string | null;
  pageAnalysisId: string | null;
  /** The results the rules returned, as they were accepted, in the order they ran. */
  ruleResults: DecisionRuleRunResult[];
  /** One entry per rule the pipeline returned, in the order they were heard. */
  recordedExecutions: RecordedDecisionExecution[];
  /** The execution metadata the run was given. Flat. */
  executionMetadata: DecisionMetadata;
  /** What the pipeline recorded about itself: stage outcomes, the resolution, and counts. Flat. */
  pipelineMetadata: DecisionMetadata;
  /** Rule ids whose result was FAIL. */
  blockingRules: string[];
  /** Rule ids that were enabled while declared as conflicting. */
  conflictingRules: string[];
  /** Rule ids whose result reported missing evidence. */
  missingEvidence: string[];
  /** Rule ids whose result was SKIPPED. */
  skippedRules: string[];
}
