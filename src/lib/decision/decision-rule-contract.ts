/**
 * Decision Rule Framework: rule contract.
 *
 * What an independent rule module must expose to be plugged into the pipeline.
 * The framework only calls these members; it never interprets what a rule
 * measures. No rule ships with the framework. A rule never executes an action,
 * never changes the analysis, and never produces a score or a recommendation.
 */
import type { DecisionIssue } from "./decision-validator";
import type { DecisionRuleContext } from "./decision-rule-context";
import type { DecisionMetadata } from "./decision-types";

/** The groups a decision rule can belong to. FUTURE is the room left for later groups. */
export const DECISION_RULE_CATEGORIES = ["READINESS", "QUALITY", "PRIORITY", "ACTION", "FUTURE"] as const;
export type DecisionRuleCategory = (typeof DECISION_RULE_CATEGORIES)[number];

/** How a rule run ended. SKIPPED means evaluate() was not run to completion. */
export const DECISION_RULE_RESULT_STATUSES = ["PASS", "FAIL", "WARNING", "SKIPPED"] as const;
export type DecisionRuleResultStatus = (typeof DECISION_RULE_RESULT_STATUSES)[number];

/**
 * Relations to other rules by id. The framework validates them and never
 * resolves them on its own: nothing is registered or enabled automatically.
 */
export interface DecisionRuleDependencies {
  /** Must be registered and enabled, and run first. */
  requires: readonly string[];
  /** Run first when registered and enabled; otherwise ignored. */
  optional: readonly string[];
  /** Must not be enabled at the same time. */
  conflicts: readonly string[];
}

/** What evaluate() returns. The executor adds the rule id and the timing. */
export interface DecisionRuleOutput {
  status: DecisionRuleResultStatus;
  /** Not interpreted by the framework. */
  confidence: number | null;
  warnings: string[];
  errors: string[];
  metadata: DecisionMetadata;
}

/** What the pipeline collects for each rule. Carries no score and no recommendation. */
export interface DecisionRuleRunResult extends DecisionRuleOutput {
  ruleId: string;
  /** Milliseconds spent in supportsDecision, validate, and evaluate. */
  executionTime: number;
}

/** Results of already-run rules this rule declared in requires or optional. */
export type DecisionRuleUpstream = Readonly<Record<string, Readonly<DecisionRuleRunResult>>>;

/** A registered rule and whether it is currently enabled. Changed only by the registry. */
export interface DecisionRuleEntry {
  readonly id: string;
  readonly module: DecisionRuleModule;
  readonly enabled: boolean;
}

export interface DecisionRuleModule {
  readonly id: string;
  readonly name: string;
  /** Semantic version, for example "1.0.0". */
  readonly version: string;
  readonly category: DecisionRuleCategory;
  /** Whether the rule starts enabled when registered. */
  readonly enabled: boolean;
  /** Higher runs first among rules with no dependency between them. */
  readonly priority: number;
  readonly dependencies: DecisionRuleDependencies;
  /** False skips the rule for this context. */
  supportsDecision(context: DecisionRuleContext): boolean;
  evaluate(context: DecisionRuleContext, upstream: DecisionRuleUpstream): DecisionRuleOutput | Promise<DecisionRuleOutput>;
  /** Problems that stop evaluate() from running on this context; empty when valid. */
  validate(context: DecisionRuleContext): DecisionIssue[];
}
