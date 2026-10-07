/**
 * Decision Intelligence Engine: rule registry contract.
 *
 * Interface only. The registry is the single list of rule definitions the
 * engine may use. It supports registering a rule, enabling it, disabling it,
 * validating one without registering it, and listing them. No implementation
 * ships in this step.
 *
 * Register rejects a missing rule or a duplicate rule id. Validate reports
 * without registering.
 */
import type { DecisionIssue } from "./decision-validator";
import type { DecisionRule } from "./decision-types";

export interface DecisionRuleFilter {
  enabled?: boolean;
}

export interface DecisionRuleRegistry {
  /** Adds a rule. Rejects an invalid rule or a duplicate id. */
  register(rule: DecisionRule): DecisionRule;
  /** Marks a registered rule enabled. Rejects an unknown id (Missing Rule). */
  enable(id: string): DecisionRule;
  /** Marks a registered rule disabled. Rejects an unknown id (Missing Rule). */
  disable(id: string): DecisionRule;
  get(id: string): DecisionRule | null;
  /** The registered rules, optionally narrowed by enabled flag. */
  list(filter?: DecisionRuleFilter): DecisionRule[];
  /** Reports problems with a rule without registering it. */
  validate(rule: unknown): DecisionIssue[];
}
