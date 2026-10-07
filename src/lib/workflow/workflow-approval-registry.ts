/**
 * Workflow Engine: approval registry.
 *
 * Holds the six approval states a human request may occupy. It never stores
 * snapshots, never notifies anyone, and never runs work. Registering the same
 * state twice is rejected.
 */
import type { WorkflowIssue } from "./workflow-validator";
import { WorkflowFrameworkError } from "./workflow-transition-registry";

export const WORKFLOW_APPROVAL_STATES = [
  "PendingApproval",
  "Approved",
  "Rejected",
  "NeedsChanges",
  "Cancelled",
  "Expired",
] as const;
export type WorkflowApprovalState = (typeof WORKFLOW_APPROVAL_STATES)[number];

export interface WorkflowApprovalRegistry {
  register(state: WorkflowApprovalState): WorkflowApprovalState;
  get(state: WorkflowApprovalState): WorkflowApprovalState | null;
  list(): WorkflowApprovalState[];
  validate(state: unknown): WorkflowIssue[];
}

export function isWorkflowApprovalState(value: unknown): value is WorkflowApprovalState {
  return typeof value === "string" && (WORKFLOW_APPROVAL_STATES as readonly string[]).includes(value);
}

export function createWorkflowApprovalRegistry(options: { seed?: boolean } = {}): WorkflowApprovalRegistry {
  const states = new Set<WorkflowApprovalState>();

  const validate = (state: unknown): WorkflowIssue[] => {
    if (!isWorkflowApprovalState(state)) {
      return [{ field: "decision", message: `Invalid State: "${String(state)}" is not an approval state.` }];
    }
    return [];
  };

  const register = (state: WorkflowApprovalState): WorkflowApprovalState => {
    const issues = validate(state);
    if (issues.length > 0) throw new WorkflowFrameworkError("Approval is invalid.", issues);
    if (states.has(state)) {
      throw new WorkflowFrameworkError("Approval is invalid.", [
        { field: "decision", message: `Duplicate Approval: state "${state}" is already registered.` },
      ]);
    }
    states.add(state);
    return state;
  };

  const registry: WorkflowApprovalRegistry = {
    register,
    get: (state) => (states.has(state) ? state : null),
    list: () => WORKFLOW_APPROVAL_STATES.filter((state) => states.has(state)),
    validate,
  };

  if (options.seed !== false) {
    for (const state of WORKFLOW_APPROVAL_STATES) register(state);
  }

  return registry;
}
