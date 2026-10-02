/**
 * Workflow Engine: retry manager.
 *
 * In-memory control of transient failures. It records a failure, counts
 * attempts, and names the next retry instant. It never runs work, never
 * records a business choice, never reaches an outside system, never writes a
 * store, and never calls a model.
 *
 * The only clock is an injectable `now`; its default is wall time in
 * milliseconds and is the only time source in the retry manager. `timestamp`
 * is injectable so tests are deterministic.
 */
import type { WorkflowContext } from "./workflow-context";
import type { WorkflowMetadata } from "./workflow-types";
import type { WorkflowIssue } from "./workflow-validator";
import { freezeDeepWorkflow } from "./workflow-state-snapshot";
import {
  createWorkflowFailureRegistry,
  type WorkflowFailureRegistry,
  type WorkflowFailureType,
} from "./workflow-failure-registry";
import {
  createWorkflowFailureValidator,
  type WorkflowFailureRecordInput,
  type WorkflowFailureValidator,
} from "./workflow-failure-validator";
import {
  createWorkflowRetryPolicy,
  resolveWorkflowNextRetryAt,
  resolveWorkflowRetryDelayMs,
  type WorkflowRetryPolicy,
} from "./workflow-retry-policy";
import type { WorkflowRecoveryPolicy } from "./workflow-recovery-policy";

export const WORKFLOW_FAILURE_SNAPSHOT_KEYS = [
  "id",
  "workflowId",
  "currentState",
  "failureType",
  "retryCount",
  "lastError",
  "createdAt",
  "updatedAt",
  "metadata",
] as const;

export interface WorkflowFailureSnapshot {
  id: string;
  workflowId: string;
  currentState: WorkflowFailureRecordInput["currentState"];
  failureType: WorkflowFailureType;
  retryCount: number;
  lastError: string;
  createdAt: string;
  updatedAt: string;
  metadata: WorkflowMetadata;
}

export interface WorkflowFailureRecordRequest extends WorkflowFailureRecordInput {
  context?: WorkflowContext | null;
  event?: { id: string; type?: string } | null;
  queueItem?: { id: string } | null;
  scheduleItem?: { id: string } | null;
}

export interface WorkflowRetryManagerResult {
  status: "RECORDED" | "RETRIED" | "RECOVERED" | "REJECTED";
  item: WorkflowFailureSnapshot | null;
  issues: WorkflowIssue[];
}

export interface WorkflowRetryManager {
  readonly registry: WorkflowFailureRegistry;
  readonly validator: WorkflowFailureValidator;
  record(input: WorkflowFailureRecordRequest): WorkflowRetryManagerResult;
  retry(id: string, policy?: WorkflowRetryPolicy): WorkflowRetryManagerResult;
  recover(id: string, policy: WorkflowRecoveryPolicy): WorkflowRetryManagerResult;
  nextRetryTime(id: string): string | null;
  get(id: string): WorkflowFailureSnapshot | null;
  list(): WorkflowFailureSnapshot[];
}

export interface WorkflowRetryManagerOptions {
  registry?: WorkflowFailureRegistry;
  validator?: WorkflowFailureValidator;
  retryPolicy?: WorkflowRetryPolicy;
  now?: () => number;
  timestamp?: () => string;
  idFactory?: () => string;
}

function copyItem(item: WorkflowFailureSnapshot): WorkflowFailureSnapshot {
  return freezeDeepWorkflow({
    ...item,
    metadata: { ...item.metadata },
  });
}

function copyScalar(source: WorkflowMetadata, prefix: string, metadata: WorkflowMetadata): void {
  for (const [key, value] of Object.entries(source)) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      metadata[`${prefix}${key}`] = value;
    }
  }
}

function metadataFrom(input: WorkflowFailureRecordRequest, policy: WorkflowRetryPolicy, nextRetryAt: string | null): WorkflowMetadata {
  const metadata: WorkflowMetadata = { ...(input.metadata ?? {}) };
  const analysis = input.context?.decisionAnalysis ?? null;
  if (typeof analysis?.id === "string") metadata.decisionAnalysisId = analysis.id;
  if (typeof input.context?.decisionStatus === "string") metadata.decisionStatus = input.context.decisionStatus;
  copyScalar(input.context?.executionMetadata ?? {}, "execution.", metadata);
  copyScalar(input.context?.runtimeMetadata ?? {}, "runtime.", metadata);
  copyScalar(input.context?.configuration ?? {}, "configuration.", metadata);
  if (typeof input.event?.id === "string") metadata.eventId = input.event.id;
  if (typeof input.event?.type === "string") metadata.eventType = input.event.type;
  if (typeof input.queueItem?.id === "string") metadata.queueItemId = input.queueItem.id;
  if (typeof input.scheduleItem?.id === "string") metadata.scheduleItemId = input.scheduleItem.id;
  metadata["retry.maxAttempts"] = policy.maxAttempts;
  metadata["retry.delayMs"] = policy.delayMs;
  metadata["retry.backoff"] = policy.backoff;
  metadata.nextRetryAt = nextRetryAt;
  return metadata;
}

