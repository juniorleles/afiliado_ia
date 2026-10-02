/**
 * Workflow Engine: queue.
 *
 * In-memory waiting rooms for workflow items. It organizes progression and
 * never applies a lifecycle move, never records a business choice, never
 * reaches an outside system, never writes a store, and never calls a model.
 * Retry puts a dequeued item back; it does not run a worker.
 *
 * The only clock is an injectable `now`; its default measures elapsed time
 * and is the only time source in the queue. `timestamp` is injectable so
 * tests are deterministic.
 */
import type { WorkflowContext } from "./workflow-context";
import type { WorkflowMetadata, WorkflowState } from "./workflow-types";
import type { WorkflowIssue } from "./workflow-validator";
import { freezeDeepWorkflow } from "./workflow-state-snapshot";
import {
  createWorkflowQueueRegistry,
  type WorkflowQueueId,
  type WorkflowQueueRegistry,
} from "./workflow-queue-registry";
import {
  orderWorkflowQueueItems,
  resolveNextWorkflowQueueItem,
  resolveWorkflowQueueId,
  resolveWorkflowQueueTarget,
} from "./workflow-queue-resolver";
import { computeWorkflowQueueStatistics, type WorkflowQueueStatistics } from "./workflow-queue-statistics";
import {
  createWorkflowQueueValidator,
  WORKFLOW_QUEUE_PRIORITY_DEFAULT,
  type WorkflowQueueEnqueueInput,
  type WorkflowQueueValidator,
} from "./workflow-queue-validator";

export const WORKFLOW_QUEUE_ITEM_KEYS = [
  "id",
  "queueId",
  "workflowId",
  "candidateId",
  "currentState",
  "targetState",
  "priority",
  "createdAt",
  "updatedAt",
  "metadata",
] as const;

export interface WorkflowQueueItem {
  id: string;
  queueId: WorkflowQueueId;
  workflowId: string;
  candidateId: string;
  currentState: WorkflowState;
  targetState: WorkflowState;
  /** Carried data. This queue assigns it no scale. */
  priority: number;
  createdAt: string;
  updatedAt: string;
  metadata: WorkflowMetadata;
}

export interface WorkflowQueueEnqueueRequest extends WorkflowQueueEnqueueInput {
  context?: WorkflowContext | null;
  decisionAnalysis?: { id: string } | null;
}

export interface WorkflowLookup {
  get(id: string): { id: string } | null;
}

export interface WorkflowQueueResult {
  status: "ENQUEUED" | "DEQUEUED" | "MOVED" | "REMOVED" | "RETRIED" | "EMPTY" | "REJECTED";
  item: WorkflowQueueItem | null;
  issues: WorkflowIssue[];
}

export interface WorkflowQueue {
  readonly registry: WorkflowQueueRegistry;
  readonly validator: WorkflowQueueValidator;
  enqueue(input: WorkflowQueueEnqueueRequest): WorkflowQueueResult;
  dequeue(queueId?: WorkflowQueueId): WorkflowQueueResult;
  peek(queueId?: WorkflowQueueId): WorkflowQueueItem | null;
  move(id: string, queueId: WorkflowQueueId): WorkflowQueueResult;
  remove(id: string): WorkflowQueueResult;
  retry(id: string): WorkflowQueueResult;
  get(id: string): WorkflowQueueItem | null;
  list(queueId?: WorkflowQueueId): WorkflowQueueItem[];
  statistics(): WorkflowQueueStatistics;
}

export interface WorkflowQueueOptions {
  registry?: WorkflowQueueRegistry;
  validator?: WorkflowQueueValidator;
  lookup?: WorkflowLookup;
  now?: () => number;
  timestamp?: () => string;
  idFactory?: () => string;
}

function copyItem(item: WorkflowQueueItem): WorkflowQueueItem {
  return freezeDeepWorkflow({
    ...item,
    metadata: { ...item.metadata },
  });
}

function metadataFrom(input: WorkflowQueueEnqueueRequest): WorkflowMetadata {
  const metadata: WorkflowMetadata = { ...(input.metadata ?? {}) };
  const analysis = input.decisionAnalysis ?? input.context?.decisionAnalysis ?? null;
  if (typeof analysis?.id === "string") metadata.decisionAnalysisId = analysis.id;
  if (typeof input.context?.decisionStatus === "string") metadata.decisionStatus = input.context.decisionStatus;
  for (const [key, value] of Object.entries(input.context?.executionMetadata ?? {})) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      metadata[`execution.${key}`] = value;
    }
  }
  for (const [key, value] of Object.entries(input.context?.runtimeMetadata ?? {})) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      metadata[`runtime.${key}`] = value;
    }
  }
  return metadata;
}

function rejected(issues: WorkflowIssue[]): WorkflowQueueResult {
  return freezeDeepWorkflow({ status: "REJECTED" as const, item: null, issues });
}

