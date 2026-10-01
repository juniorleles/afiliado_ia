/**
 * Decision Rule Framework: rule registry.
 *
 * Holds the rule modules plugged into the engine. It checks each module
 * against the contract when it is registered, and tracks whether it is enabled.
 * It never runs a rule and never resolves dependencies: those are checked
 * and ordered by the pipeline.
 *
 * Not to be confused with DecisionRuleRegistry (decision-registry.ts), the
 * contract for rule definitions. This registry holds executable modules.
 */
import type { DecisionIssue } from "./decision-validator";
import type { DecisionRuleCategory, DecisionRuleEntry, DecisionRuleModule } from "./decision-rule-contract";
import { validateDecisionRuleModule, validateNoDuplicateDecisionRuleId } from "./decision-rule-validator";

export class DecisionFrameworkError extends Error {
  constructor(
    message: string,
    readonly issues: DecisionIssue[] = [],
  ) {
    super(message);
    this.name = "DecisionFrameworkError";
  }
}

export interface DecisionRuleFilterOptions {
  category?: DecisionRuleCategory;
  enabled?: boolean;
}

export interface DecisionRuleModuleRegistry {
  /** Rejects a module that breaks the contract or repeats a registered id. Starts as module.enabled. */
  register(module: DecisionRuleModule): DecisionRuleEntry;
  remove(id: string): DecisionRuleEntry;
  enable(id: string): DecisionRuleEntry;
  disable(id: string): DecisionRuleEntry;
  get(id: string): DecisionRuleEntry | null;
  /** Highest priority first, then id. */
  list(filter?: DecisionRuleFilterOptions): DecisionRuleEntry[];
  count(): number;
  /** Reports contract problems without registering. */
  validate(module: unknown): DecisionIssue[];
}

export function createDecisionRuleModuleRegistry(): DecisionRuleModuleRegistry {
  const entries = new Map<string, DecisionRuleEntry>();

  const mustGet = (id: string): DecisionRuleEntry => {
    const entry = entries.get(id);
    if (!entry) throw new DecisionFrameworkError(`Rule "${id}" is not registered.`, [{ field: "id", message: `Rule "${id}" is not registered.` }]);
    return entry;
  };
  const setEnabled = (id: string, enabled: boolean): DecisionRuleEntry => {
    const next: DecisionRuleEntry = { ...mustGet(id), enabled };
    entries.set(id, next);
    return next;
  };

  return {
    register(module) {
      let issues = validateDecisionRuleModule(module);
      if (issues.length === 0) issues = validateNoDuplicateDecisionRuleId(entries.keys(), module.id);
      if (issues.length > 0) throw new DecisionFrameworkError("Rule is invalid.", issues);
      const entry: DecisionRuleEntry = { id: module.id, module, enabled: module.enabled };
      entries.set(entry.id, entry);
      return entry;
    },
    remove(id) {
      const entry = mustGet(id);
      entries.delete(id);
      return entry;
    },
    enable: (id) => setEnabled(id, true),
    disable: (id) => setEnabled(id, false),
    get: (id) => entries.get(id) ?? null,
    list(filter = {}) {
      return [...entries.values()]
        .filter(
          (e) =>
            (filter.category === undefined || e.module.category === filter.category) &&
            (filter.enabled === undefined || e.enabled === filter.enabled),
        )
        .sort((a, b) => b.module.priority - a.module.priority || a.id.localeCompare(b.id));
    },
    count: () => entries.size,
    validate: (module) => validateDecisionRuleModule(module),
  };
}