function policyFrom(metadata: WorkflowMetadata, fallback: WorkflowRetryPolicy): WorkflowRetryPolicy {
  const maxAttempts = metadata["retry.maxAttempts"];
  const delayMs = metadata["retry.delayMs"];
  const backoff = metadata["retry.backoff"];
  return createWorkflowRetryPolicy({
    maxAttempts: typeof maxAttempts === "number" ? maxAttempts : fallback.maxAttempts,
    delayMs: typeof delayMs === "number" ? delayMs : fallback.delayMs,
    backoff: typeof backoff === "string" ? (backoff as WorkflowRetryPolicy["backoff"]) : fallback.backoff,
  });
}

function rejected(issues: WorkflowIssue[]): WorkflowRetryManagerResult {
  return freezeDeepWorkflow({ status: "REJECTED" as const, item: null, issues });
}

export function createWorkflowRetryManager(options: WorkflowRetryManagerOptions = {}): WorkflowRetryManager {
  const now = options.now ?? (() => Date.now());
  const timestamp = options.timestamp ?? (() => new Date(now()).toISOString());
  const registry = options.registry ?? createWorkflowFailureRegistry();
  const validator = options.validator ?? createWorkflowFailureValidator({ registry });
  const defaultPolicy = options.retryPolicy ?? createWorkflowRetryPolicy();
  let sequence = 0;
  const idFactory = options.idFactory ?? (() => `failure-${(sequence += 1)}`);
  const items = new Map<string, WorkflowFailureSnapshot>();

  const missing = (id: string): WorkflowRetryManagerResult =>
    rejected([{ field: "id", message: `Invalid Metadata: failure "${id}" is not known.` }]);

  return {
    registry,
    validator,
    record(input) {
      const nowMs = now();
      const issues = [...validator.validateRecord(input)];
      issues.push(...validator.validateDuplicate(items.values(), typeof input.workflowId === "string" ? input.workflowId : ""));
      if (issues.length > 0) return rejected(issues);
      const policy = input.retryPolicy ?? defaultPolicy;
      const policyIssues = validator.validateRetryPolicy(policy);
      if (policyIssues.length > 0) return rejected(policyIssues);
      const retryCount = input.retryCount ?? 0;
      const nextRetryAt =
        input.failureType === "RetryableFailure" ? resolveWorkflowNextRetryAt(policy, retryCount, nowMs) : null;
      const at = timestamp();
      const item: WorkflowFailureSnapshot = {
        id: idFactory(),
        workflowId: input.workflowId,
        currentState: input.currentState,
        failureType: input.failureType,
        retryCount,
        lastError: input.lastError,
        createdAt: at,
        updatedAt: at,
        metadata: metadataFrom(input, policy, nextRetryAt),
      };
      const itemIssues = validator.validateSnapshot(item);
      if (itemIssues.length > 0) return rejected(itemIssues);
      items.set(item.id, item);
      return freezeDeepWorkflow({ status: "RECORDED" as const, item: copyItem(item), issues: [] });
    },
    retry(id, policy) {
      const nowMs = now();
      const item = items.get(id);
      if (item === undefined) return missing(id);
      const used = policy ?? policyFrom(item.metadata, defaultPolicy);
      const issues = validator.validateRetry(item, used);
      if (issues.length > 0) return rejected(issues);
      const retryCount = item.retryCount + 1;
      const nextRetryAt = resolveWorkflowNextRetryAt(used, retryCount, nowMs);
      const updated: WorkflowFailureSnapshot = {
        ...item,
        retryCount,
        updatedAt: timestamp(),
        metadata: {
          ...item.metadata,
          "retry.maxAttempts": used.maxAttempts,
          "retry.delayMs": used.delayMs,
          "retry.backoff": used.backoff,
          nextRetryAt,
          lastDelayMs: resolveWorkflowRetryDelayMs(used, retryCount),
        },
      };
      items.set(updated.id, updated);
      return freezeDeepWorkflow({ status: "RETRIED" as const, item: copyItem(updated), issues: [] });
    },
    recover(id, policy) {
      void now();
      const item = items.get(id);
      if (item === undefined) return missing(id);
      const issues = validator.validateRecover(item, policy);
      if (issues.length > 0) return rejected(issues);
      const updated: WorkflowFailureSnapshot = {
        ...item,
        updatedAt: timestamp(),
        metadata: {
          ...item.metadata,
          recoveryAction: policy.action,
          restartState: policy.restartState,
          nextRetryAt: null,
        },
      };
      items.set(updated.id, updated);
      return freezeDeepWorkflow({ status: "RECOVERED" as const, item: copyItem(updated), issues: [] });
    },
    nextRetryTime(id) {
      void now();
      const item = items.get(id);
      if (item === undefined) return null;
      const value = item.metadata.nextRetryAt;
      return typeof value === "string" ? value : null;
    },
    get(id) {
      const item = items.get(id);
      return item ? copyItem(item) : null;
    },
    list() {
      return [...items.values()]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map(copyItem);
    },
  };
}
