/**
 * Workflow Engine: queue validator.
 *
 * Reports problems with queue ids, items, enqueues, moves, and metadata.
 * It never throws, never changes its input, never applies a move, and never
 * runs work.
 */
import type { WorkflowMetadata, WorkflowState } from "./workflow-types";
import type { WorkflowIssue } from "./workflow-validator";
import { createWorkflowTransitionValidator, isFlatWorkflowMetadata, isWorkflowState } from "./workflow-transition-validator";
import { resolveWorkflowNextState } from "./workflow-transition-resolver";
import { createWorkflowQueueRegistry, type WorkflowQueueId, type WorkflowQueueRegistry } from "./workflow-queue-registry";

export const WORKFLOW_QUEUE_PRIORITY_MIN = 0;
export const WORKFLOW_QUEUE_PRIORITY_MAX = 1000;
export const WORKFLOW_QUEUE_PRIORITY_DEFAULT = 100;

export interface WorkflowQueueValidator {
  validateQueue(input: unknown): WorkflowIssue[];
  validateItem(input: unknown): WorkflowIssue[];
  validateEnqueue(input: unknown): WorkflowIssue[];
  validateMove(item: { currentState: WorkflowState }, queueId: unknown): WorkflowIssue[];
  validateDuplicate(items: Iterable<{ workflowId: string }>, workflowId: string): WorkflowIssue[];
  validateMetadata(input: unknown): WorkflowIssue[];
  validateWorkflowId(input: unknown): WorkflowIssue[];
}

export interface WorkflowQueueEnqueueInput {
  workflowId: string;
  candidateId: string;
  currentState: WorkflowState;
  targetState?: WorkflowState;
  queueId?: WorkflowQueueId;
  priority?: number;
  metadata?: WorkflowMetadata;
}

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isIso = (value: unknown): boolean => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));

export function isWorkflowQueuePriority(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= WORKFLOW_QUEUE_PRIORITY_MIN && value <= WORKFLOW_QUEUE_PRIORITY_MAX;
}

export function createWorkflowQueueValidator(options: { registry?: WorkflowQueueRegistry } = {}): WorkflowQueueValidator {
  const registry = options.registry ?? createWorkflowQueueRegistry();
  const transitions = createWorkflowTransitionValidator();

  const validateQueue = (input: unknown): WorkflowIssue[] => {
    const issues = registry.validate(input);
    if (issues.length > 0) return issues;
    if (registry.get(input as WorkflowQueueId) === null) {
      return [{ field: "queueId", message: `Invalid Queue: "${String(input)}" is not registered.` }];
    }
    return [];
  };

  const validateWorkflowId = (input: unknown): WorkflowIssue[] => {
    if (!nonEmpty(input)) return [{ field: "workflowId", message: "Unknown Workflow: a workflow id is required." }];
    return [];
  };

  const validateMetadata = (input: unknown): WorkflowIssue[] => {
    if (isFlatWorkflowMetadata(input)) return [];
    return [{ field: "metadata", message: "Invalid metadata: a flat record of strings, numbers, booleans, or null is required." }];
  };

  const validateEnqueue = (input: unknown): WorkflowIssue[] => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return [{ field: "input", message: "Invalid Queue: enqueue input must be an object." }];
    }
    const value = input as Record<string, unknown>;
    const issues = [...validateWorkflowId(value.workflowId)];
    if (!nonEmpty(value.candidateId)) issues.push({ field: "candidateId", message: "Unknown Workflow: a candidate id is required." });
    issues.push(...transitions.validateState(value.currentState));
    if (value.targetState !== undefined) issues.push(...transitions.validateState(value.targetState));
    if (value.queueId !== undefined) issues.push(...validateQueue(value.queueId));
    if (value.priority !== undefined && !isWorkflowQueuePriority(value.priority)) {
      issues.push({ field: "priority", message: `Invalid Queue: priority must be an integer from ${WORKFLOW_QUEUE_PRIORITY_MIN} to ${WORKFLOW_QUEUE_PRIORITY_MAX}.` });
    }
    if (value.metadata !== undefined) issues.push(...validateMetadata(value.metadata));
    if (issues.length > 0) return issues;

    const current = value.currentState as WorkflowState;
    const next = resolveWorkflowNextState(current);
    const target = value.targetState === undefined ? next.state : (value.targetState as WorkflowState);
    if (target === null) {
      issues.push({ field: "currentState", message: "Invalid Transition: a terminal stage does not wait in a queue." });
      return issues;
    }
    issues.push(...transitions.validateTransition({ from: current, to: target }));
    if (value.queueId !== undefined && !registry.accepts(value.queueId as WorkflowQueueId, current)) {
      issues.push({ field: "queueId", message: `Invalid Queue: "${String(value.queueId)}" does not accept ${current}.` });
    }
    return issues;
  };

  const validateItem = (input: unknown): WorkflowIssue[] => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return [{ field: "item", message: "Invalid Queue: a queue item must be an object." }];
    }
    const item = input as Record<string, unknown>;
    const issues: WorkflowIssue[] = [];
    if (!nonEmpty(item.id)) issues.push({ field: "id", message: "Invalid Queue: an item id is required." });
    issues.push(...validateQueue(item.queueId));
    issues.push(...validateWorkflowId(item.workflowId));
    if (!nonEmpty(item.candidateId)) issues.push({ field: "candidateId", message: "Unknown Workflow: a candidate id is required." });
    issues.push(...transitions.validateState(item.currentState));
    issues.push(...transitions.validateState(item.targetState));
    if (!isWorkflowQueuePriority(item.priority)) {
      issues.push({ field: "priority", message: `Invalid Queue: priority must be an integer from ${WORKFLOW_QUEUE_PRIORITY_MIN} to ${WORKFLOW_QUEUE_PRIORITY_MAX}.` });
    }
    if (!isIso(item.createdAt)) issues.push({ field: "createdAt", message: "Invalid Queue: createdAt must be an ISO timestamp." });
    if (!isIso(item.updatedAt)) issues.push({ field: "updatedAt", message: "Invalid Queue: updatedAt must be an ISO timestamp." });
    issues.push(...validateMetadata(item.metadata));
    if (isWorkflowState(item.currentState) && isWorkflowState(item.targetState)) {
      issues.push(...transitions.validateTransition({ from: item.currentState, to: item.targetState }));
    }
    return issues;
  };

  const validateMove = (item: { currentState: WorkflowState }, queueId: unknown): WorkflowIssue[] => {
    const issues = validateQueue(queueId);
    if (issues.length > 0) return issues;
    if (!registry.accepts(queueId as WorkflowQueueId, item.currentState)) {
      return [{ field: "queueId", message: `Invalid Queue: "${String(queueId)}" does not accept ${item.currentState}.` }];
    }
    return [];
  };

  const validateDuplicate = (items: Iterable<{ workflowId: string }>, workflowId: string): WorkflowIssue[] => {
    for (const item of items) {
      if (item.workflowId === workflowId) {
        return [{ field: "workflowId", message: `Duplicate Queue Item: workflow "${workflowId}" is already waiting.` }];
      }
    }
    return [];
  };

  return { validateQueue, validateItem, validateEnqueue, validateMove, validateDuplicate, validateMetadata, validateWorkflowId };
}
