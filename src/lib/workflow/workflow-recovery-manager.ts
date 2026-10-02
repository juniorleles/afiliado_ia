/**
 * Workflow Engine: recovery manager.
 *
 * Names how a recorded failure may be recovered: resume, restart a stage,
 * move to manual review, archive, or mark as failed. It never applies a
 * lifecycle move, never retries, never reaches an outside system, and never
 * runs work.
 */
import type { WorkflowState } from "./workflow-types";
import type { WorkflowIssue } from "./workflow-validator";
import { freezeDeepWorkflow } from "./workflow-state-snapshot";
import {
  createWorkflowRecoveryPolicy,
  type WorkflowRecoveryAction,
} from "./workflow-recovery-policy";
import {
  createWorkflowRetryManager,
  type WorkflowFailureSnapshot,
  type WorkflowRetryManager,
} from "./workflow-retry-manager";

export interface WorkflowRecoveryResult {
  status: "RESUMED" | "RESTARTED" | "MOVED_TO_REVIEW" | "ARCHIVED" | "MARKED_FAILED" | "REJECTED";
  item: WorkflowFailureSnapshot | null;
  issues: WorkflowIssue[];
}

export interface WorkflowRecoveryManager {
  readonly retries: WorkflowRetryManager;
  resume(id: string): WorkflowRecoveryResult;
  restartState(id: string, state: WorkflowState): WorkflowRecoveryResult;
  moveToManualReview(id: string): WorkflowRecoveryResult;
  archiveWorkflow(id: string): WorkflowRecoveryResult;
  markAsFailed(id: string): WorkflowRecoveryResult;
}

export interface WorkflowRecoveryManagerOptions {
  retries?: WorkflowRetryManager;
  now?: () => number;
  timestamp?: () => string;
  idFactory?: () => string;
}

const STATUS_BY_ACTION: Record<WorkflowRecoveryAction, Exclude<WorkflowRecoveryResult["status"], "REJECTED">> = {
  Resume: "RESUMED",
  RestartState: "RESTARTED",
  MoveToManualReview: "MOVED_TO_REVIEW",
  ArchiveWorkflow: "ARCHIVED",
  MarkAsFailed: "MARKED_FAILED",
};

function rejected(issues: WorkflowIssue[]): WorkflowRecoveryResult {
  return freezeDeepWorkflow({ status: "REJECTED" as const, item: null, issues });
}

export function createWorkflowRecoveryManager(options: WorkflowRecoveryManagerOptions = {}): WorkflowRecoveryManager {
  const retries =
    options.retries ??
    createWorkflowRetryManager({
      now: options.now,
      timestamp: options.timestamp,
      idFactory: options.idFactory,
    });

  const apply = (id: string, action: WorkflowRecoveryAction, restartState: WorkflowState | null = null): WorkflowRecoveryResult => {
    const policy = createWorkflowRecoveryPolicy({ action, restartState });
    const result = retries.recover(id, policy);
    if (result.status === "REJECTED") return rejected(result.issues);
    return freezeDeepWorkflow({ status: STATUS_BY_ACTION[action], item: result.item, issues: [] });
  };

  return {
    retries,
    resume: (id) => apply(id, "Resume"),
    restartState: (id, state) => apply(id, "RestartState", state),
    moveToManualReview: (id) => apply(id, "MoveToManualReview"),
    archiveWorkflow: (id) => apply(id, "ArchiveWorkflow"),
    markAsFailed: (id) => apply(id, "MarkAsFailed"),
  };
}
