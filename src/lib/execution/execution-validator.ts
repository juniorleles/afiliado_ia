/**
 * Execution Planner: validator contract.
 *
 * Interface only. Each method reports problems and never throws or changes its
 * input. No graph walks ship in this step. The rules a later step must hold:
 *
 *  - Duplicate Task: a second registration of the same task id is rejected;
 *  - Circular Dependency: a cycle in the task graph is rejected;
 *  - Missing Dependency: a from or to that names no registered task is
 *    rejected;
 *  - Invalid Metadata: metadata must be a flat record of text, numbers,
 *    booleans, or null.
 *
 * This validator does not judge a Decision Analysis or a workflow snapshot.
 */
import type { ExecutionDependency, ExecutionTask } from "./execution-types";

export interface ExecutionIssue {
  field: string;
  message: string;
}

export interface ExecutionValidator {
  validateTask(input: unknown): ExecutionIssue[];
  validateDependency(input: unknown): ExecutionIssue[];
  validatePlan(input: unknown): ExecutionIssue[];
  validateContext(input: unknown): ExecutionIssue[];
  validateMetadata(input: unknown): ExecutionIssue[];
  /** Circular Dependency, Missing Dependency, Duplicate Task. */
  validateGraph(tasks: ExecutionTask[], dependencies: ExecutionDependency[]): ExecutionIssue[];
  validatePreconditions(input: unknown): ExecutionIssue[];
}
