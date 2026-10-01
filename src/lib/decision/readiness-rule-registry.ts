/**
 * Readiness Rule Set: registry.
 *
 * Holds the eight readiness rules in a Decision Rule Framework module
 * registry. Registering them twice is rejected as a duplicate rule. This
 * registry never runs a rule and never records a Decision Analysis.
 */
import type { DecisionRuleEntry, DecisionRuleModule } from "./decision-rule-contract";
import { createDecisionRuleModuleRegistry, type DecisionRuleModuleRegistry } from "./decision-rule-registry";
import { createReadinessRules } from "./readiness-rules";

export interface ReadinessRuleRegistry {
  readonly modules: DecisionRuleModuleRegistry;
  get(id: string): DecisionRuleEntry | null;
  /** Readiness rules only, highest priority first, then id. */
  list(): DecisionRuleEntry[];
  count(): number;
}

/** Registers every readiness rule. A duplicate id is rejected by the framework. */
export function registerReadinessRules(target: { register(module: DecisionRuleModule): DecisionRuleEntry }): DecisionRuleEntry[] {
  return createReadinessRules().map((module) => target.register(module));
}

/** A module registry with the eight readiness rules already registered. */
export function createReadinessRuleRegistry(): ReadinessRuleRegistry {
  const modules = createDecisionRuleModuleRegistry();
  registerReadinessRules(modules);
  return {
    modules,
    get: (id) => modules.get(id),
    list: () => modules.list({ category: "READINESS" }),
    count: () => modules.list({ category: "READINESS" }).length,
  };
}
