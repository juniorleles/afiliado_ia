/**
 * Workflow Engine: approval validator.
 *
 * Reports problems with approval states, actions, snapshots, requests, and
 * metadata. It never throws, never changes its input, never notifies anyone,
 * and never runs work.
 */
import type { WorkflowMetadata, WorkflowState } from "./workflow-types";
import type { WorkflowIssue } from "./workflow-validator";
import { isFlatWorkflowMetadata, isWorkflowState, isWorkflowTerminalState } from "./workflow-transition-validator";
import {
  createWorkflowApprovalRegistry,
  isWorkflowApprovalState,
  type WorkflowApprovalRegistry,
  type WorkflowApprovalState,
} from "./workflow-approval-registry";
import {
  isWorkflowApprovalAction,
  isWorkflowApprovalOpen,
  resolveWorkflowApprovalDecision,
  type WorkflowApprovalAction,
} from "./workflow-approval-resolver";

export interface WorkflowApprovalValidator {
  validateState(input: unknown): WorkflowIssue[];
  validateAction(input: unknown): WorkflowIssue[];
  validateTransition(from: unknown, action: unknown): WorkflowIssue[];
  validateSnapshot(input: unknown): WorkflowIssue[];
  validateRequest(input: unknown): WorkflowIssue[];
  validateDuplicate(
    items: Iterable<{ workflowId: string; decision: WorkflowApprovalState }>,
    workflowId: string,
  ): WorkflowIssue[];
  validateMetadata(input: unknown): WorkflowIssue[];
  validateWorkflowId(input: unknown): WorkflowIssue[];
}

export interface WorkflowApprovalRequestInput {
  workflowId: string;
  currentState: WorkflowState;
  requestedBy: string;
  metadata?: WorkflowMetadata;
}

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isIso = (value: unknown): boolean =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));

export function createWorkflowApprovalValidator(
  options: { registry?: WorkflowApprovalRegistry } = {},
): WorkflowApprovalValidator {
  const registry = options.registry ?? createWorkflowApprovalRegistry();

  const validateState = (input: unknown): WorkflowIssue[] => {
    const issues = registry.validate(input);
    if (issues.length > 0) return issues;
    if (registry.get(input as WorkflowApprovalState) === null) {
      return [{ field: "decision", message: `Invalid State: "${String(input)}" is not registered.` }];
    }
    return [];
  };

  const validateAction = (input: unknown): WorkflowIssue[] => {
    if (!isWorkflowApprovalAction(input)) {
      return [{ field: "action", message: `Invalid Transition: "${String(input)}" is not an approval action.` }];
    }
    return [];
  };

  const validateTransition = (from: unknown, action: unknown): WorkflowIssue[] => {
    const actionIssues = validateAction(action);
    if (actionIssues.length > 0) return actionIssues;
    if (from === null || from === undefined) {
      if (action === "RequestApproval") return [];
      return [{ field: "action", message: `Invalid Transition: ${String(action)} cannot open a request.` }];
    }
    const stateIssues = validateState(from);
    if (stateIssues.length > 0) return stateIssues;
    if (resolveWorkflowApprovalDecision(from, action) === null) {
      return [{ field: "action", message: `Invalid Transition: ${String(action)} is not allowed from ${String(from)}.` }];
    }
    return [];
  };

  const validateWorkflowId = (input: unknown): WorkflowIssue[] => {
    if (!nonEmpty(input)) return [{ field: "workflowId", message: "Unknown Workflow: a workflow id is required." }];
    return [];
  };

  const validateWorkflowState = (input: unknown): WorkflowIssue[] => {
    if (input === undefined || input === null || input === "") {
      return [{ field: "currentState", message: "Invalid State: a workflow stage is required." }];
    }
    if (!isWorkflowState(input)) {
      return [{ field: "currentState", message: `Invalid State: "${String(input)}" is not a workflow stage.` }];
    }
    if (isWorkflowTerminalState(input)) {
      return [{ field: "currentState", message: "Invalid State: a terminal stage cannot request approval." }];
    }
    return [];
  };

  const validateMetadata = (input: unknown): WorkflowIssue[] => {
    if (isFlatWorkflowMetadata(input)) return [];
    return [{ field: "metadata", message: "Invalid Metadata: a flat record of strings, numbers, booleans, or null is required." }];
  };

  const validateRequest = (input: unknown): WorkflowIssue[] => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return [{ field: "input", message: "Invalid Metadata: request input must be an object." }];
    }
    const value = input as Record<string, unknown>;
    const issues = [...validateWorkflowId(value.workflowId), ...validateWorkflowState(value.currentState)];
    if (!nonEmpty(value.requestedBy)) {
      issues.push({ field: "requestedBy", message: "Invalid Metadata: requestedBy is required." });
    }
    if (value.metadata !== undefined) issues.push(...validateMetadata(value.metadata));
    return issues;
  };

  const validateSnapshot = (input: unknown): WorkflowIssue[] => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return [{ field: "item", message: "Invalid Metadata: an approval snapshot must be an object." }];
    }
    const item = input as Record<string, unknown>;
    const issues: WorkflowIssue[] = [];
    if (!nonEmpty(item.id)) issues.push({ field: "id", message: "Invalid Metadata: an approval id is required." });
    issues.push(...validateWorkflowId(item.workflowId));
    if (item.currentState === undefined || item.currentState === null || item.currentState === "") {
      issues.push({ field: "currentState", message: "Invalid State: a workflow stage is required." });
    } else if (!isWorkflowState(item.currentState)) {
      issues.push({ field: "currentState", message: `Invalid State: "${String(item.currentState)}" is not a workflow stage.` });
    }
    if (!nonEmpty(item.requestedBy)) issues.push({ field: "requestedBy", message: "Invalid Metadata: requestedBy is required." });
    if (item.approvedBy !== null && !nonEmpty(item.approvedBy)) {
      issues.push({ field: "approvedBy", message: "Invalid Metadata: approvedBy must be a name or null." });
    }
    issues.push(...validateState(item.decision));
    if (!isIso(item.timestamp)) issues.push({ field: "timestamp", message: "Invalid Metadata: timestamp must be an ISO timestamp." });
    issues.push(...validateMetadata(item.metadata));
    return issues;
  };

  const validateDuplicate = (
    items: Iterable<{ workflowId: string; decision: WorkflowApprovalState }>,
    workflowId: string,
  ): WorkflowIssue[] => {
    for (const item of items) {
      if (item.workflowId === workflowId && isWorkflowApprovalState(item.decision) && isWorkflowApprovalOpen(item.decision) && item.decision === "PendingApproval") {
        return [{ field: "workflowId", message: `Duplicate Approval: workflow "${workflowId}" already has a pending request.` }];
      }
    }
    return [];
  };

  return {
    validateState,
    validateAction,
    validateTransition,
    validateSnapshot,
    validateRequest,
    validateDuplicate,
    validateMetadata,
    validateWorkflowId,
  };
}
