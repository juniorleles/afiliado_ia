/**
 * Traffic Resolver: the orchestrator of the Traffic Intelligence Engine.
 *
 * The one entry point for an analysis. It takes the execution inputs, makes an
 * immutable context from copies of them, and hands it to the pipeline, which
 * runs every enabled signal in the signal registry and builds a single
 * Traffic Analysis from the results.
 *
 * It consumes only the Signal Contract. It does not know what any signal
 * measures, does not name or import a concrete signal, and treats every signal
 * alike. It calculates no score, no ranking, and no recommendation, and it
 * persists nothing.
 *
 * `validate` and `plan` are read-only previews: they run no signal.
 */
import type { TrafficIssue } from "./traffic-validator";
import {
  createTrafficExecutionContext,
  type TrafficExecutionContext,
  type TrafficExecutionContextInit,
} from "./traffic-resolver-context";
import type { ResolvedTrafficAnalysis } from "./traffic-resolver-analysis";
import { buildTrafficExecutionPlan, type TrafficExecutionPlan } from "./traffic-resolver-plan";
import {
  createTrafficPipeline,
  type TrafficPipeline,
  type TrafficPipelineOptions,
  type TrafficRun,
} from "./traffic-resolver-pipeline";
import { createTrafficValidator } from "./traffic-resolver-validator";

export type TrafficResolverOptions = TrafficPipelineOptions;

/** Either a ready context or the raw members of one. A copy is always made. */
export type TrafficResolverInput = TrafficExecutionContext | TrafficExecutionContextInit;

export interface TrafficResolver {
  readonly pipeline: TrafficPipeline;
  /** Problems that would refuse a run with this input. Runs nothing. */
  validate(input: TrafficResolverInput | null | undefined): TrafficIssue[];
  /** The plan a run would follow now; null when the signal registry is missing. Runs nothing. */
  plan(): TrafficExecutionPlan | null;
  /** Runs the pipeline and returns everything it produced. Never throws. */
  run(input: TrafficResolverInput | null | undefined): Promise<TrafficRun>;
  /** Runs the pipeline and returns the Traffic Analysis. Never throws. */
  resolve(input: TrafficResolverInput | null | undefined): Promise<ResolvedTrafficAnalysis>;
}

export function createTrafficResolver(options: TrafficResolverOptions): TrafficResolver {
  const validator = options.validator ?? createTrafficValidator();
  const pipeline = createTrafficPipeline({ ...options, validator });

  const normalize = (input: TrafficResolverInput | null | undefined) => createTrafficExecutionContext(input as TrafficExecutionContextInit | null | undefined);

  return {
    pipeline,
    validate: (input) => [...validator.validateInput(normalize(input)), ...validator.validateOpportunityAnalysis(normalize(input)), ...validator.validateSignalSource(options.signals)],
    plan: () => (validator.validateSignalSource(options.signals).length > 0 ? null : buildTrafficExecutionPlan(options.signals.registry.list())),
    run: (input) => pipeline.run(normalize(input)),
    async resolve(input) {
      return (await pipeline.run(normalize(input))).analysis;
    },
  };
}
