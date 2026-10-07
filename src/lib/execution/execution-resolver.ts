/**
 * Execution Resolver: prepare an immutable execution graph.
 *
 * Transforms a validated plan into a frozen graph. It never invokes a host,
 * never runs a task, never reaches an outside system, and never changes a
 * workflow stage. A refused input returns REJECTED with issues and no graph.
 *
 * Not the Execution Plan Resolver, the Execution Dependency Resolver, the
 * Execution Contract Resolver, or the Execution Provider Resolver. This
 * module only orchestrates those prepare steps.
 */
import {
  createExecutionPipeline,
  type ExecutionPipeline,
  type ExecutionPipelineOptions,
  type ExecutionResolveResult,
} from "./execution-pipeline";
import type { ExecutionResolverSnapshot } from "./execution-resolver-plan";
import type { ExecutionRecorder } from "./execution-resolver-recorder";
import type { ExecutionResolverValidator } from "./execution-resolver-validator";
import type { ExecutionIssue } from "./execution-validator";

export type {
  ExecutionPipeline,
  ExecutionPipelineOptions,
  ExecutionResolveResult,
  ExecutionResolverClock,
  ExecutionResolverIdFactory,
  ExecutionResolverInput,
  ExecutionResolverTimestamp,
  ExecutionResolveStatus,
} from "./execution-pipeline";
export { EXECUTION_RESOLVE_STATUSES, createExecutionPipeline } from "./execution-pipeline";

export interface ExecutionResolver {
  readonly pipeline: ExecutionPipeline;
  readonly recorder: ExecutionRecorder;
  readonly validator: ExecutionResolverValidator;
  validate(input: unknown): ExecutionIssue[];
  resolve(input: unknown): ExecutionResolveResult;
  getSnapshot(snapshotId: string): ExecutionResolverSnapshot | null;
}

export type ExecutionResolverOptions = ExecutionPipelineOptions & {
  pipeline?: ExecutionPipeline;
};

export function createExecutionResolver(options: ExecutionResolverOptions = {}): ExecutionResolver {
  const pipeline = options.pipeline ?? createExecutionPipeline(options);
  const snapshots = new Map<string, ExecutionResolverSnapshot>();

  return {
    pipeline,
    recorder: pipeline.recorder,
    validator: pipeline.validator,
    validate: (input) => pipeline.validator.validateInput(input),
    resolve(input) {
      const result = pipeline.run(input);
      if (result.status === "OK" && result.snapshot) snapshots.set(result.snapshot.snapshotId, result.snapshot);
      return result;
    },
    getSnapshot: (snapshotId) => snapshots.get(snapshotId) ?? null,
  };
}
