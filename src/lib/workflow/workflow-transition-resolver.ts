/**
 * Workflow Engine: transition resolver.
 *
 * Names the unique forward next stage from a registered graph. It does not
 * choose among several forwards, does not apply a move, and does not record
 * a business choice. Invalid graphs are reported, never repaired.
 */
import { WORKFLOW_STATE_TRANSITIONS, type WorkflowState } from "./workflow-types";
import type { WorkflowIssue } from "./workflow-validator";
import { isWorkflowState, isWorkflowTerminalState } from "./workflow-transition-validator";
import type { WorkflowTransitionRegistry } from "./workflow-transition-registry";

export interface WorkflowNextState {
  state: WorkflowState | null;
  issues: WorkflowIssue[];
}

/** The unique non-failure successor, or null when the stage is final. */
export function resolveWorkflowNextState(from: unknown, registry?: WorkflowTransitionRegistry): WorkflowNextState {
  if (!isWorkflowState(from)) {
    return { state: null, issues: [{ field: "state", message: `Unknown State: "${String(from)}" is not a workflow stage.` }] };
  }
  if (isWorkflowTerminalState(from)) return { state: null, issues: [] };

  const allowed = registry ? registry.allowed(from) : WORKFLOW_STATE_TRANSITIONS[from];
  const forward = allowed.filter((state) => state !== "FAILED");
  if (forward.length === 1) return { state: forward[0], issues: [] };
  if (forward.length === 0) return { state: null, issues: [] };
  return {
    state: null,
    issues: [{ field: "state", message: "Invalid Transition: more than one forward move is registered; the machine does not choose." }],
  };
}
