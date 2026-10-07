/**
 * Opportunity Resolver: the orchestrator of the Opportunity Engine.
 *
 * The one entry point for an analysis. It takes the execution inputs, makes an
 * immutable context from copies of them, and hands it to the pipeline, which
 * runs every enabled signal in the signal registry and builds a single
 * Opportunity Analysis from the results.
 *
 * It consumes only the Signal Contract. It does not know what any signal
 * measures, does not name or import a concrete signal, and treats every signal
 * alike. It calculates no score, no ranking, and no recommendation, and it
 * persists nothing.
 *
 * `validate` and `plan` are read-only previews: they run no signal.
 */
import type { OpportunityIssue } from "./opportunity-validator";
import {
  createOpportunityExecutionContext,
  type OpportunityExecutionContext,
  type OpportunityExecutionContextInit,
} from "./opportunity-resolver-context";
import type { ResolvedOpportunityAnalysis } from "./opportunity-resolver-analysis";
import { buildExecutionPlan, type OpportunityExecutionPlan } from "./opportunity-resolver-plan";
import {
  createOpportunityPipeline,
  type OpportunityPipeline,
  type OpportunityPipelineOptions,
  type OpportunityRun,
} from "./opportunity-resolver-pipeline";
import { createOpportunityValidator } from "./opportunity-resolver-validator";

export type OpportunityResolverOptions = OpportunityPipelineOptions;

/** Either a ready context or the raw members of one. A copy is always made. */
export type OpportunityResolverInput = OpportunityExecutionContext | OpportunityExecutionContextInit;

export interface OpportunityResolver {
  readonly pipeline: OpportunityPipeline;
  /** Problems that would refuse a run with this input. Runs nothing. */
  validate(input: OpportunityResolverInput | null | undefined): OpportunityIssue[];
  /** The plan a run would follow now; null when the signal registry is missing. Runs nothing. */
  plan(): OpportunityExecutionPlan | null;
  /** Runs the pipeline and returns everything it produced. Never throws. */
  run(input: OpportunityResolverInput | null | undefined): Promise<OpportunityRun>;
  /** Runs the pipeline and returns the Opportunity Analysis. Never throws. */
  resolve(input: OpportunityResolverInput | null | undefined): Promise<ResolvedOpportunityAnalysis>;
}

export function createOpportunityResolver(options: OpportunityResolverOptions): OpportunityResolver {
  const validator = options.validator ?? createOpportunityValidator();
  const pipeline = createOpportunityPipeline({ ...options, validator });

  const normalize = (input: OpportunityResolverInput | null | undefined) => createOpportunityExecutionContext(input as OpportunityExecutionContextInit | null | undefined);

  return {
    pipeline,
    validate: (input) => [...validator.validateInput(normalize(input)), ...validator.validateSignalSource(options.signals)],
    plan: () => (validator.validateSignalSource(options.signals).length > 0 ? null : buildExecutionPlan(options.signals.registry.list())),
    run: (input) => pipeline.run(normalize(input)),
    async resolve(input) {
      return (await pipeline.run(normalize(input))).analysis;
    },
  };
}
