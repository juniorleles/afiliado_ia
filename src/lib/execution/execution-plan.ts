/**
 * Execution Planner: plan record.
 *
 * Architecture only. One immutable plan is the planner's only output. It
 * carries ordered tasks, dependencies, preconditions, metadata, and elapsed
 * time. It does not run a task, reach an outside system, or change a
 * workflow stage.
 */
import type {
  ExecutionDependency,
  ExecutionMetadata,
  ExecutionPrecondition,
  ExecutionTask,
} from "./execution-types";

/** Fields one plan carries. */
export const EXECUTION_PLAN_KEYS = [
  "id",
  "decisionAnalysisId",
  "workflowSnapshotId",
  "tasks",
  "dependencies",
  "preconditions",
  "metadata",
  "executionTime",
  "createdAt",
] as const;

/** One planned order of work for one Decision Analysis and one workflow snapshot. Timestamps are ISO strings. */
export interface ExecutionPlan {
  id: string;
  /** The Decision Analysis this plan reads. A reference only. */
  decisionAnalysisId: string | null;
  /** The workflow snapshot this plan reads. A reference only. */
  workflowSnapshotId: string | null;
  /** Tasks in the order they were planned. Order is not a scale. */
  tasks: ExecutionTask[];
  dependencies: ExecutionDependency[];
  preconditions: ExecutionPrecondition[];
  metadata: ExecutionMetadata;
  /** Elapsed time in milliseconds as the planner reported it. */
  executionTime: number;
  createdAt: string;
}
