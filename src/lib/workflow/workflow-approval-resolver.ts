/**
 * Workflow Engine: approval resolver.
 *
 * Names which approval action may run from a state, and which state it
 * reaches. It only reads. It never changes a snapshot, never notifies anyone,
 * and never runs work. Equal snapshots keep a stable order: earlier timestamp
 * first, then id.
 */
import {
  isWorkflowApprovalState,
  type WorkflowApprovalState,
} from "./workflow-approval-registry";

export const WORKFLOW_APPROVAL_ACTIONS = [
  "RequestApproval",
  "Approve",
  "Reject",
  "ReturnForChanges",
  "CancelRequest",
  "ExpireRequest",
] as const;
export type WorkflowApprovalAction = (typeof WORKFLOW_APPROVAL_ACTIONS)[number];

export const WORKFLOW_APPROVAL_TRANSITIONS: Readonly<Record<WorkflowApprovalState, readonly WorkflowApprovalAction[]>> = {
  PendingApproval: ["Approve", "Reject", "ReturnForChanges", "CancelRequest", "ExpireRequest"],
  Approved: [],
  Rejected: [],
  NeedsChanges: ["RequestApproval", "CancelRequest", "ExpireRequest"],
  Cancelled: [],
  Expired: [],
};

export const WORKFLOW_APPROVAL_ACTION_TARGET: Readonly<Record<WorkflowApprovalAction, WorkflowApprovalState>> = {
  RequestApproval: "PendingApproval",
  Approve: "Approved",
  Reject: "Rejected",
  ReturnForChanges: "NeedsChanges",
  CancelRequest: "Cancelled",
  ExpireRequest: "Expired",
};

export interface WorkflowApprovalOrderable {
  id: string;
  timestamp: string;
}

export function isWorkflowApprovalAction(value: unknown): value is WorkflowApprovalAction {
  return typeof value === "string" && (WORKFLOW_APPROVAL_ACTIONS as readonly string[]).includes(value);
}

export function isWorkflowApprovalOpen(state: WorkflowApprovalState): boolean {
  return state === "PendingApproval" || state === "NeedsChanges";
}

export function isWorkflowApprovalTerminal(state: WorkflowApprovalState): boolean {
  return WORKFLOW_APPROVAL_TRANSITIONS[state].length === 0;
}

export function resolveWorkflowApprovalActions(from: unknown): readonly WorkflowApprovalAction[] {
  if (!isWorkflowApprovalState(from)) return [];
  return WORKFLOW_APPROVAL_TRANSITIONS[from];
}

/** The state an action reaches, or null when the move is not allowed. */
export function resolveWorkflowApprovalDecision(
  from: unknown,
  action: unknown,
): WorkflowApprovalState | null {
  if (!isWorkflowApprovalAction(action)) return null;
  if (from === null || from === undefined) {
    return action === "RequestApproval" ? "PendingApproval" : null;
  }
  if (!isWorkflowApprovalState(from)) return null;
  if (!WORKFLOW_APPROVAL_TRANSITIONS[from].includes(action)) return null;
  return WORKFLOW_APPROVAL_ACTION_TARGET[action];
}

export function orderWorkflowApprovalSnapshots<T extends WorkflowApprovalOrderable>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
}
