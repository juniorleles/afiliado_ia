/**
 * Workflow Engine: schedule validator.
 *
 * Reports problems with kinds, windows, items, plans, and metadata. It never
 * throws, never changes its input, never opens a window, and never runs work.
 */
import type { WorkflowMetadata, WorkflowState } from "./workflow-types";
import type { WorkflowIssue } from "./workflow-validator";
import { isFlatWorkflowMetadata, isWorkflowState } from "./workflow-transition-validator";
import {
  createWorkflowQueueRegistry,
  type WorkflowQueueId,
  type WorkflowQueueRegistry,
} from "./workflow-queue-registry";
import { resolveWorkflowQueueId } from "./workflow-queue-resolver";
import {
  createWorkflowScheduleRegistry,
  isWorkflowScheduleKind,
  type WorkflowScheduleKind,
  type WorkflowScheduleRegistry,
} from "./workflow-schedule-registry";

export interface WorkflowScheduleValidator {
  validateKind(input: unknown): WorkflowIssue[];
  validateQueue(input: unknown): WorkflowIssue[];
  validateState(input: unknown): WorkflowIssue[];
  validateWindow(input: unknown, nowMs?: number): WorkflowIssue[];
  validateItem(input: unknown): WorkflowIssue[];
  validatePlan(input: unknown, nowMs?: number): WorkflowIssue[];
  validateDuplicate(items: Iterable<{ workflowId: string }>, workflowId: string): WorkflowIssue[];
  validateMetadata(input: unknown): WorkflowIssue[];
  validateWorkflowId(input: unknown): WorkflowIssue[];
}

export interface WorkflowSchedulePlanInput {
  workflowId: string;
  queueId?: WorkflowQueueId;
  currentState: WorkflowState;
  kind: WorkflowScheduleKind;
  startAt?: string;
  endAt?: string | null;
  delayMs?: number;
  intervalMs?: number;
  retryCount?: number;
  metadata?: WorkflowMetadata;
}

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isIso = (value: unknown): boolean =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const isDelay = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const isInterval = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;

function intendedStartAt(value: Record<string, unknown>, nowMs: number): string | null {
  if (value.startAt !== undefined && value.startAt !== null) return isIso(value.startAt) ? (value.startAt as string) : null;
  const kind = value.kind;
  if (kind === "Delayed" || kind === "Retry") {
    if (!isDelay(value.delayMs)) return null;
    return new Date(nowMs + value.delayMs).toISOString();
  }
  return new Date(nowMs).toISOString();
}

