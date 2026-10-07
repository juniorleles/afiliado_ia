/**
 * Action Rule Set: registry.
 *
 * Holds the ten action rules in a Decision Rule Framework module registry.
 * Registering them twice is rejected as a duplicate rule. A second rule for
 * the same eligible action is rejected as a duplicate action. This registry
 * never runs a rule and never records a Decision Analysis.
 */
import type { DecisionRuleEntry, DecisionRuleModule } from "./decision-rule-contract";
import { createDecisionRuleModuleRegistry, DecisionFrameworkError, type DecisionRuleModuleRegistry } from "./decision-rule-registry";
import { validateActionRules } from "./action-validator";
import { createActionRules, type ActionRuleModule } from "./action-rules";

export interface ActionRuleRegistry {
  readonly modules: DecisionRuleModuleRegistry;
  get(id: string): DecisionRuleEntry | null;
  /** Action rules only, highest module.priority first, then id. */
  list(): DecisionRuleEntry[];
  count(): number;
}

function rejectDuplicates(existing: readonly DecisionRuleEntry[], incoming: DecisionRuleModule): void {
  const action = "eligibleAction" in incoming && typeof incoming.eligibleAction === "string" ? incoming.eligibleAction : incoming.id;
  const clash = existing.find((entry) => {
    const other = entry.module as ActionRuleModule;
    const otherAction = typeof other.eligibleAction === "string" ? other.eligibleAction : other.id;
    return otherAction === action && other.id !== incoming.id;
  });
  if (clash) {
    throw new DecisionFrameworkError("Rule is invalid.", [
      { field: "eligibleAction", message: `Duplicate action: action "${action}" is already registered.` },
    ]);
  }
}

/** Registers every action rule. A duplicate id or duplicate action is rejected. */
export function registerActionRules(target: { register(module: DecisionRuleModule): DecisionRuleEntry; list?(): DecisionRuleEntry[] }): DecisionRuleEntry[] {
  return createActionRules().map((module) => {
    if (typeof target.list === "function") rejectDuplicates(target.list(), module);
    return target.register(module);
  });
}

function guardRegistry(inner: DecisionRuleModuleRegistry): DecisionRuleModuleRegistry {
  return {
    register(module) {
      rejectDuplicates(inner.list(), module);
      return inner.register(module);
    },
    remove: (id) => inner.remove(id),
    enable: (id) => inner.enable(id),
    disable: (id) => inner.disable(id),
    get: (id) => inner.get(id),
    list: (filter) => inner.list(filter),
    count: () => inner.count(),
    validate: (module) => inner.validate(module),
  };
}

/** A module registry with the ten action rules already registered. */
export function createActionRuleRegistry(): ActionRuleRegistry {
  const modules = guardRegistry(createDecisionRuleModuleRegistry());
  const issues = validateActionRules(createActionRules());
  if (issues.length > 0) throw new DecisionFrameworkError("Rule is invalid.", issues);
  registerActionRules(modules);
  return {
    modules,
    get: (id) => modules.get(id),
    list: () => modules.list({ category: "ACTION" }),
    count: () => modules.list({ category: "ACTION" }).length,
  };
}
