/**
 * Decision Rule Framework: rule pipeline.
 *
 * Plugs independent rules into the engine: register, remove, enable, and
 * disable them, validate their dependencies, resolve an order, then run them
 * one after another and collect each result. There is no parallel execution
 * and no scoring. A rule never executes an action and never mutates the
 * analysis.
 *
 * Dependencies are only validated. A run with invalid dependencies is refused
 * and nothing executes; no rule is registered or enabled to make it valid.
 * A rule whose required rule did not pass is skipped. A run is also refused
 * for a context that is not complete, plain data.
 *
 * This pipeline is not the Decision Resolver and does not record a Decision
 * Analysis.
 */
import type { DecisionIssue } from "./decision-validator";
import type { DecisionRuleEntry, DecisionRuleModule, DecisionRuleRunResult, DecisionRuleUpstream } from "./decision-rule-contract";
import type { DecisionRuleContext } from "./decision-rule-context";
import { executeDecisionRule, skippedDecisionRuleResult, type DecisionRuleClock } from "./decision-rule-executor";
import { createDecisionRuleModuleRegistry, DecisionFrameworkError, type DecisionRuleModuleRegistry } from "./decision-rule-registry";
import { resolveDecisionRuleOrder, type DecisionRuleExecutionOrder } from "./decision-rule-resolver";
import { validateDecisionRuleContext, validateDecisionRuleDependencies } from "./decision-rule-validator";

const COMPLETED = new Set(["PASS", "WARNING"]);

export interface DecisionRulePipelineReport {
  /** Rule ids in the order they ran. */
  order: string[];
  /** One result per enabled rule, in run order. */
  results: DecisionRuleRunResult[];
}

export interface DecisionRulePipeline {
  readonly registry: DecisionRuleModuleRegistry;
  register(module: DecisionRuleModule): DecisionRuleEntry;
  remove(id: string): DecisionRuleEntry;
  enable(id: string): DecisionRuleEntry;
  disable(id: string): DecisionRuleEntry;
  /** Problems with the declared dependencies of the enabled rules. */
  validateDependencies(): DecisionIssue[];
  resolveExecutionOrder(): DecisionRuleExecutionOrder;
  /** Runs the enabled rules sequentially. Throws DecisionFrameworkError if the context or dependencies are invalid or a run is in progress. */
  run(context: DecisionRuleContext): Promise<DecisionRulePipelineReport>;
}

export interface DecisionRulePipelineOptions {
  registry?: DecisionRuleModuleRegistry;
  /** Milliseconds clock used for executionTime. */
  now?: DecisionRuleClock;
}

export function createDecisionRulePipeline(options: DecisionRulePipelineOptions = {}): DecisionRulePipeline {
  const registry = options.registry ?? createDecisionRuleModuleRegistry();
  let running = false;

  return {
    registry,
    register: (module) => registry.register(module),
    remove: (id) => registry.remove(id),
    enable: (id) => registry.enable(id),
    disable: (id) => registry.disable(id),
    validateDependencies: () => validateDecisionRuleDependencies(registry.list()),
    resolveExecutionOrder: () => resolveDecisionRuleOrder(registry.list()),

    async run(context) {
      if (running) {
        throw new DecisionFrameworkError("A pipeline run is already in progress.", [
          { field: "run", message: "Rules run sequentially; wait for the current run to finish." },
        ]);
      }
      const contextIssues = validateDecisionRuleContext(context, true);
      if (contextIssues.length > 0) throw new DecisionFrameworkError("Context is invalid.", contextIssues);
      const { order, issues } = resolveDecisionRuleOrder(registry.list());
      if (issues.length > 0) throw new DecisionFrameworkError("Rule dependencies are invalid.", issues);

      running = true;
      try {
        const results: DecisionRuleRunResult[] = [];
        const byId = new Map<string, DecisionRuleRunResult>();
        for (const id of order) {
          const entry = registry.get(id) as DecisionRuleEntry;
          const { requires, optional } = entry.module.dependencies;
          const blocked = requires.find((dep) => !COMPLETED.has(byId.get(dep)?.status ?? ""));
          let outcome: DecisionRuleRunResult;
          if (blocked !== undefined) {
            outcome = skippedDecisionRuleResult(id, `Required rule "${blocked}" did not complete.`);
          } else {
            const upstream: Record<string, DecisionRuleRunResult> = {};
            for (const dep of [...requires, ...optional]) {
              const done = byId.get(dep);
              if (done) upstream[dep] = done;
            }
            outcome = await executeDecisionRule(entry.module, context, Object.freeze(upstream) as DecisionRuleUpstream, options.now);
          }
          byId.set(id, outcome);
          results.push(outcome);
        }
        return { order, results };
      } finally {
        running = false;
      }
    },
  };
}