export function createWorkflowScheduleValidator(
  options: { registry?: WorkflowScheduleRegistry; queues?: WorkflowQueueRegistry } = {},
): WorkflowScheduleValidator {
  const registry = options.registry ?? createWorkflowScheduleRegistry();
  const queues = options.queues ?? createWorkflowQueueRegistry();

  const validateKind = (input: unknown): WorkflowIssue[] => {
    const issues = registry.validate(input);
    if (issues.length > 0) return issues;
    if (registry.get(input as WorkflowScheduleKind) === null) {
      return [{ field: "kind", message: `Invalid Window: "${String(input)}" is not registered.` }];
    }
    return [];
  };

  const validateQueue = (input: unknown): WorkflowIssue[] => {
    const issues = queues.validate(input);
    if (issues.length > 0) return issues;
    if (queues.get(input as WorkflowQueueId) === null) {
      return [{ field: "queueId", message: `Invalid Queue: "${String(input)}" is not registered.` }];
    }
    return [];
  };

  const validateState = (input: unknown): WorkflowIssue[] => {
    if (input === undefined || input === null || input === "") {
      return [{ field: "currentState", message: "Invalid State: a workflow stage is required." }];
    }
    if (!isWorkflowState(input)) {
      return [{ field: "currentState", message: `Invalid State: "${String(input)}" is not a workflow stage.` }];
    }
    return [];
  };

  const validateWorkflowId = (input: unknown): WorkflowIssue[] => {
    if (!nonEmpty(input)) return [{ field: "workflowId", message: "Invalid State: a workflow id is required." }];
    return [];
  };

  const validateMetadata = (input: unknown): WorkflowIssue[] => {
    if (isFlatWorkflowMetadata(input)) return [];
    return [{ field: "metadata", message: "Invalid Metadata: a flat record of strings, numbers, booleans, or null is required." }];
  };

  const validateWindowFields = (value: Record<string, unknown>, nowMs: number): WorkflowIssue[] => {
    const issues = [...validateKind(value.kind)];
    if (issues.length > 0) return issues;
    const kind = value.kind as WorkflowScheduleKind;

    if (kind === "Scheduled" && value.startAt === undefined) {
      issues.push({ field: "startAt", message: "Invalid Window: a scheduled window requires startAt." });
    }
    if (value.startAt !== undefined && value.startAt !== null && !isIso(value.startAt)) {
      issues.push({ field: "startAt", message: "Invalid Window: startAt must be an ISO timestamp." });
    }
    if (value.endAt !== undefined && value.endAt !== null && !isIso(value.endAt)) {
      issues.push({ field: "endAt", message: "Invalid Window: endAt must be an ISO timestamp or null." });
    }

    if (kind === "Delayed" || kind === "Retry") {
      if (!isDelay(value.delayMs)) {
        issues.push({ field: "delayMs", message: "Invalid Window: delayMs must be a non-negative integer." });
      }
      if (value.intervalMs !== undefined && value.intervalMs !== null) {
        issues.push({ field: "intervalMs", message: "Invalid Window: delay windows do not take intervalMs." });
      }
    } else if (kind === "Recurring") {
      if (!isInterval(value.intervalMs)) {
        issues.push({ field: "intervalMs", message: "Invalid Window: intervalMs must be a positive integer." });
      }
      if (value.delayMs !== undefined && value.delayMs !== null) {
        issues.push({ field: "delayMs", message: "Invalid Window: recurring windows do not take delayMs." });
      }
    } else {
      if (value.delayMs !== undefined && value.delayMs !== null) {
        issues.push({ field: "delayMs", message: `Invalid Window: ${kind} windows do not take delayMs.` });
      }
      if (value.intervalMs !== undefined && value.intervalMs !== null) {
        issues.push({ field: "intervalMs", message: `Invalid Window: ${kind} windows do not take intervalMs.` });
      }
    }

    if (issues.length > 0) return issues;
    const startAt = intendedStartAt(value, nowMs);
    if (startAt === null) {
      issues.push({ field: "startAt", message: "Invalid Window: startAt could not be resolved." });
      return issues;
    }
    if (value.endAt !== undefined && value.endAt !== null) {
      if (Date.parse(value.endAt as string) <= Date.parse(startAt)) {
        issues.push({ field: "endAt", message: "Invalid Window: endAt must be after startAt." });
      }
    }
    return issues;
  };

  const validateWindow = (input: unknown, nowMs = 0): WorkflowIssue[] => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return [{ field: "executionWindow", message: "Invalid Window: an execution window must be an object." }];
    }
    const value = input as Record<string, unknown>;
    const issues = validateWindowFields(
      {
        kind: value.kind,
        startAt: value.startAt,
        endAt: value.endAt,
        delayMs: value.delayMs,
        intervalMs: value.intervalMs,
      },
      nowMs,
    );
    if (value.paused !== undefined && typeof value.paused !== "boolean") {
      issues.push({ field: "paused", message: "Invalid Window: paused must be a boolean." });
    }
    return issues;
  };

  const validatePlan = (input: unknown, nowMs = 0): WorkflowIssue[] => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return [{ field: "input", message: "Invalid Window: plan input must be an object." }];
    }
    const value = input as Record<string, unknown>;
    const issues = [...validateWorkflowId(value.workflowId), ...validateState(value.currentState)];
    issues.push(...validateWindowFields(value, nowMs));
    if (value.queueId !== undefined) issues.push(...validateQueue(value.queueId));
    if (value.retryCount !== undefined && !isCount(value.retryCount)) {
      issues.push({ field: "retryCount", message: "Invalid Window: retryCount must be a non-negative integer." });
    }
    if (value.metadata !== undefined) issues.push(...validateMetadata(value.metadata));
    if (issues.length > 0) return issues;

    const current = value.currentState as WorkflowState;
    const queueId =
      value.queueId === undefined ? resolveWorkflowQueueId(current) : (value.queueId as WorkflowQueueId);
    if (queueId === null) {
      issues.push({ field: "queueId", message: "Invalid Queue: a terminal stage has no waiting room." });
      return issues;
    }
    if (!queues.accepts(queueId, current)) {
      issues.push({ field: "queueId", message: `Invalid Queue: "${queueId}" does not accept ${current}.` });
    }
    return issues;
  };

  const validateItem = (input: unknown): WorkflowIssue[] => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return [{ field: "item", message: "Invalid Window: a schedule item must be an object." }];
    }
    const item = input as Record<string, unknown>;
    const issues: WorkflowIssue[] = [];
    if (!nonEmpty(item.id)) issues.push({ field: "id", message: "Invalid Window: a schedule id is required." });
    issues.push(...validateWorkflowId(item.workflowId));
    issues.push(...validateQueue(item.queueId));
    issues.push(...validateState(item.currentState));
    issues.push(...validateWindow(item.executionWindow));
    if (!isCount(item.retryCount)) {
      issues.push({ field: "retryCount", message: "Invalid Window: retryCount must be a non-negative integer." });
    }
    if (!isIso(item.createdAt)) issues.push({ field: "createdAt", message: "Invalid Window: createdAt must be an ISO timestamp." });
    if (!isIso(item.updatedAt)) issues.push({ field: "updatedAt", message: "Invalid Window: updatedAt must be an ISO timestamp." });
    issues.push(...validateMetadata(item.metadata));
    if (issues.length === 0 && isWorkflowState(item.currentState)) {
      const queueId = item.queueId as WorkflowQueueId;
      if (!queues.accepts(queueId, item.currentState)) {
        issues.push({ field: "queueId", message: `Invalid Queue: "${queueId}" does not accept ${item.currentState}.` });
      }
    }
    return issues;
  };

  const validateDuplicate = (items: Iterable<{ workflowId: string }>, workflowId: string): WorkflowIssue[] => {
    for (const item of items) {
      if (item.workflowId === workflowId) {
        return [{ field: "workflowId", message: `Duplicate Schedule: workflow "${workflowId}" already has a window.` }];
      }
    }
    return [];
  };

  return {
    validateKind,
    validateQueue,
    validateState,
    validateWindow,
    validateItem,
    validatePlan,
    validateDuplicate,
    validateMetadata,
    validateWorkflowId,
  };
}
