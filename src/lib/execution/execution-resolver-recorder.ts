/**
 * Execution Resolver: pipeline recorder.
 *
 * Records each prepare step once per resolve. It never invokes a host, never
 * runs a task, and never reaches an outside system.
 */
import { freezeDeepExecutionResolver } from "./execution-resolver-plan";

/** Prepare steps in flow order. */
export const EXECUTION_PIPELINE_STEPS = [
  "LOAD_WORKFLOW_SNAPSHOT",
  "LOAD_DECISION_ANALYSIS",
  "RESOLVE_TASKS",
  "RESOLVE_DEPENDENCIES",
  "RESOLVE_CONTRACTS",
  "RESOLVE_PROVIDERS",
  "VALIDATE_PLAN",
  "FREEZE_EXECUTION_GRAPH",
] as const;
export type ExecutionPipelineStep = (typeof EXECUTION_PIPELINE_STEPS)[number];

export interface ExecutionResolverRecord {
  step: ExecutionPipelineStep;
  index: number;
}

export interface ExecutionRecorder {
  record(step: ExecutionPipelineStep): void;
  list(): readonly ExecutionResolverRecord[];
  count(step?: ExecutionPipelineStep): number;
  reset(): void;
}

export function isExecutionPipelineStep(value: unknown): value is ExecutionPipelineStep {
  return (EXECUTION_PIPELINE_STEPS as readonly unknown[]).includes(value);
}

export function createExecutionRecorder(): ExecutionRecorder {
  const records: ExecutionResolverRecord[] = [];

  return {
    record(step) {
      if (!isExecutionPipelineStep(step)) return;
      records.push({ step, index: records.length });
    },
    list: () => freezeDeepExecutionResolver(records.map((item) => ({ ...item }))),
    count: (step) => (step === undefined ? records.length : records.filter((item) => item.step === step).length),
    reset() {
      records.length = 0;
    },
  };
}
