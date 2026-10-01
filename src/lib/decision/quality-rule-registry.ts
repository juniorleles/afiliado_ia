/**
 * Quality Rule Set: registry.
 *
 * Holds the eight quality rules in a Decision Rule Framework module registry.
 * Registering them twice is rejected as a duplicate rule. This registry never
 * runs a rule and never records a Decision Analysis.
 */
import type { DecisionRuleEntry, DecisionRuleModule } from "./decision-rule-contract";
import { createDecisionRuleModuleRegistry, type DecisionRuleModuleRegistry } from "./decision-rule-registry";
import { createQualityRules } from "./quality-rules";

export interface QualityRuleRegistry {
  readonly modules: DecisionRuleModuleRegistry;
  get(id: string): DecisionRuleEntry | null;
  /** Quality rules only, highest priority first, then id. */
  list(): DecisionRuleEntry[];
  count(): number;
}

/** Registers every quality rule. A duplicate id is rejected by the framework. */
export function registerQualityRules(target: { register(module: DecisionRuleModule): DecisionRuleEntry }): DecisionRuleEntry[] {
  return createQualityRules().map((module) => target.register(module));
}

/** A module registry with the eight quality rules already registered. */
export function createQualityRuleRegistry(): QualityRuleRegistry {
  const modules = createDecisionRuleModuleRegistry();
  registerQualityRules(modules);
  return {
    modules,
    get: (id) => modules.get(id),
    list: () => modules.list({ category: "QUALITY" }),
    count: () => modules.list({ category: "QUALITY" }).length,
  };
}
