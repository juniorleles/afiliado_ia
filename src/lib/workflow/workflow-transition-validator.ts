/**
 * Workflow Engine: transition validator.
 *
 * Reports problems with stages, moves, graphs, rollbacks, and metadata.
 * It never throws, never changes its input, and never chooses a next stage.
 */
import { WORKFLOW_STATES, WORKFLOW_STATE_TRANSITIONS, type WorkflowState, type WorkflowTransition } from "./workflow-types";
import type { WorkflowIssue } from "./workflow-validator";
import type { WorkflowStateSnapshot } from "./workflow-state-snapshot";

export interface WorkflowTransitionValidator {
  validateState(input: unknown): WorkflowIssue[];
  validateTransition(input: unknown): WorkflowIssue[];
  validateGraph(transitions: readonly WorkflowTransition[]): WorkflowIssue[];
  validateRollback(from: unknown, to: unknown): WorkflowIssue[];
  validateMetadata(input: unknown): WorkflowIssue[];
  validateSnapshot(input: unknown): WorkflowIssue[];
}

const STATES = WORKFLOW_STATES as readonly string[];

export function isWorkflowState(value: unknown): value is WorkflowState {
  return typeof value === "string" && STATES.includes(value);
}

export function isFlatWorkflowMetadata(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(
    ([key, item]) => key.trim() !== "" && (item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean"),
  );
}

export function isWorkflowTerminalState(state: WorkflowState): boolean {
  return WORKFLOW_STATE_TRANSITIONS[state].length === 0;
}

function forwardIndex(state: WorkflowState): number {
  return WORKFLOW_STATES.indexOf(state);
}

function transitionKey(from: string, to: string): string {
  return `${from}->${to}`;
}

function hasCycle(transitions: readonly WorkflowTransition[]): boolean {
  const edges = new Map<string, string[]>();
  for (const item of transitions) {
    edges.set(item.from, [...(edges.get(item.from) ?? []), item.to]);
  }
  const visiting = new Set<string>();
  const seen = new Set<string>();
  const walk = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (seen.has(node)) return false;
    visiting.add(node);
    for (const next of edges.get(node) ?? []) if (walk(next)) return true;
    visiting.delete(node);
    seen.add(node);
    return false;
  };
  return [...edges.keys()].some(walk);
}

export function createWorkflowTransitionValidator(): WorkflowTransitionValidator {
  const validateState = (input: unknown): WorkflowIssue[] => {
    if (input === undefined || input === null || input === "") {
      return [{ field: "state", message: "Unknown State: a workflow stage is required." }];
    }
    if (!isWorkflowState(input)) return [{ field: "state", message: `Unknown State: "${String(input)}" is not a workflow stage.` }];
    return [];
  };

  const validateTransition = (input: unknown): WorkflowIssue[] => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return [{ field: "transition", message: "Invalid Transition: a from-to pair is required." }];
    }
    const record = input as { from?: unknown; to?: unknown };
    const issues = [...validateState(record.from), ...validateState(record.to)];
    if (issues.length > 0) return issues.map((issue) => ({ field: "transition", message: issue.message }));
    const from = record.from as WorkflowState;
    const to = record.to as WorkflowState;
    if (from === to) return [{ field: "transition", message: "Invalid Transition: a stage cannot move to itself." }];
    if (!WORKFLOW_STATE_TRANSITIONS[from].includes(to)) {
      return [{ field: "transition", message: `Unknown Transition: "${from}" to "${to}" is not a registered move.` }];
    }
    return [];
  };

  const validateGraph = (transitions: readonly WorkflowTransition[]): WorkflowIssue[] => {
    const issues: WorkflowIssue[] = [];
    const seen = new Set<string>();
    for (const item of transitions) {
      issues.push(...validateTransition(item));
      const id = transitionKey(item.from, item.to);
      if (seen.has(id)) issues.push({ field: "transitions", message: `Duplicate Transition: "${id}" is already registered.` });
      seen.add(id);
    }
    if (hasCycle(transitions)) issues.push({ field: "transitions", message: "Circular Transition: a cycle is not allowed." });
    return issues;
  };

  const validateRollback = (from: unknown, to: unknown): WorkflowIssue[] => {
    const issues = [...validateState(from), ...validateState(to)];
    if (issues.length > 0) return issues;
    const start = from as WorkflowState;
    const end = to as WorkflowState;
    if (isWorkflowTerminalState(start) && start !== end) {
      return [{ field: "transition", message: "Rollback Validation: a terminal stage cannot move." }];
    }
    if (start === "FAILED" && end !== "FAILED") {
      return [{ field: "transition", message: "Rollback Validation: a workflow does not move backward." }];
    }
    if (end !== "FAILED" && start !== "FAILED" && forwardIndex(end) < forwardIndex(start)) {
      return [{ field: "transition", message: "Rollback Validation: a workflow does not move backward." }];
    }
    return [];
  };

  const validateMetadata = (input: unknown): WorkflowIssue[] => {
    if (isFlatWorkflowMetadata(input)) return [];
    return [{ field: "metadata", message: "Invalid metadata: a flat record of strings, numbers, booleans, or null is required." }];
  };

  const validateSnapshot = (input: unknown): WorkflowIssue[] => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return [{ field: "snapshot", message: "Missing snapshot: a state snapshot is required." }];
    }
    const record = input as WorkflowStateSnapshot;
    const issues: WorkflowIssue[] = [];
    issues.push(...validateState(record.currentState).map((issue) => ({ field: "currentState", message: issue.message })));
    if (record.previousState !== null) {
      issues.push(...validateState(record.previousState).map((issue) => ({ field: "previousState", message: issue.message })));
    }
    if (record.transition !== null) issues.push(...validateTransition(record.transition));
    if (typeof record.timestamp !== "string" || record.timestamp.trim() === "") {
      issues.push({ field: "timestamp", message: "Invalid snapshot: timestamp must be text." });
    }
    issues.push(...validateMetadata(record.metadata));
    return issues;
  };

  return { validateState, validateTransition, validateGraph, validateRollback, validateMetadata, validateSnapshot };
}
