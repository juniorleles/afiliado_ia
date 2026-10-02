/**
 * Workflow Engine: registry contract.
 *
 * Interface only. The registry is the single list of stages and moves the
 * engine may use. It supports registering a stage, registering a move,
 * validating one without registering it, and listing them. No implementation
 * ships in this step.
 *
 * Register rejects a duplicate stage or a duplicate from-to pair. Validate
 * reports without registering.
 */
import type { WorkflowIssue } from "./workflow-validator";
import type { WorkflowState, WorkflowTransition } from "./workflow-types";

export interface WorkflowRegistry {
  /** Adds a stage. Rejects an invalid stage or a duplicate stage. */
  registerState(state: WorkflowState): WorkflowState;
  /** Adds a move. Rejects an invalid move or a duplicate from-to pair. */
  registerTransition(transition: WorkflowTransition): WorkflowTransition;
  getState(state: WorkflowState): WorkflowState | null;
  getTransition(from: WorkflowState, to: WorkflowState): WorkflowTransition | null;
  listStates(): WorkflowState[];
  listTransitions(): WorkflowTransition[];
  /** Reports problems with a stage without registering it. */
  validateState(state: unknown): WorkflowIssue[];
  /** Reports problems with a move without registering it. */
  validateTransition(transition: unknown): WorkflowIssue[];
}
