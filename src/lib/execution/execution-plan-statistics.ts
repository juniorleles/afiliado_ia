/**
 * Execution Plan Builder: statistics.
 *
 * Pure counters derived from task results and the assembled plan. It never
 * changes a result, never runs a task, and never names a scale.
 */
import { EXECUTION_TASK_RESULT_STATUSES, type ExecutionTaskResult } from "./execution-task-contract";

export interface ExecutionPlanStatistics {
  total: number;
  ready: number;
  blocked: number;
  skipped: number;
  failed: number;
  dependencyCount: number;
  stageCount: number;
  preconditionCount: number;
  postconditionCount: number;
  conflictCount: number;
  /** Sum of named durations on READY results; unnamed durations count as 0. */
  estimatedDuration: number;
}

export interface ExecutionPlanStatisticsExtras {
  dependencyCount?: number;
  stageCount?: number;
  preconditionCount?: number;
  postconditionCount?: number;
  conflictCount?: number;
}

export function computeExecutionPlanStatistics(
  results: readonly ExecutionTaskResult[],
  extras: ExecutionPlanStatisticsExtras = {},
): ExecutionPlanStatistics {
  const byStatus = Object.fromEntries(EXECUTION_TASK_RESULT_STATUSES.map((status) => [status, 0])) as Record<
    (typeof EXECUTION_TASK_RESULT_STATUSES)[number],
    number
  >;
  let estimatedDuration = 0;
  for (const result of results) {
    byStatus[result.status] += 1;
    if (result.status === "READY" && result.estimatedDuration !== null) estimatedDuration += result.estimatedDuration;
  }
  return {
    total: results.length,
    ready: byStatus.READY,
    blocked: byStatus.BLOCKED,
    skipped: byStatus.SKIPPED,
    failed: byStatus.FAILED,
    dependencyCount: extras.dependencyCount ?? 0,
    stageCount: extras.stageCount ?? 0,
    preconditionCount: extras.preconditionCount ?? 0,
    postconditionCount: extras.postconditionCount ?? 0,
    conflictCount: extras.conflictCount ?? 0,
    estimatedDuration,
  };
}
