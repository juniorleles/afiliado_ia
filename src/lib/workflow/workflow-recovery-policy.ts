/**
 * Workflow Engine: recovery policy.
 *
 * Names the recovery action a failure may take. It never applies a lifecycle
 * move, never archives by itself, and never runs work.
 */
import type { WorkflowState } from "./workflow-types";
import type { WorkflowIssue } from "./workflow-validator";
import { freezeDeepWorkflow } from "./workflow-state-snapshot";
import { isWorkflowState } from "./workflow-transition-validator";

export const WORKFLOW_RECOVERY_ACTIONS = [
  "Resume",
  "RestartState",
  "MoveToManualReview",
  "ArchiveWorkflow",
  "MarkAsFailed",
] as const;
export type WorkflowRecoveryAction = (typeof WORKFLOW_RECOVERY_ACTIONS)[number];

export interface WorkflowRecoveryPolicy {
  action: WorkflowRecoveryAction;
  restartState: WorkflowState | null;
}

export function isWorkflowRecoveryAction(value: unknown): value is WorkflowRecoveryAction {
  return typeof value === "string" && (WORKFLOW_RECOVERY_ACTIONS as readonly string[]).includes(value);
}

export function isWorkflowRecoveryClosed(action: string | null | undefined): boolean {
  return action === "ArchiveWorkflow" || action === "MarkAsFailed";
}

export function createWorkflowRecoveryPolicy(input: {
  action: WorkflowRecoveryAction;
  restartState?: WorkflowState | null;
} ): WorkflowRecoveryPolicy {
  return freezeDeepWorkflow({
    action: input.action,
    restartState: input.restartState ?? null,
  });
}

export function validateWorkflowRecoveryPolicy(input: unknown): WorkflowIssue[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return [{ field: "recoveryPolicy", message: "Invalid Recovery Policy: a recovery policy must be an object." }];
  }
  const value = input as Record<string, unknown>;
  if (!isWorkflowRecoveryAction(value.action)) {
    return [{ field: "action", message: `Invalid Recovery Policy: "${String(value.action)}" is not a recovery action.` }];
  }
  if (value.action === "RestartState") {
    if (value.restartState === undefined || value.restartState === null || value.restartState === "") {
      return [{ field: "restartState", message: "Invalid Recovery Policy: Restart State requires a workflow stage." }];
    }
    if (!isWorkflowState(value.restartState)) {
      return [{ field: "restartState", message: `Invalid Recovery Policy: "${String(value.restartState)}" is not a workflow stage.` }];
    }
  } else if (value.restartState !== undefined && value.restartState !== null) {
    return [{ field: "restartState", message: `Invalid Recovery Policy: ${value.action} does not take a restart stage.` }];
  }
  return [];
}
