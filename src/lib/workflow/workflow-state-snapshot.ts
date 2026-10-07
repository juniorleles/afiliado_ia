/**
 * Workflow Engine: state snapshot.
 *
 * A frozen record of one stage and the move that reached it. It stores the
 * current stage, the previous stage, the transition, a timestamp, and flat
 * metadata. It never applies a move and never changes what it is given.
 */
import type { WorkflowMetadata, WorkflowState, WorkflowTransition } from "./workflow-types";

export const WORKFLOW_STATE_SNAPSHOT_KEYS = ["currentState", "previousState", "transition", "timestamp", "metadata"] as const;

export interface WorkflowStateSnapshot {
  currentState: WorkflowState;
  previousState: WorkflowState | null;
  transition: WorkflowTransition | null;
  timestamp: string;
  metadata: WorkflowMetadata;
}

export interface WorkflowStateSnapshotInit {
  currentState: WorkflowState;
  previousState?: WorkflowState | null;
  transition?: WorkflowTransition | null;
  timestamp: string;
  metadata?: WorkflowMetadata;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepWorkflow<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepWorkflow(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

function copyPlain<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlain(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlain(inner)])) as T;
  }
  return value;
}

/** Builds a frozen snapshot from copies of the inputs. */
export function createWorkflowStateSnapshot(init: WorkflowStateSnapshotInit): WorkflowStateSnapshot {
  return freezeDeepWorkflow({
    currentState: init.currentState,
    previousState: init.previousState ?? null,
    transition: init.transition ? copyPlain(init.transition) : null,
    timestamp: init.timestamp,
    metadata: copyPlain(init.metadata ?? {}),
  });
}
