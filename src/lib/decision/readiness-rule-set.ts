/**
 * Readiness Rule Set: the set.
 *
 * Runs the eight readiness rules through the Decision Rule Framework pipeline
 * and returns a ReadinessResult. It never records a Decision Analysis, never
 * executes an action, and never mutates the context. It is not the Decision
 * Resolver.
 */
import type { DecisionRuleContext } from "./decision-rule-context";
import { createDecisionRulePipeline, type DecisionRulePipeline } from "./decision-rule-pipeline";
import { DecisionFrameworkError, type DecisionRuleModuleRegistry } from "./decision-rule-registry";
import type { DecisionRuleClock } from "./decision-rule-executor";
import { summarizeReadiness, type ReadinessResult } from "./readiness-result";
import { createReadinessRuleRegistry, registerReadinessRules, type ReadinessRuleRegistry } from "./readiness-rule-registry";
import { createReadinessValidator, type ReadinessValidator } from "./readiness-validator";

const defaultClock: DecisionRuleClock = () => performance.now();

export interface ReadinessRuleSet {
  readonly registry: ReadinessRuleRegistry;
  readonly pipeline: DecisionRulePipeline;
  readonly validator: ReadinessValidator;
  evaluate(context: DecisionRuleContext): Promise<ReadinessResult>;
}

export interface ReadinessRuleSetOptions {
  registry?: ReadinessRuleRegistry;
  modules?: DecisionRuleModuleRegistry;
  now?: DecisionRuleClock;
  validator?: ReadinessValidator;
}

export function createReadinessRuleSet(options: ReadinessRuleSetOptions = {}): ReadinessRuleSet {
  const validator = options.validator ?? createReadinessValidator();
  const registry = options.registry ?? (options.modules ? wrapModules(options.modules) : createReadinessRuleRegistry());
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
      const summary = summarizeReadiness(report);
      const summaryIssues = validator.validateSummary(summary);
      if (summaryIssues.length > 0) throw new DecisionFrameworkError("Invalid rule result.", summaryIssues);
      return summary;
    },
  };
}

function wrapModules(modules: DecisionRuleModuleRegistry): ReadinessRuleRegistry {
  if (modules.list({ category: "READINESS" }).length === 0) registerReadinessRules(modules);
  return {
    modules,
    get: (id) => modules.get(id),
    list: () => modules.list({ category: "READINESS" }),
    count: () => modules.list({ category: "READINESS" }).length,
  };
}
