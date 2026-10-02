/**
 * Execution Task Framework: task contract.
 *
 * What an independent task module must expose to be plugged into the
 * pipeline. The framework only calls these members; it never interprets what
 * a task names. No task ships with the framework. A task never runs work,
 * never reaches an outside system, never writes a store, and never changes a
 * workflow stage. It only builds a plan fragment.
 *
 * Distinct from ExecutionTask in execution-types.ts, which is the plan record.
 */
import type { ExecutionIssue } from "./execution-validator";
import type { ExecutionMetadata } from "./execution-types";
import type { ExecutionTaskContext } from "./execution-task-context";

/** The groups a task can belong to. FUTURE is the room left for later groups. */
export const EXECUTION_TASK_CATEGORIES = [
  "PREPARATION",
  "VALIDATION",
  "GENERATION",
  "REVIEW",
  "PUBLICATION",
  "MONITORING",
  "FUTURE",
] as const;
export type ExecutionTaskCategory = (typeof EXECUTION_TASK_CATEGORIES)[number];

/** How a task build ended. SKIPPED means build() was not called to completion. BLOCKED means a required task was not READY. */
export const EXECUTION_TASK_RESULT_STATUSES = ["READY", "BLOCKED", "SKIPPED", "FAILED"] as const;
export type ExecutionTaskResultStatus = (typeof EXECUTION_TASK_RESULT_STATUSES)[number];

/**
 * Relations to other tasks by id. The framework validates them and never
 * resolves them on its own: nothing is registered or enabled automatically.
 */
export interface ExecutionTaskDependencies {
  /** Must be registered and enabled, and collected first. */
  requires: readonly string[];
  /** Collected first when registered and enabled; otherwise ignored. */
  optional: readonly string[];
  /** Must not be enabled at the same time. */
  conflicts: readonly string[];
}

/** What build() returns. The pipeline adds the task id, restated dependencies, and order. */
export interface ExecutionTaskOutput {
  status: ExecutionTaskResultStatus;
  warnings: string[];
  metadata: ExecutionMetadata;
  /** Milliseconds the task named as a duration; not measured by the framework. Null when unnamed. */
  estimatedDuration: number | null;
}

/** What the pipeline collects for each task. Carries no score and no outside call. */
export interface ExecutionTaskResult extends ExecutionTaskOutput {
  taskId: string;
  dependencies: ExecutionTaskDependencies;
  /** Position in the collected order. Order is not a scale. */
  executionOrder: number;
}

/** Results of already-collected tasks this task declared in requires or optional. */
export type ExecutionTaskUpstream = Readonly<Record<string, Readonly<ExecutionTaskResult>>>;

/** A registered task and whether it is currently enabled. Changed only by the registry. */
export interface ExecutionTaskEntry {
  readonly id: string;
  readonly module: ExecutionTaskModule;
  readonly enabled: boolean;
}

export interface ExecutionTaskModule {
  readonly id: string;
  readonly name: string;
  /** Semantic version, for example "1.0.0". */
  readonly version: string;
  readonly category: ExecutionTaskCategory;
  /** Whether the task starts enabled when registered. */
  readonly enabled: boolean;
  /** Higher is collected first among tasks with no dependency between them. */
  readonly priority: number;
  readonly dependencies: ExecutionTaskDependencies;
  /** False skips the task for this context. */
  supportsPlan(context: ExecutionTaskContext): boolean;
  /** Builds a plan fragment. Does not run work. */
  build(context: ExecutionTaskContext, upstream: ExecutionTaskUpstream): ExecutionTaskOutput | Promise<ExecutionTaskOutput>;
  /** Problems that stop build() from running on this context; empty when valid. */
  validate(context: ExecutionTaskContext): ExecutionIssue[];
}
