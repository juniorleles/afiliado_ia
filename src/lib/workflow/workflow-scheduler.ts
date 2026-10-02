/**
 * Workflow Engine: scheduler.
 *
 * In-memory planner of execution windows. It decides when a workflow item
 * becomes eligible to wait. It never runs work, never records a business
 * choice, never reaches an outside system, never writes a store, and never
 * calls a model.
 *
 * The only clock is an injectable `now`; its default is wall time in
 * milliseconds and is the only time source in the scheduler. `timestamp` is
 * injectable so tests are deterministic.
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
import { resolveWorkflowQueueId } from "./workflow-queue-resolver";
import {
  createWorkflowScheduleRegistry,
  type WorkflowExecutionWindow,
  type WorkflowScheduleKind,
  type WorkflowScheduleRegistry,
} from "./workflow-schedule-registry";
import {
  isWorkflowScheduleEligible,
  orderWorkflowScheduleItems,
  resolveWorkflowEligibleNow,
  resolveWorkflowNextRun,
} from "./workflow-schedule-resolver";
import { computeWorkflowScheduleStatistics, type WorkflowScheduleStatistics } from "./workflow-schedule-statistics";
import {
  createWorkflowScheduleValidator,
  type WorkflowSchedulePlanInput,
  type WorkflowScheduleValidator,
} from "./workflow-schedule-validator";

export const WORKFLOW_SCHEDULE_ITEM_KEYS = [
  "id",
  "workflowId",
  "queueId",
  "currentState",
  "executionWindow",
  "retryCount",
  "createdAt",
  "updatedAt",
  "metadata",
] as const;

export interface WorkflowScheduleItem {
  id: string;
  workflowId: string;
  queueId: WorkflowQueueId;
  currentState: WorkflowState;
  executionWindow: WorkflowExecutionWindow;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  metadata: WorkflowMetadata;
}

export interface WorkflowSchedulePlanRequest extends WorkflowSchedulePlanInput {
  context?: WorkflowContext | null;
  event?: { id: string; type?: string } | null;
  queueItem?: { id: string; queueId?: WorkflowQueueId } | null;
}

export interface WorkflowScheduleChangeInput {
  kind?: WorkflowScheduleKind;
  startAt?: string;
  endAt?: string | null;
  delayMs?: number | null;
  intervalMs?: number | null;
  retryCount?: number;
  currentState?: WorkflowState;
  queueId?: WorkflowQueueId;
}

export interface WorkflowLookup {
  get(id: string): { id: string } | null;
}

export interface WorkflowSchedulerResult {
  status: "PLANNED" | "CANCELLED" | "RESCHEDULED" | "PAUSED" | "RESUMED" | "REJECTED";
  item: WorkflowScheduleItem | null;
  issues: WorkflowIssue[];
}

export interface WorkflowScheduler {
  readonly registry: WorkflowScheduleRegistry;
  readonly validator: WorkflowScheduleValidator;
  plan(input: WorkflowSchedulePlanRequest): WorkflowSchedulerResult;
  cancel(id: string): WorkflowSchedulerResult;
  reschedule(id: string, input: WorkflowScheduleChangeInput): WorkflowSchedulerResult;
  pause(id: string): WorkflowSchedulerResult;
  resume(id: string): WorkflowSchedulerResult;
  nextRun(id?: string): string | null;
  eligibleNow(kind?: WorkflowScheduleKind): WorkflowScheduleItem[];
  get(id: string): WorkflowScheduleItem | null;
  list(): WorkflowScheduleItem[];
  statistics(): WorkflowScheduleStatistics;
}

export interface WorkflowSchedulerOptions {
  registry?: WorkflowScheduleRegistry;
  validator?: WorkflowScheduleValidator;
  queues?: WorkflowQueueRegistry;
  lookup?: WorkflowLookup;
  now?: () => number;
  timestamp?: () => string;
  idFactory?: () => string;
}

function copyItem(item: WorkflowScheduleItem): WorkflowScheduleItem {
  return freezeDeepWorkflow({
    ...item,
    executionWindow: { ...item.executionWindow },
    metadata: { ...item.metadata },
  });
}

function copyScalar(
  source: WorkflowMetadata,
  prefix: string,
  metadata: WorkflowMetadata,
): void {
  for (const [key, value] of Object.entries(source)) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      metadata[`${prefix}${key}`] = value;
    }
  }
}

function metadataFrom(input: WorkflowSchedulePlanRequest): WorkflowMetadata {
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
  return metadata;
}

function windowFrom(
  input: {
    kind: WorkflowScheduleKind;
    startAt?: string;
    endAt?: string | null;
    delayMs?: number | null;
    intervalMs?: number | null;
    paused?: boolean;
  },
  nowMs: number,
  at: string,
): WorkflowExecutionWindow {
  const kind = input.kind;
  const delayMs = kind === "Delayed" || kind === "Retry" ? (input.delayMs ?? 0) : null;
  const intervalMs = kind === "Recurring" ? (input.intervalMs ?? null) : null;
  const startAt =
    input.startAt ??
    (delayMs === null ? at : new Date(nowMs + delayMs).toISOString());
  return {
    kind,
    startAt,
    endAt: input.endAt ?? null,
    delayMs,
    intervalMs,
    paused: input.paused === true,
  };
}

function rejected(issues: WorkflowIssue[]): WorkflowSchedulerResult {
  return freezeDeepWorkflow({ status: "REJECTED" as const, item: null, issues });
}

export function createWorkflowScheduler(options: WorkflowSchedulerOptions = {}): WorkflowScheduler {
  const now = options.now ?? (() => Date.now());
  const timestamp = options.timestamp ?? (() => new Date(now()).toISOString());
  const queues = options.queues ?? createWorkflowQueueRegistry();
  const registry = options.registry ?? createWorkflowScheduleRegistry();
  const validator = options.validator ?? createWorkflowScheduleValidator({ registry, queues });
  const lookup = options.lookup;
  let sequence = 0;
  const idFactory = options.idFactory ?? (() => `schedule-${(sequence += 1)}`);
  const items = new Map<string, WorkflowScheduleItem>();

  const missing = (id: string): WorkflowSchedulerResult =>
    rejected([{ field: "id", message: `Unknown Schedule: schedule "${id}" is not known.` }]);

  return {
    registry,
    validator,
    plan(input) {
      const nowMs = now();
      const issues = [...validator.validatePlan(input, nowMs)];
      if (lookup && typeof input.workflowId === "string" && lookup.get(input.workflowId) === null) {
        issues.push({ field: "workflowId", message: `Invalid State: workflow "${input.workflowId}" is not known.` });
      }
      issues.push(...validator.validateDuplicate(items.values(), input.workflowId));
      if (issues.length > 0) return rejected(issues);
      const currentState = input.currentState;
      const queueId = input.queueId ?? input.queueItem?.queueId ?? resolveWorkflowQueueId(currentState);
      if (queueId === null) {
        return rejected([{ field: "queueId", message: "Invalid Queue: a terminal stage has no waiting room." }]);
      }
      const at = timestamp();
      const item: WorkflowScheduleItem = {
        id: idFactory(),
        workflowId: input.workflowId,
        queueId,
        currentState,
        executionWindow: windowFrom(input, nowMs, at),
        retryCount: input.retryCount ?? 0,
        createdAt: at,
        updatedAt: at,
        metadata: metadataFrom(input),
      };
      const itemIssues = validator.validateItem(item);
      if (itemIssues.length > 0) return rejected(itemIssues);
      items.set(item.id, item);
      return freezeDeepWorkflow({ status: "PLANNED" as const, item: copyItem(item), issues: [] });
    },
    cancel(id) {
      void now();
      const item = items.get(id);
      if (item === undefined) return missing(id);
      items.delete(id);
      return freezeDeepWorkflow({ status: "CANCELLED" as const, item: copyItem(item), issues: [] });
    },
    reschedule(id, input) {
      const nowMs = now();
      const item = items.get(id);
      if (item === undefined) return missing(id);
      const nextKind = input.kind ?? item.executionWindow.kind;
      const nextState = input.currentState ?? item.currentState;
      const nextQueue = input.queueId ?? item.queueId;
      const delayMs =
        input.delayMs !== undefined ? input.delayMs : nextKind === "Delayed" || nextKind === "Retry" ? item.executionWindow.delayMs : null;
      const intervalMs =
        input.intervalMs !== undefined ? input.intervalMs : nextKind === "Recurring" ? item.executionWindow.intervalMs : null;
      const startAt = input.startAt ?? (input.delayMs !== undefined && input.delayMs !== null ? undefined : item.executionWindow.startAt);
      const patch = {
        workflowId: item.workflowId,
        queueId: nextQueue,
        currentState: nextState,
        kind: nextKind,
        startAt,
        endAt: input.endAt !== undefined ? input.endAt : item.executionWindow.endAt,
        delayMs: delayMs ?? undefined,
        intervalMs: intervalMs ?? undefined,
        retryCount: input.retryCount ?? item.retryCount,
        metadata: item.metadata,
      };
      const issues = validator.validatePlan(patch, nowMs);
      if (issues.length > 0) return rejected(issues);
      const at = timestamp();
      const updated: WorkflowScheduleItem = {
        ...item,
        queueId: nextQueue,
        currentState: nextState,
        executionWindow: windowFrom(
          {
            kind: nextKind,
            startAt,
            endAt: patch.endAt,
            delayMs: delayMs,
            intervalMs: intervalMs,
            paused: item.executionWindow.paused,
          },
          nowMs,
          at,
        ),
        retryCount: patch.retryCount ?? item.retryCount,
        updatedAt: at,
      };
      const itemIssues = validator.validateItem(updated);
      if (itemIssues.length > 0) return rejected(itemIssues);
      items.set(updated.id, updated);
      return freezeDeepWorkflow({ status: "RESCHEDULED" as const, item: copyItem(updated), issues: [] });
    },
    pause(id) {
      void now();
      const item = items.get(id);
      if (item === undefined) return missing(id);
      const updated: WorkflowScheduleItem = {
        ...item,
        executionWindow: { ...item.executionWindow, paused: true },
        updatedAt: timestamp(),
      };
      items.set(updated.id, updated);
      return freezeDeepWorkflow({ status: "PAUSED" as const, item: copyItem(updated), issues: [] });
    },
    resume(id) {
      void now();
      const item = items.get(id);
      if (item === undefined) return missing(id);
      const updated: WorkflowScheduleItem = {
        ...item,
        executionWindow: { ...item.executionWindow, paused: false },
        updatedAt: timestamp(),
      };
      items.set(updated.id, updated);
      return freezeDeepWorkflow({ status: "RESUMED" as const, item: copyItem(updated), issues: [] });
    },
    nextRun(id) {
      const nowMs = now();
      if (id !== undefined) {
        const item = items.get(id);
        return item ? resolveWorkflowNextRun(item.executionWindow, nowMs) : null;
      }
      let nextAt: number | null = null;
      let nextRun: string | null = null;
      for (const item of items.values()) {
        const run = resolveWorkflowNextRun(item.executionWindow, nowMs);
        if (run === null) continue;
        const time = Date.parse(run);
        if (nextAt === null || time < nextAt) {
          nextAt = time;
          nextRun = run;
        }
      }
      return nextRun;
    },
    eligibleNow(kind) {
      const nowMs = now();
      return resolveWorkflowEligibleNow([...items.values()], nowMs, kind).map(copyItem);
    },
    get(id) {
      const item = items.get(id);
      return item ? copyItem(item) : null;
    },
    list() {
      return orderWorkflowScheduleItems([...items.values()]).map(copyItem);
    },
    statistics() {
      return freezeDeepWorkflow(computeWorkflowScheduleStatistics([...items.values()], now()));
    },
  };
}
