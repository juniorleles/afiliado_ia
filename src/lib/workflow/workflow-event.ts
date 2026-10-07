/**
 * Workflow Engine: event payload.
 *
 * A frozen notice that something already happened. It never applies a move,
 * never runs work, and never records a business choice. Other engines are
 * referred to by id only.
 */
import type { WorkflowMetadata, WorkflowState, WorkflowTransition } from "./workflow-types";
import { freezeDeepWorkflow } from "./workflow-state-snapshot";

export const WORKFLOW_EVENT_TYPES = [
  "WorkflowCreated",
  "StateChanged",
  "CandidateQueued",
  "CandidateDequeued",
  "ReviewRequested",
  "ReviewCompleted",
  "PublicationReady",
  "PublicationCompleted",
  "MonitoringStarted",
  "WorkflowArchived",
  "WorkflowFailed",
] as const;
export type WorkflowEventType = (typeof WORKFLOW_EVENT_TYPES)[number];

export const WORKFLOW_EVENT_KEYS = [
  "id",
  "type",
  "workflowId",
  "candidateId",
  "previousState",
  "currentState",
  "timestamp",
  "metadata",
] as const;

export interface WorkflowEvent {
  id: string;
  type: WorkflowEventType;
  workflowId: string;
  candidateId: string;
  previousState: WorkflowState | null;
  currentState: WorkflowState;
  timestamp: string;
  metadata: WorkflowMetadata;
}

export interface WorkflowEventInit {
  id: string;
  type: WorkflowEventType;
  workflowId: string;
  candidateId: string;
  previousState?: WorkflowState | null;
  currentState: WorkflowState;
  timestamp: string;
  metadata?: WorkflowMetadata;
  transition?: WorkflowTransition | null;
}

function copyPlain<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlain(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlain(inner)])) as T;
  }
  return value;
}

export function isWorkflowEventType(value: unknown): value is WorkflowEventType {
  return typeof value === "string" && (WORKFLOW_EVENT_TYPES as readonly string[]).includes(value);
}

/** Builds a frozen event from copies of the inputs. */
export function createWorkflowEvent(init: WorkflowEventInit): WorkflowEvent {
  const previousState = init.previousState !== undefined ? init.previousState : (init.transition?.from ?? null);
  const currentState = init.transition?.to ?? init.currentState;
  return freezeDeepWorkflow({
    id: init.id,
    type: init.type,
    workflowId: init.workflowId,
    candidateId: init.candidateId,
    previousState,
    currentState,
    timestamp: init.timestamp,
    metadata: copyPlain(init.metadata ?? {}),
  });
}
