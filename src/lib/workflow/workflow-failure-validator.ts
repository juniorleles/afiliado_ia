/**
 * Workflow Engine: failure validator.
 *
 * Reports problems with failure kinds, snapshots, retry policies, recovery
 * policies, and metadata. It never throws, never changes its input, never
 * retries, and never runs work.
 */
import type { WorkflowMetadata, WorkflowState } from "./workflow-types";
import type { WorkflowIssue } from "./workflow-validator";
import { isFlatWorkflowMetadata, isWorkflowState } from "./workflow-transition-validator";
import {
  createWorkflowFailureRegistry,
  isWorkflowRetryableFailure,
  type WorkflowFailureRegistry,
  type WorkflowFailureType,
} from "./workflow-failure-registry";
import {
  isWorkflowRetryExhausted,
  validateWorkflowRetryPolicy,
  type WorkflowRetryPolicy,
} from "./workflow-retry-policy";
import {
  isWorkflowRecoveryClosed,
  validateWorkflowRecoveryPolicy,
  type WorkflowRecoveryPolicy,
} from "./workflow-recovery-policy";

export interface WorkflowFailureValidator {
  validateType(input: unknown): WorkflowIssue[];
  validateSnapshot(input: unknown): WorkflowIssue[];
  validateRecord(input: unknown): WorkflowIssue[];
  validateRetryPolicy(input: unknown): WorkflowIssue[];
  validateRecoveryPolicy(input: unknown): WorkflowIssue[];
  validateDuplicate(items: Iterable<{ workflowId: string; metadata: WorkflowMetadata }>, workflowId: string): WorkflowIssue[];
  validateMetadata(input: unknown): WorkflowIssue[];
  validateRetryCount(input: unknown): WorkflowIssue[];
  validateRetry(item: { failureType: WorkflowFailureType; retryCount: number; metadata: WorkflowMetadata }, policy: WorkflowRetryPolicy): WorkflowIssue[];
  validateRecover(item: { metadata: WorkflowMetadata }, policy: WorkflowRecoveryPolicy): WorkflowIssue[];
}

export interface WorkflowFailureRecordInput {
  workflowId: string;
  currentState: WorkflowState;
  failureType: WorkflowFailureType;
  lastError: string;
  retryCount?: number;
  metadata?: WorkflowMetadata;
  retryPolicy?: WorkflowRetryPolicy;
}

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isIso = (value: unknown): boolean =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));

