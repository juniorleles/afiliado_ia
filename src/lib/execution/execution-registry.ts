/**
 * Execution Planner: registry contract.
 *
 * Interface only. The registry is the single list of tasks and dependencies
 * the planner may use. It supports registering a task, registering a
 * dependency, validating one without registering it, and listing them. No
 * implementation ships in this step.
 *
 * Register rejects a duplicate task id. Validate reports without registering.
 */
import type { ExecutionIssue } from "./execution-validator";
import type { ExecutionDependency, ExecutionTask } from "./execution-types";

export interface ExecutionRegistry {
  /** Adds a task. Rejects an invalid task or a duplicate task id. */
  registerTask(task: ExecutionTask): ExecutionTask;
  /** Adds a wait between two tasks. Rejects an invalid pair. */
  registerDependency(dependency: ExecutionDependency): ExecutionDependency;
  getTask(id: string): ExecutionTask | null;
  getDependency(from: string, to: string): ExecutionDependency | null;
  listTasks(): ExecutionTask[];
  listDependencies(): ExecutionDependency[];
  /** Reports problems with a task without registering it. */
  validateTask(task: unknown): ExecutionIssue[];
  /** Reports problems with a dependency without registering it. */
  validateDependency(dependency: unknown): ExecutionIssue[];
}
