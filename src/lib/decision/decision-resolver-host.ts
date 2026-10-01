/**
 * Decision Resolver: the orchestrator of the Decision Intelligence Engine.
 *
 * The one entry point for an analysis. It takes the execution inputs, makes
 * an immutable context from copies of them, and hands it to the pipeline,
 * which runs Readiness, Quality, Priority, and Action rules and builds a
 * single Decision Analysis from the results.
 *
 * It never executes an action, never emits a plan, never changes the
 * context, and persists nothing. `validate` is a read-only preview: it runs
 * no rule.
 */
import type { DecisionIssue } from "./decision-validator";
import { DecisionFrameworkError } from "./decision-rule-registry";
import { createDecisionRuleContext, freezeDeepDecisionRule, type DecisionRuleContext, type DecisionRuleContextInit } from "./decision-rule-context";
import type { ResolvedDecisionAnalysis } from "./decision-resolver-analysis";
import {
  createDecisionPipeline,
  type DecisionPipeline,
  type DecisionPipelineOptions,
  type DecisionRun,
} from "./decision-resolver-pipeline";
import { createDecisionResolverValidator } from "./decision-resolver-validator";

export type DecisionResolverOptions = DecisionPipelineOptions;

/** Either a ready context or the raw members of one. A copy is always made. */
export type DecisionResolverInput = DecisionRuleContext | DecisionRuleContextInit;

export interface DecisionResolver {
  readonly pipeline: DecisionPipeline;
  /** Problems that would refuse a run with this input. Runs nothing. */
  validate(input: DecisionResolverInput | null | undefined): DecisionIssue[];
  /** Runs the pipeline and returns everything it produced. Never throws. */
  run(input: DecisionResolverInput | null | undefined): Promise<DecisionRun>;
  /** Runs the pipeline and returns the Decision Analysis. Never throws. */
  resolve(input: DecisionResolverInput | null | undefined): Promise<ResolvedDecisionAnalysis>;
}

export function createDecisionResolver(options: DecisionResolverOptions = {}): DecisionResolver {
  const now = options.now ?? (() => performance.now());
  const validator = options.validator ?? createDecisionResolverValidator();
  const pipeline = createDecisionPipeline({ ...options, now, validator });

  const normalize = (input: DecisionResolverInput | null | undefined): { context: DecisionRuleContext | null; issues: DecisionIssue[] } => {
    try {
      return { context: createDecisionRuleContext((input ?? {}) as DecisionRuleContextInit), issues: [] };
    } catch (error) {
      if (error instanceof DecisionFrameworkError) return { context: null, issues: error.issues };
      return { context: null, issues: [{ field: "context", message: error instanceof Error ? error.message : "Invalid context." }] };
    }
  };

  const execute = async (input: DecisionResolverInput | null | undefined): Promise<DecisionRun> => {
    const { context, issues } = normalize(input);
    if (context === null) {
      const run = await pipeline.run(createDecisionRuleContext());
      return {
        ...run,
        analysis: freezeDeepDecisionRule({
          ...run.analysis,
          status: "FAILED" as const,
          decisionStatus: "REFUSED" as const,
          errors: [...issues.map((issue) => `${issue.field}: ${issue.message}`), ...run.analysis.errors],
        }),
      };
    }
    return pipeline.run(context);
  };

  return {
    pipeline,
    validate(input) {
      const { context, issues } = normalize(input);
      if (context === null) return issues;
      const registryIssues =
        pipeline.dimensions.length === 0
          ? [{ field: "registry", message: "Missing Rule Registry: a decision rule registry is required." }]
          : pipeline.dimensions.flatMap((dimension) => [
              ...validator.validateRuleRegistry(dimension.pipeline.registry),
              ...validator.validateDependencies(dimension.pipeline.registry.list()),
            ]);
      return [...validator.validateInput(context), ...registryIssues];
    },
    run: execute,
    resolve: async (input) => (await execute(input)).analysis,
  };
}
