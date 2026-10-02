/**
 * Workflow Engine: transition registry.
 *
 * Holds the stages and moves the state machine may use. Registering a stage
 * or a from-to pair twice is rejected. Validate reports without registering.
 * This registry never applies a move.
 */
import { WORKFLOW_STATES, WORKFLOW_STATE_TRANSITIONS, type WorkflowState, type WorkflowTransition } from "./workflow-types";
import type { WorkflowIssue } from "./workflow-validator";
import { createWorkflowTransitionValidator, type WorkflowTransitionValidator } from "./workflow-transition-validator";

export class WorkflowFrameworkError extends Error {
  constructor(
    message: string,
    readonly issues: WorkflowIssue[] = [],
  ) {
    super(message);
    this.name = "WorkflowFrameworkError";
  }
}

export interface WorkflowTransitionRegistryOptions {
  validator?: WorkflowTransitionValidator;
  /** When true (the default), the architecture graph is registered. */
  seed?: boolean;
}

export interface WorkflowTransitionRegistry {
  registerState(state: WorkflowState): WorkflowState;
  registerTransition(transition: WorkflowTransition): WorkflowTransition;
  getState(state: WorkflowState): WorkflowState | null;
  getTransition(from: WorkflowState, to: WorkflowState): WorkflowTransition | null;
  listStates(): WorkflowState[];
  listTransitions(): WorkflowTransition[];
  allowed(from: WorkflowState): readonly WorkflowState[];
  validateState(state: unknown): WorkflowIssue[];
  validateTransition(transition: unknown): WorkflowIssue[];
}

function pairKey(from: string, to: string): string {
  return `${from}->${to}`;
}

export function defaultWorkflowTransitions(): WorkflowTransition[] {
  return WORKFLOW_STATES.flatMap((from) => WORKFLOW_STATE_TRANSITIONS[from].map((to) => ({ from, to })));
}

export function createWorkflowTransitionRegistry(options: WorkflowTransitionRegistryOptions = {}): WorkflowTransitionRegistry {
  const validator = options.validator ?? createWorkflowTransitionValidator();
  const states = new Set<WorkflowState>();
  const transitions = new Map<string, WorkflowTransition>();

  const registerState = (state: WorkflowState): WorkflowState => {
    const issues = validator.validateState(state);
    if (issues.length > 0) throw new WorkflowFrameworkError("State is invalid.", issues);
    if (states.has(state)) {
      throw new WorkflowFrameworkError("State is invalid.", [{ field: "state", message: `Duplicate State: "${state}" is already registered.` }]);
    }
    states.add(state);
    return state;
  };

  const registerTransition = (transition: WorkflowTransition): WorkflowTransition => {
    const issues = validator.validateTransition(transition);
    if (issues.length > 0) throw new WorkflowFrameworkError("Transition is invalid.", issues);
    const id = pairKey(transition.from, transition.to);
    if (transitions.has(id)) {
      throw new WorkflowFrameworkError("Transition is invalid.", [{ field: "transition", message: `Duplicate Transition: "${id}" is already registered.` }]);
    }
    if (!states.has(transition.from) || !states.has(transition.to)) {
      throw new WorkflowFrameworkError("Transition is invalid.", [{ field: "transition", message: "Unknown State: both stages must be registered." }]);
    }
    transitions.set(id, { from: transition.from, to: transition.to });
    return transitions.get(id)!;
  };

  const registry: WorkflowTransitionRegistry = {
    registerState,
    registerTransition,
    getState: (state) => (states.has(state) ? state : null),
    getTransition: (from, to) => transitions.get(pairKey(from, to)) ?? null,
    listStates: () => WORKFLOW_STATES.filter((state) => states.has(state)),
    listTransitions: () => [...transitions.values()],
    allowed: (from) =>
      WORKFLOW_STATE_TRANSITIONS[from].filter((to) => transitions.has(pairKey(from, to))),
    validateState: (state) => validator.validateState(state),
    validateTransition: (transition) => validator.validateTransition(transition),
  };

  if (options.seed !== false) {
    for (const state of WORKFLOW_STATES) registerState(state);
    for (const item of defaultWorkflowTransitions()) registerTransition(item);
  }

  return registry;
}
