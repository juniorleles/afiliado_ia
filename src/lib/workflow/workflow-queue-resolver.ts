/**
 * Workflow Engine: queue resolver.
 *
 * Names which waiting room a stage uses, and which waiting item comes next.
 * It only reads. It never changes an item, never applies a move, and never
 * runs work. Equal items keep a stable order: higher priority first, then
 * earlier createdAt, then id.
 */
import type { WorkflowState } from "./workflow-types";
import { resolveWorkflowNextState } from "./workflow-transition-resolver";
import { isWorkflowState } from "./workflow-transition-validator";
import { WORKFLOW_QUEUE_DEFINITIONS, type WorkflowQueueId } from "./workflow-queue-registry";

export interface WorkflowQueueOrderable {
  id: string;
  queueId: WorkflowQueueId;
  priority: number;
  createdAt: string;
}

/** The waiting room for a stage, or null when the stage is final. */
export function resolveWorkflowQueueId(state: unknown): WorkflowQueueId | null {
  if (!isWorkflowState(state)) return null;
  return WORKFLOW_QUEUE_DEFINITIONS.find((definition) => definition.currentStates.includes(state))?.id ?? null;
}

/** The unique forward target for a stage, or null when the stage is final. */
export function resolveWorkflowQueueTarget(state: unknown): WorkflowState | null {
  return resolveWorkflowNextState(state).state;
}

export function orderWorkflowQueueItems<T extends WorkflowQueueOrderable>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function resolveNextWorkflowQueueItem<T extends WorkflowQueueOrderable>(
  items: readonly T[],
  queueId?: WorkflowQueueId,
): T | null {
  const waiting = queueId === undefined ? items : items.filter((item) => item.queueId === queueId);
  return orderWorkflowQueueItems(waiting)[0] ?? null;
}
