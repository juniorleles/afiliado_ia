/**
 * Action Rule Set: the set.
 *
 * Runs the ten action rules through the Decision Rule Framework pipeline and
 * returns an ActionResult. It never records a Decision Analysis, never
 * executes an action, never emits a plan, and never mutates the context. It
 * is not the Decision Resolver.
 */
import type { DecisionRuleContext } from "./decision-rule-context";
import { createDecisionRulePipeline, type DecisionRulePipeline } from "./decision-rule-pipeline";
import { DecisionFrameworkError, type DecisionRuleModuleRegistry } from "./decision-rule-registry";
import type { DecisionRuleClock } from "./decision-rule-executor";
import { summarizeAction, type ActionResult } from "./action-result";
import { createActionRuleRegistry, registerActionRules, type ActionRuleRegistry } from "./action-rule-registry";
import { createActionValidator, type ActionValidator } from "./action-validator";

const defaultClock: DecisionRuleClock = () => performance.now();

export interface ActionRuleSet {
  readonly registry: ActionRuleRegistry;
  readonly pipeline: DecisionRulePipeline;
  readonly validator: ActionValidator;
  evaluate(context: DecisionRuleContext): Promise<ActionResult>;
}

export interface ActionRuleSetOptions {
  registry?: ActionRuleRegistry;
  modules?: DecisionRuleModuleRegistry;
  now?: DecisionRuleClock;
  validator?: ActionValidator;
}

export function createActionRuleSet(options: ActionRuleSetOptions = {}): ActionRuleSet {
  const validator = options.validator ?? createActionValidator();
  const registry = options.registry ?? (options.modules ? wrapModules(options.modules) : createActionRuleRegistry());
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
      const summary = summarizeAction(report);
      const summaryIssues = validator.validateSummary(summary);
      if (summaryIssues.length > 0) throw new DecisionFrameworkError("Invalid rule result.", summaryIssues);
      return summary;
    },
  };
}

function wrapModules(modules: DecisionRuleModuleRegistry): ActionRuleRegistry {
  if (modules.list({ category: "ACTION" }).length === 0) registerActionRules(modules);
  return {
    modules,
    get: (id) => modules.get(id),
    list: () => modules.list({ category: "ACTION" }),
    count: () => modules.list({ category: "ACTION" }).length,
  };
}
