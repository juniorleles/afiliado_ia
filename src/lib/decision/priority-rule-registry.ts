/**
 * Priority Rule Set: registry.
 *
 * Holds the eight priority rules in a Decision Rule Framework module registry.
 * Registering them twice is rejected as a duplicate rule. This registry never
 * runs a rule and never records a Decision Analysis.
 */
import type { DecisionRuleEntry, DecisionRuleModule } from "./decision-rule-contract";
import { createDecisionRuleModuleRegistry, type DecisionRuleModuleRegistry } from "./decision-rule-registry";
import { createPriorityRules } from "./priority-rules";

export interface PriorityRuleRegistry {
  readonly modules: DecisionRuleModuleRegistry;
  get(id: string): DecisionRuleEntry | null;
  /** Priority rules only, highest module.priority first, then id. */
  list(): DecisionRuleEntry[];
  count(): number;
}

/** Registers every priority rule. A duplicate id is rejected by the framework. */
export function registerPriorityRules(target: { register(module: DecisionRuleModule): DecisionRuleEntry }): DecisionRuleEntry[] {
  return createPriorityRules().map((module) => target.register(module));
}

/** A module registry with the eight priority rules already registered. */
export function createPriorityRuleRegistry(): PriorityRuleRegistry {
  const modules = createDecisionRuleModuleRegistry();
  registerPriorityRules(modules);
  return {
    modules,
    get: (id) => modules.get(id),
    list: () => modules.list({ category: "PRIORITY" }),
    count: () => modules.list({ category: "PRIORITY" }).length,
  };
}