export function createWorkflowQueue(options: WorkflowQueueOptions = {}): WorkflowQueue {
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  const registry = options.registry ?? createWorkflowQueueRegistry();
  const validator = options.validator ?? createWorkflowQueueValidator({ registry });
  const lookup = options.lookup;
  let sequence = 0;
  const idFactory = options.idFactory ?? (() => `queue-item-${(sequence += 1)}`);
  const waiting = new Map<string, WorkflowQueueItem>();
  const held = new Map<string, WorkflowQueueItem>();

  const find = (id: string): { item: WorkflowQueueItem; held: boolean } | null => {
    const live = waiting.get(id);
    if (live) return { item: live, held: false };
    const parked = held.get(id);
    if (parked) return { item: parked, held: true };
    return null;
  };

  return {
    registry,
    validator,
    enqueue(input) {
      void now();
      const issues = [...validator.validateEnqueue(input)];
      if (lookup && typeof input.workflowId === "string" && lookup.get(input.workflowId) === null) {
        issues.push({ field: "workflowId", message: `Unknown Workflow: workflow "${input.workflowId}" is not known.` });
      }
      issues.push(...validator.validateDuplicate(waiting.values(), input.workflowId));
      if (issues.length > 0) return rejected(issues);
      const currentState = input.currentState;
      const targetState = input.targetState ?? resolveWorkflowQueueTarget(currentState);
      const queueId = input.queueId ?? resolveWorkflowQueueId(currentState);
      if (targetState === null || queueId === null) {
        return rejected([{ field: "currentState", message: "Invalid Transition: a terminal stage does not wait in a queue." }]);
      }
      const at = timestamp();
      const item: WorkflowQueueItem = {
        id: idFactory(),
        queueId,
        workflowId: input.workflowId,
        candidateId: input.candidateId,
        currentState,
        targetState,
        priority: input.priority ?? WORKFLOW_QUEUE_PRIORITY_DEFAULT,
        createdAt: at,
        updatedAt: at,
        metadata: metadataFrom(input),
      };
      const itemIssues = validator.validateItem(item);
      if (itemIssues.length > 0) return rejected(itemIssues);
      waiting.set(item.id, item);
      return freezeDeepWorkflow({ status: "ENQUEUED" as const, item: copyItem(item), issues: [] });
    },
    dequeue(queueId) {
      if (queueId !== undefined) {
        const queueIssues = validator.validateQueue(queueId);
        if (queueIssues.length > 0) return rejected(queueIssues);
      }
      const next = resolveNextWorkflowQueueItem([...waiting.values()], queueId);
      if (next === null) return freezeDeepWorkflow({ status: "EMPTY" as const, item: null, issues: [] });
      waiting.delete(next.id);
      const updated = { ...next, updatedAt: timestamp() };
      held.set(updated.id, updated);
      return freezeDeepWorkflow({ status: "DEQUEUED" as const, item: copyItem(updated), issues: [] });
    },
    peek(queueId) {
      if (queueId !== undefined && validator.validateQueue(queueId).length > 0) return null;
      const next = resolveNextWorkflowQueueItem([...waiting.values()], queueId);
      return next ? copyItem(next) : null;
    },
    move(id, queueId) {
      const found = find(id);
      if (found === null) return rejected([{ field: "id", message: `Unknown Workflow: queue item "${id}" is not known.` }]);
      if (found.held) return rejected([{ field: "id", message: "Invalid Queue: a dequeued item must be retried before it is moved." }]);
      const issues = validator.validateMove(found.item, queueId);
      if (issues.length > 0) return rejected(issues);
      const updated: WorkflowQueueItem = { ...found.item, queueId, updatedAt: timestamp() };
      waiting.set(updated.id, updated);
      return freezeDeepWorkflow({ status: "MOVED" as const, item: copyItem(updated), issues: [] });
    },
    remove(id) {
      const found = find(id);
      if (found === null) return rejected([{ field: "id", message: `Unknown Workflow: queue item "${id}" is not known.` }]);
      waiting.delete(id);
      held.delete(id);
      return freezeDeepWorkflow({ status: "REMOVED" as const, item: copyItem(found.item), issues: [] });
    },
    retry(id) {
      const parked = held.get(id);
      if (parked === undefined) {
        if (waiting.has(id)) return rejected([{ field: "id", message: "Invalid Queue: a waiting item cannot be retried." }]);
        return rejected([{ field: "id", message: `Unknown Workflow: queue item "${id}" is not known.` }]);
      }
      const issues = validator.validateDuplicate(waiting.values(), parked.workflowId);
      if (issues.length > 0) return rejected(issues);
      const updated: WorkflowQueueItem = { ...parked, updatedAt: timestamp() };
      held.delete(id);
      waiting.set(updated.id, updated);
      return freezeDeepWorkflow({ status: "RETRIED" as const, item: copyItem(updated), issues: [] });
    },
    get(id) {
      const found = find(id);
      return found ? copyItem(found.item) : null;
    },
    list(queueId) {
      const items = [...waiting.values()].filter((item) => queueId === undefined || item.queueId === queueId);
      return orderWorkflowQueueItems(items).map(copyItem);
    },
    statistics() {
      return freezeDeepWorkflow(computeWorkflowQueueStatistics([...waiting.values()], held.size));
    },
  };
}
