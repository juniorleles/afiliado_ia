/**
 * Execution Planner: domain model.
 *
 * Architecture only. This planner names the tasks, steps, and dependencies a
 * later host will order. It does not run those tasks, reach an outside
 * system, or change a workflow stage. This module names the shapes the
 * planner will exchange and defines no scale or rule. Other engines are
 * referred to by id only; a plan never copies or changes a Decision Analysis
 * or a workflow snapshot.
 */

/** Flat metadata: strings, numbers, booleans, or null. */
export type ExecutionMetadata = Record<string, string | number | boolean | null>;

/** One unit of planned work. The architecture does not run it. */
export const EXECUTION_TASK_KEYS = ["id", "name", "steps", "metadata"] as const;

export interface ExecutionTask {
  id: string;
  name: string;
  steps: ExecutionStep[];
  metadata: ExecutionMetadata;
}

/** One named step inside a task. The architecture does not run it. */
export interface ExecutionStep {
  id: string;
  name: string;
  metadata: ExecutionMetadata;
}

/** One directed wait: `to` may start only after `from`. */
export interface ExecutionDependency {
  from: string;
  to: string;
}

/** One named gate that must hold before a plan may be used. Restated, never judged. */
export interface ExecutionPrecondition {
  id: string;
  metadata: ExecutionMetadata;
}
