/**
 * Workflow Engine: queue statistics.
 *
 * Pure counters derived from waiting items. It never changes an item, never
 * applies a move, and never runs work.
 */
import { WORKFLOW_QUEUE_IDS, type WorkflowQueueId } from "./workflow-queue-registry";

export interface WorkflowQueueCountable {
  queueId: WorkflowQueueId;
}

export interface WorkflowQueueStatistics {
  total: number;
  held: number;
  byQueue: Record<WorkflowQueueId, number>;
}

export function computeWorkflowQueueStatistics(
  waiting: readonly WorkflowQueueCountable[],
  heldCount = 0,
): WorkflowQueueStatistics {
  const byQueue = Object.fromEntries(WORKFLOW_QUEUE_IDS.map((id) => [id, 0])) as Record<WorkflowQueueId, number>;
  for (const item of waiting) byQueue[item.queueId] += 1;
  return { total: waiting.length, held: heldCount, byQueue };
}
