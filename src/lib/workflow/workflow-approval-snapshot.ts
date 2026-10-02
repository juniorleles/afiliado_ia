/**
 * Workflow Engine: approval snapshot.
 *
 * A frozen record of one human approval request. It stores the workflow id,
 * the workflow stage at request time, who asked, who approved, the approval
 * outcome, a timestamp, and flat metadata. The outcome field is not a
 * Decision Analysis. This module never notifies anyone and never runs work.
 */
import type { WorkflowMetadata, WorkflowState } from "./workflow-types";
import { freezeDeepWorkflow } from "./workflow-state-snapshot";
import type { WorkflowApprovalState } from "./workflow-approval-registry";

export const WORKFLOW_APPROVAL_SNAPSHOT_KEYS = [
  "id",
  "workflowId",
  "currentState",
  "requestedBy",
  "approvedBy",
  "decision",
  "timestamp",
  "metadata",
] as const;

export interface WorkflowApprovalSnapshot {
  id: string;
  workflowId: string;
  currentState: WorkflowState;
  requestedBy: string;
  approvedBy: string | null;
  /** Approval outcome. Not a Decision Analysis. */
  decision: WorkflowApprovalState;
  timestamp: string;
  metadata: WorkflowMetadata;
}

export interface WorkflowApprovalSnapshotInit {
  id: string;
  workflowId: string;
  currentState: WorkflowState;
  requestedBy: string;
  approvedBy?: string | null;
  decision: WorkflowApprovalState;
  timestamp: string;
  metadata?: WorkflowMetadata;
}

function copyPlain<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlain(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlain(inner)])) as T;
  }
  return value;
}

/** Builds a frozen approval snapshot from copies of the inputs. */
export function createWorkflowApprovalSnapshot(init: WorkflowApprovalSnapshotInit): WorkflowApprovalSnapshot {
  return freezeDeepWorkflow({
    id: init.id,
    workflowId: init.workflowId,
    currentState: init.currentState,
    requestedBy: init.requestedBy,
    approvedBy: init.approvedBy ?? null,
    decision: init.decision,
    timestamp: init.timestamp,
    metadata: copyPlain(init.metadata ?? {}),
  });
}
