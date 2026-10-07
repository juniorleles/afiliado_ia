/**
 * Workflow Engine: event dispatcher.
 *
 * The one entry point for publishing a notice. It validates, records, and
 * notifies listeners. It never applies a move, never runs work, and never
 * records a business choice. It never throws: a refused publish is described.
 *
 * The only clock is an injectable `now`; its default measures elapsed time
 * and is the only time source in the dispatcher. `timestamp` is injectable so
 * tests are deterministic.
 */
import type { WorkflowMetadata, WorkflowState, WorkflowTransition } from "./workflow-types";
import type { WorkflowIssue } from "./workflow-validator";
import { freezeDeepWorkflow } from "./workflow-state-snapshot";
import { createWorkflowEvent, type WorkflowEvent, type WorkflowEventType } from "./workflow-event";
import { createWorkflowEventBus, type WorkflowEventBus } from "./workflow-event-bus";
import { createWorkflowEventRecorder, type WorkflowEventFilter, type WorkflowEventRecorder } from "./workflow-event-recorder";
import { createWorkflowEventRegistry, type WorkflowEventRegistry } from "./workflow-event-registry";
import { createWorkflowEventValidator, type WorkflowEventValidator } from "./workflow-event-validator";

export interface WorkflowEventPublishInput {
  type: WorkflowEventType;
  workflowId: string;
  candidateId: string;
  previousState?: WorkflowState | null;
  currentState: WorkflowState;
  transition?: WorkflowTransition | null;
  metadata?: WorkflowMetadata;
  executionMetadata?: WorkflowMetadata;
  runtimeMetadata?: WorkflowMetadata;
  decisionAnalysis?: { id: string } | null;
  id?: string;
  timestamp?: string;
}

export interface WorkflowEventPublishResult {
  status: "PUBLISHED" | "REJECTED";
  event: WorkflowEvent | null;
  notified: number;
  issues: WorkflowIssue[];
}

export interface WorkflowEventDispatcher {
  readonly registry: WorkflowEventRegistry;
  readonly validator: WorkflowEventValidator;
  readonly recorder: WorkflowEventRecorder;
  readonly bus: WorkflowEventBus;
  publish(input: WorkflowEventPublishInput): WorkflowEventPublishResult;
  subscribe: WorkflowEventBus["subscribe"];
  replay(filter?: WorkflowEventFilter): WorkflowEvent[];
}

export interface WorkflowEventDispatcherOptions {
  registry?: WorkflowEventRegistry;
  validator?: WorkflowEventValidator;
  recorder?: WorkflowEventRecorder;
  bus?: WorkflowEventBus;
  now?: () => number;
  timestamp?: () => string;
  idFactory?: () => string;
}

function metadataFrom(input: WorkflowEventPublishInput): WorkflowMetadata {
  const metadata: WorkflowMetadata = { ...(input.metadata ?? {}) };
  if (typeof input.decisionAnalysis?.id === "string") metadata.decisionAnalysisId = input.decisionAnalysis.id;
  for (const [key, value] of Object.entries(input.executionMetadata ?? {})) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      metadata[`execution.${key}`] = value;
    }
  }
  for (const [key, value] of Object.entries(input.runtimeMetadata ?? {})) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      metadata[`runtime.${key}`] = value;
    }
  }
  return metadata;
}

export function createWorkflowEventDispatcher(options: WorkflowEventDispatcherOptions = {}): WorkflowEventDispatcher {
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  const registry = options.registry ?? createWorkflowEventRegistry();
  const validator = options.validator ?? createWorkflowEventValidator({ registry });
  const recorder = options.recorder ?? createWorkflowEventRecorder({ validator });
  const bus = options.bus ?? createWorkflowEventBus();
  let sequence = 0;
  const idFactory = options.idFactory ?? (() => `event-${(sequence += 1)}`);

  return {
    registry,
    validator,
    recorder,
    bus,
    subscribe: (type, handler) => bus.subscribe(type, handler),
    replay: (filter) => recorder.replay(filter),
    publish(input) {
      void now();
      const event = createWorkflowEvent({
        id: input.id ?? idFactory(),
        type: input.type,
        workflowId: input.workflowId,
        candidateId: input.candidateId,
        previousState: input.previousState,
        currentState: input.currentState,
        timestamp: input.timestamp ?? timestamp(),
        metadata: metadataFrom(input),
        transition: input.transition,
      });
      const recorded = recorder.record(event);
      if (recorded.status === "REJECTED") {
        return freezeDeepWorkflow({ status: "REJECTED" as const, event: null, notified: 0, issues: recorded.issues });
      }
      const notified = bus.dispatch(recorded.event!);
      return freezeDeepWorkflow({ status: "PUBLISHED" as const, event: recorded.event, notified, issues: [] });
    },
  };
}
