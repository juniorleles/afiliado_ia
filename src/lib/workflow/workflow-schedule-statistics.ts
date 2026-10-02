/**
 * Workflow Engine: schedule statistics.
 *
 * Pure counters derived from planned windows. It never changes an item, never
 * opens a window, and never runs work.
 */
import { WORKFLOW_SCHEDULE_KINDS, type WorkflowScheduleKind, type WorkflowExecutionWindow } from "./workflow-schedule-registry";
import { isWorkflowScheduleEligible, resolveWorkflowNextRun } from "./workflow-schedule-resolver";

export interface WorkflowScheduleCountable {
  executionWindow: Pick<WorkflowExecutionWindow, "kind" | "startAt" | "endAt" | "intervalMs" | "paused">;
}

export interface WorkflowScheduleStatistics {
  total: number;
  paused: number;
  eligible: number;
  byKind: Record<WorkflowScheduleKind, number>;
  nextRun: string | null;
}

export function computeWorkflowScheduleStatistics(
  items: readonly WorkflowScheduleCountable[],
  nowMs: number,
): WorkflowScheduleStatistics {
  const byKind = Object.fromEntries(WORKFLOW_SCHEDULE_KINDS.map((kind) => [kind, 0])) as Record<
    WorkflowScheduleKind,
    number
  >;
  let paused = 0;
  let eligible = 0;
  let nextAt: number | null = null;
  let nextRun: string | null = null;

  for (const item of items) {
    byKind[item.executionWindow.kind] += 1;
    if (item.executionWindow.paused) paused += 1;
    if (isWorkflowScheduleEligible(item.executionWindow, nowMs)) eligible += 1;
    const run = resolveWorkflowNextRun(item.executionWindow, nowMs);
    if (run === null) continue;
    const time = Date.parse(run);
    if (nextAt === null || time < nextAt) {
      nextAt = time;
      nextRun = run;
    }
  }

  return { total: items.length, paused, eligible, byKind, nextRun };
}
