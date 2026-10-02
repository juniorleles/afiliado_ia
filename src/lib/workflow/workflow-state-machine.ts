/**
 * Workflow Engine: state machine contract.
 *
 * Interface only. The allowed moves are named in workflow-types.ts. This
 * module does not advance a workflow, does not apply an event, and does not
 * record a business choice. No implementation ships in this step.
 */
import type { WorkflowState } from "./workflow-types";

export interface WorkflowStateMachine {
  /** Allowed next stages from `from`. Empty when the stage is final. */
  allowedTransitions(from: WorkflowState): readonly WorkflowState[];
  /** True when the named move is allowed. */
  canTransition(from: WorkflowState, to: WorkflowState): boolean;
}
