/**
 * Priority Rule Set: the set.
 *
 * Runs the eight priority rules through the Decision Rule Framework pipeline
 * and returns a PriorityResult. It never records a Decision Analysis, never
 * executes an action, and never mutates the context. It is not the Decision
 * Resolver.
 */
import type { DecisionRuleContext } from "./decision-rule-context";
import { createDecisionRulePipeline, type DecisionRulePipeline } from "./decision-rule-pipeline";
import { DecisionFrameworkError, type DecisionRuleModuleRegistry } from "./decision-rule-registry";
import type { DecisionRuleClock } from "./decision-rule-executor";
import { summarizePriority, type PriorityResult } from "./priority-result";
import { createPriorityRuleRegistry, registerPriorityRules, type PriorityRuleRegistry } from "./priority-rule-registry";
import { createPriorityValidator, type PriorityValidator } from "./priority-validator";

const defaultClock: DecisionRuleClock = () => performance.now();

export interface PriorityRuleSet {
  readonly registry: PriorityRuleRegistry;
  readonly pipeline: DecisionRulePipeline;
  readonly validator: PriorityValidator;
  evaluate(context: DecisionRuleContext): Promise<PriorityResult>;
}

export interface PriorityRuleSetOptions {
  registry?: PriorityRuleRegistry;
  modules?: DecisionRuleModuleRegistry;
  now?: DecisionRuleClock;
  validator?: PriorityValidator;
}

export function createPriorityRuleSet(options: PriorityRuleSetOptions = {}): PriorityRuleSet {
  const validator = options.validator ?? createPriorityValidator();
  const registry = options.registry ?? (options.modules ? wrapModules(options.modules) : createPriorityRuleRegistry());
  const pipeline = createDecisionRulePipeline({ registry: registry.modules, now: options.now ?? defaultClock });

  return {
    registry,
    pipeline,
    validator,
    async evaluate(context) {
      const contextIssues = validator.validateContext(context);
      if (contextIssues.length > 0) throw new DecisionFrameworkError("Context is invalid.", contextIssues);
      const report = await pipeline.run(context);
      for (const result of report.results) {
        const resultIssues = validator.validateRuleResult(result);
        if (resultIssues.length > 0) throw new DecisionFrameworkError("Invalid rule result.", resultIssues);
      }
      const summary = summarizePriority(report);
      const summaryIssues = validator.validateSummary(summary);
      if (summaryIssues.length > 0) throw new DecisionFrameworkError("Invalid rule result.", summaryIssues);
      return summary;
    },
  };
}

function wrapModules(modules: DecisionRuleModuleRegistry): PriorityRuleRegistry {
  if (modules.list({ category: "PRIORITY" }).length === 0) registerPriorityRules(modules);
  return {
    modules,
    get: (id) => modules.get(id),
    list: () => modules.list({ category: "PRIORITY" }),
    count: () => modules.list({ category: "PRIORITY" }).length,
  };
}