export function createWorkflowFailureValidator(
  options: { registry?: WorkflowFailureRegistry } = {},
): WorkflowFailureValidator {
  const registry = options.registry ?? createWorkflowFailureRegistry();

  const validateType = (input: unknown): WorkflowIssue[] => {
    const issues = registry.validate(input);
    if (issues.length > 0) return issues;
    if (registry.get(input as WorkflowFailureType) === null) {
      return [{ field: "failureType", message: `Invalid Metadata: "${String(input)}" is not registered.` }];
    }
    return [];
  };

  const validateRetryCount = (input: unknown): WorkflowIssue[] => {
    if (typeof input !== "number" || !Number.isInteger(input)) {
      return [{ field: "retryCount", message: "Negative Retry Count: retryCount must be a non-negative integer." }];
    }
    if (input < 0) {
      return [{ field: "retryCount", message: "Negative Retry Count: retryCount must be a non-negative integer." }];
    }
    return [];
  };

  const validateMetadata = (input: unknown): WorkflowIssue[] => {
    if (isFlatWorkflowMetadata(input)) return [];
    return [{ field: "metadata", message: "Invalid Metadata: a flat record of strings, numbers, booleans, or null is required." }];
  };

  const validateWorkflowId = (input: unknown): WorkflowIssue[] => {
    if (!nonEmpty(input)) return [{ field: "workflowId", message: "Invalid Metadata: a workflow id is required." }];
    return [];
  };

  const validateState = (input: unknown): WorkflowIssue[] => {
    if (input === undefined || input === null || input === "") {
      return [{ field: "currentState", message: "Invalid Metadata: a workflow stage is required." }];
    }
    if (!isWorkflowState(input)) {
      return [{ field: "currentState", message: `Invalid Metadata: "${String(input)}" is not a workflow stage.` }];
    }
    return [];
  };

  const validateRecord = (input: unknown): WorkflowIssue[] => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return [{ field: "input", message: "Invalid Metadata: record input must be an object." }];
    }
    const value = input as Record<string, unknown>;
    const issues = [
      ...validateWorkflowId(value.workflowId),
      ...validateState(value.currentState),
      ...validateType(value.failureType),
    ];
    if (!nonEmpty(value.lastError)) {
      issues.push({ field: "lastError", message: "Invalid Metadata: lastError is required." });
    }
    if (value.retryCount !== undefined) issues.push(...validateRetryCount(value.retryCount));
    if (value.metadata !== undefined) issues.push(...validateMetadata(value.metadata));
    if (value.retryPolicy !== undefined) issues.push(...validateWorkflowRetryPolicy(value.retryPolicy));
    return issues;
  };

  const validateSnapshot = (input: unknown): WorkflowIssue[] => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return [{ field: "item", message: "Invalid Metadata: a failure snapshot must be an object." }];
    }
    const item = input as Record<string, unknown>;
    const issues: WorkflowIssue[] = [];
    if (!nonEmpty(item.id)) issues.push({ field: "id", message: "Invalid Metadata: a failure id is required." });
    issues.push(...validateWorkflowId(item.workflowId));
    issues.push(...validateState(item.currentState));
    issues.push(...validateType(item.failureType));
    issues.push(...validateRetryCount(item.retryCount));
    if (!nonEmpty(item.lastError)) issues.push({ field: "lastError", message: "Invalid Metadata: lastError is required." });
    if (!isIso(item.createdAt)) issues.push({ field: "createdAt", message: "Invalid Metadata: createdAt must be an ISO timestamp." });
    if (!isIso(item.updatedAt)) issues.push({ field: "updatedAt", message: "Invalid Metadata: updatedAt must be an ISO timestamp." });
    issues.push(...validateMetadata(item.metadata));
    return issues;
  };

  const validateDuplicate = (
    items: Iterable<{ workflowId: string; metadata: WorkflowMetadata }>,
    workflowId: string,
  ): WorkflowIssue[] => {
    for (const item of items) {
      if (item.workflowId === workflowId && !isWorkflowRecoveryClosed(typeof item.metadata.recoveryAction === "string" ? item.metadata.recoveryAction : null)) {
        return [{ field: "workflowId", message: `Duplicate Failure: workflow "${workflowId}" already has a failure.` }];
      }
    }
    return [];
  };

  const validateRetry = (
    item: { failureType: WorkflowFailureType; retryCount: number; metadata: WorkflowMetadata },
    policy: WorkflowRetryPolicy,
  ): WorkflowIssue[] => {
    const issues = [...validateWorkflowRetryPolicy(policy)];
    if (issues.length > 0) return issues;
    if (isWorkflowRecoveryClosed(typeof item.metadata.recoveryAction === "string" ? item.metadata.recoveryAction : null)) {
      return [{ field: "id", message: "Invalid Retry Policy: a closed failure cannot be retried." }];
    }
    if (!isWorkflowRetryableFailure(item.failureType)) {
      return [{ field: "failureType", message: "Invalid Retry Policy: only a retryable failure can be retried." }];
    }
    if (isWorkflowRetryExhausted(policy, item.retryCount)) {
      return [{ field: "retryCount", message: "Invalid Retry Policy: max attempts have been reached." }];
    }
    return [];
  };

  const validateRecover = (
    item: { metadata: WorkflowMetadata },
    policy: WorkflowRecoveryPolicy,
  ): WorkflowIssue[] => {
    const issues = [...validateWorkflowRecoveryPolicy(policy)];
    if (issues.length > 0) return issues;
    if (isWorkflowRecoveryClosed(typeof item.metadata.recoveryAction === "string" ? item.metadata.recoveryAction : null)) {
      return [{ field: "id", message: "Invalid Recovery Policy: a closed failure cannot be recovered again." }];
    }
    return [];
  };

  return {
    validateType,
    validateSnapshot,
    validateRecord,
    validateRetryPolicy: validateWorkflowRetryPolicy,
    validateRecoveryPolicy: validateWorkflowRecoveryPolicy,
    validateDuplicate,
    validateMetadata,
    validateRetryCount,
    validateRetry,
    validateRecover,
  };
}
