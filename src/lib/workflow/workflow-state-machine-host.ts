/**
 * Workflow Engine: state machine.
 *
 * The one entry point for a lifecycle move. It reads a frozen context, checks
 * the requested move, and returns a frozen snapshot. It does not analyze a
 * product, record a business choice, reach an outside system, write a store,
 * or call a model. It never throws: a refused move is described, not applied.
 *
 * The only clock is an injectable `now`; its default measures elapsed time
 * and is the only time source in the machine. `timestamp` is injectable so
 * tests are deterministic.
 */
import type { WorkflowContext } from "./workflow-context";
import type { WorkflowStateMachine } from "./workflow-state-machine";
import type { WorkflowMetadata, WorkflowState, WorkflowTransition } from "./workflow-types";
import type { WorkflowIssue } from "./workflow-validator";
import { createWorkflowStateSnapshot, freezeDeepWorkflow, type WorkflowStateSnapshot } from "./workflow-state-snapshot";
import { createWorkflowTransitionRegistry, type WorkflowTransitionRegistry } from "./workflow-transition-registry";
import { resolveWorkflowNextState, type WorkflowNextState } from "./workflow-transition-resolver";
import { createWorkflowTransitionValidator, isFlatWorkflowMetadata, type WorkflowTransitionValidator } from "./workflow-transition-validator";

export interface WorkflowStateMachineOptions {
  registry?: WorkflowTransitionRegistry;
  validator?: WorkflowTransitionValidator;
  now?: () => number;
  timestamp?: () => string;
}

export interface WorkflowApplyInput {
  from: WorkflowState;
  to: WorkflowState;
  context?: WorkflowContext | null;
  metadata?: WorkflowMetadata;
}

export interface WorkflowApplyResult {
  status: "APPLIED" | "REJECTED";
  snapshot: WorkflowStateSnapshot | null;
  issues: WorkflowIssue[];
}

export interface WorkflowLifecycleMachine extends WorkflowStateMachine {
  readonly registry: WorkflowTransitionRegistry;
  readonly validator: WorkflowTransitionValidator;
  validate(from: unknown, to: unknown): WorkflowIssue[];
  validateRollback(from: unknown, to: unknown): WorkflowIssue[];
  resolveNext(from: unknown): WorkflowNextState;
  apply(input: WorkflowApplyInput): WorkflowApplyResult;
  snapshotOf(state: WorkflowState, context?: WorkflowContext | null): WorkflowStateSnapshot;
}

function metadataFrom(context: WorkflowContext | null | undefined, extra: WorkflowMetadata | undefined): WorkflowMetadata {
  const metadata: WorkflowMetadata = { ...(extra ?? {}) };
  if (context === undefined || context === null) return metadata;
  if (typeof context.decisionAnalysis?.id === "string") metadata.decisionAnalysisId = context.decisionAnalysis.id;
  if (typeof context.decisionStatus === "string") metadata.decisionStatus = context.decisionStatus;
  for (const [key, value] of Object.entries(context.decisionMetadata ?? {})) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      metadata[`decision.${key}`] = value;
    }
  }
  for (const [key, value] of Object.entries(context.executionMetadata ?? {})) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      metadata[`execution.${key}`] = value;
    }
  }
  for (const [key, value] of Object.entries(context.runtimeMetadata ?? {})) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      metadata[`runtime.${key}`] = value;
    }
  }
  return metadata;
}

export function createWorkflowStateMachine(options: WorkflowStateMachineOptions = {}): WorkflowLifecycleMachine {
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  const validator = options.validator ?? createWorkflowTransitionValidator();
  const registry = options.registry ?? createWorkflowTransitionRegistry({ validator });

  const validate = (from: unknown, to: unknown): WorkflowIssue[] => {
    const issues = [...validator.validateState(from), ...validator.validateState(to)];
    if (issues.length > 0) return issues;
    const start = from as WorkflowState;
    const end = to as WorkflowState;
    issues.push(...validator.validateRollback(start, end));
    if (issues.length > 0) return issues;
    if (registry.getTransition(start, end) === null) {
      issues.push({ field: "transition", message: `Unknown Transition: "${start}" to "${end}" is not a registered move.` });
    }
    issues.push(...validator.validateTransition({ from: start, to: end }));
    return issues;
  };

  return {
    registry,
    validator,
    allowedTransitions: (from) => registry.allowed(from),
    canTransition: (from, to) => registry.getTransition(from, to) !== null,
    validate,
    validateRollback: (from, to) => validator.validateRollback(from, to),
    resolveNext: (from) => resolveWorkflowNextState(from, registry),
    snapshotOf(state, context) {
      return createWorkflowStateSnapshot({
        currentState: state,
        previousState: null,
        transition: null,
        timestamp: timestamp(),
        metadata: metadataFrom(context, undefined),
      });
    },
    apply(input) {
      void now();
      const issues = validate(input.from, input.to);
      const metadata = metadataFrom(input.context, input.metadata);
      if (!isFlatWorkflowMetadata(metadata)) {
        issues.push({ field: "metadata", message: "Invalid metadata: a flat record of strings, numbers, booleans, or null is required." });
      } else {
        issues.push(...validator.validateMetadata(metadata));
      }
      if (issues.length > 0) return freezeDeepWorkflow({ status: "REJECTED" as const, snapshot: null, issues });
      const transition: WorkflowTransition = { from: input.from, to: input.to };
      const snapshot = createWorkflowStateSnapshot({
        currentState: input.to,
        previousState: input.from,
        transition,
        timestamp: timestamp(),
        metadata,
      });
      return freezeDeepWorkflow({ status: "APPLIED" as const, snapshot, issues: [] });
    },
  };
}
