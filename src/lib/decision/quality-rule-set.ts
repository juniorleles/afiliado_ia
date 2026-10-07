/**
 * Quality Rule Set: the set.
 *
 * Runs the eight quality rules through the Decision Rule Framework pipeline
 * and returns a QualityResult. It never records a Decision Analysis, never
 * executes an action, and never mutates the context. It is not the Decision
 * Resolver.
 */
import type { DecisionRuleContext } from "./decision-rule-context";
import { createDecisionRulePipeline, type DecisionRulePipeline } from "./decision-rule-pipeline";
import { DecisionFrameworkError, type DecisionRuleModuleRegistry } from "./decision-rule-registry";
import type { DecisionRuleClock } from "./decision-rule-executor";
import { summarizeQuality, type QualityResult } from "./quality-result";
import { createQualityRuleRegistry, registerQualityRules, type QualityRuleRegistry } from "./quality-rule-registry";
import { createQualityValidator, type QualityValidator } from "./quality-validator";

const defaultClock: DecisionRuleClock = () => performance.now();

export interface QualityRuleSet {
  readonly registry: QualityRuleRegistry;
  readonly pipeline: DecisionRulePipeline;
  readonly validator: QualityValidator;
  evaluate(context: DecisionRuleContext): Promise<QualityResult>;
}

export interface QualityRuleSetOptions {
  registry?: QualityRuleRegistry;
  modules?: DecisionRuleModuleRegistry;
  now?: DecisionRuleClock;
  validator?: QualityValidator;
}

export function createQualityRuleSet(options: QualityRuleSetOptions = {}): QualityRuleSet {
  const validator = options.validator ?? createQualityValidator();
  const registry = options.registry ?? (options.modules ? wrapModules(options.modules) : createQualityRuleRegistry());
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
      const summary = summarizeQuality(report);
      const summaryIssues = validator.validateSummary(summary);
      if (summaryIssues.length > 0) throw new DecisionFrameworkError("Invalid rule result.", summaryIssues);
      return summary;
    },
  };
}

function wrapModules(modules: DecisionRuleModuleRegistry): QualityRuleRegistry {
  if (modules.list({ category: "QUALITY" }).length === 0) registerQualityRules(modules);
  return {
    modules,
    get: (id) => modules.get(id),
    list: () => modules.list({ category: "QUALITY" }),
    count: () => modules.list({ category: "QUALITY" }).length,
  };
}
