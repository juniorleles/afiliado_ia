/**
 * Workflow Engine: validator contract.
 *
 * Interface only. Each method reports problems and never throws or changes its
 * input. No graph walks ship in this step. The rules a later step must hold:
 *
 *  - Duplicate State: a second registration of the same stage is rejected;
 *  - Duplicate Transition: a second registration of the same from-to pair is
 *    rejected;
 *  - Invalid Transition: a move that is not an allowed next stage, or that
 *    names an unknown stage, is rejected;
 *  - Circular Transition: a cycle in the graph is rejected;
 *  - Invalid Metadata: metadata must be a flat record of text, numbers,
 *    booleans, or null.
 *
 * This validator does not judge a Decision Analysis or a candidate.
 */
import type { WorkflowTransition } from "./workflow-types";

export interface WorkflowIssue {
  field: string;
  message: string;
}

export interface WorkflowValidator {
  validateState(input: unknown): WorkflowIssue[];
  validateTransition(input: unknown): WorkflowIssue[];
  validateWorkflow(input: unknown): WorkflowIssue[];
  validateSnapshot(input: unknown): WorkflowIssue[];
  validateContext(input: unknown): WorkflowIssue[];
  validateMetadata(input: unknown): WorkflowIssue[];
  /** Circular Transition, Invalid Transition, Duplicate Transition. */
  validateGraph(transitions: WorkflowTransition[]): WorkflowIssue[];
}
