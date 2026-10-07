/**
 * Execution Plan Builder: snapshot.
 *
 * A frozen record of one built plan: the plan id, the workflow snapshot id,
 * the Decision Analysis id, the ordered task ids, the dependencies, a
 * creation timestamp, and flat metadata. It never runs a task, never reaches
 * an outside system, and never changes what it is given.
 */
import type { ExecutionDependency, ExecutionMetadata, ExecutionPrecondition, ExecutionStep, ExecutionTask } from "./execution-types";
import type { ExecutionTaskCategory } from "./execution-task-contract";

export const EXECUTION_PLAN_SNAPSHOT_KEYS = [
  "planId",
  "workflowId",
  "decisionId",
  "orderedTasks",
  "dependencies",
  "createdAt",
  "metadata",
] as const;

export interface ExecutionPlanSnapshot {
  planId: string;
  /** The workflow snapshot this plan reads. A reference only. */
  workflowId: string | null;
  /** The Decision Analysis this plan reads. A reference only. */
  decisionId: string | null;
  orderedTasks: readonly string[];
  dependencies: readonly ExecutionDependency[];
  createdAt: string;
  metadata: ExecutionMetadata;
}

/** One named gate that must hold after a plan is used. Restated, never judged. */
export interface ExecutionPostcondition {
  id: string;
  metadata: ExecutionMetadata;
}

/** One named group of ordered task ids. Empty groups are omitted. */
export interface ExecutionStage {
  id: ExecutionTaskCategory;
  category: ExecutionTaskCategory;
  taskIds: readonly string[];
}

/** Optional names and groups for plan records. Category defaults to FUTURE. */
export interface ExecutionPlanTaskSpec {
  id: string;
  name: string;
  category?: ExecutionTaskCategory;
  steps?: readonly ExecutionStep[];
  metadata?: ExecutionMetadata;
}

export const BUILT_EXECUTION_PLAN_KEYS = [
  "id",
  "decisionAnalysisId",
  "workflowSnapshotId",
  "tasks",
  "dependencies",
  "preconditions",
  "postconditions",
  "stages",
  "metadata",
  "executionTime",
  "createdAt",
] as const;

/** One immutable plan assembled from task results. Does not run work. */
export interface BuiltExecutionPlan {
  id: string;
  decisionAnalysisId: string | null;
  workflowSnapshotId: string | null;
  tasks: ExecutionTask[];
  dependencies: ExecutionDependency[];
  preconditions: ExecutionPrecondition[];
  postconditions: ExecutionPostcondition[];
  stages: ExecutionStage[];
  metadata: ExecutionMetadata;
  executionTime: number;
  createdAt: string;
}

export interface ExecutionPlanSummary {
  planId: string;
  taskCount: number;
  readyCount: number;
  stageCount: number;
  dependencyCount: number;
}

export interface ExecutionPlanSnapshotInit {
  planId: string;
  workflowId: string | null;
  decisionId: string | null;
  orderedTasks: readonly string[];
  dependencies: readonly ExecutionDependency[];
  createdAt: string;
  metadata?: ExecutionMetadata;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepExecutionPlan<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepExecutionPlan(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainExecutionPlan<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainExecutionPlan(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainExecutionPlan(inner)])) as T;
  }
  return value;
}

export function copyIdHolder(value: { id: string } | null | undefined): { id: string } | null {
  return value && typeof value.id === "string" ? { id: value.id } : null;
}

/** Builds a frozen snapshot from copies of the inputs. */
export function createExecutionPlanSnapshot(init: ExecutionPlanSnapshotInit): ExecutionPlanSnapshot {
  return freezeDeepExecutionPlan({
    planId: init.planId,
    workflowId: init.workflowId,
    decisionId: init.decisionId,
    orderedTasks: [...init.orderedTasks],
    dependencies: copyPlainExecutionPlan([...init.dependencies]),
    createdAt: init.createdAt,
    metadata: copyPlainExecutionPlan(init.metadata ?? {}),
  });
}
