/**
 * Workflow Engine: domain model.
 *
 * Architecture only. This engine moves a candidate through platform stages.
 * It does not analyze a product, record a business choice, or reach an
 * outside system. This module names the shapes the engine will exchange and
 * defines no scale or rule. Other engines are referred to by id only; a
 * workflow never copies or changes a Decision Analysis.
 */

/** Stages a candidate may occupy. */
export const WORKFLOW_STATES = [
  "CREATED",
  "DISCOVERED",
  "OPPORTUNITY_ANALYZED",
  "TRAFFIC_ANALYZED",
  "LP_GENERATED",
  "UNDER_REVIEW",
  "READY_FOR_PUBLICATION",
  "PUBLISHED",
  "MONITORING",
  "ARCHIVED",
  "FAILED",
] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

/**
 * The only moves between stages. ARCHIVED and FAILED are final: a closed
 * workflow is never reopened, so a finished run cannot be brought back.
 * The graph is a single forward path plus FAILED. There is no loop.
 */
export const WORKFLOW_STATE_TRANSITIONS: Readonly<Record<WorkflowState, readonly WorkflowState[]>> = {
  CREATED: ["DISCOVERED", "FAILED"],
  DISCOVERED: ["OPPORTUNITY_ANALYZED", "FAILED"],
  OPPORTUNITY_ANALYZED: ["TRAFFIC_ANALYZED", "FAILED"],
  TRAFFIC_ANALYZED: ["LP_GENERATED", "FAILED"],
  LP_GENERATED: ["UNDER_REVIEW", "FAILED"],
  UNDER_REVIEW: ["READY_FOR_PUBLICATION", "FAILED"],
  READY_FOR_PUBLICATION: ["PUBLISHED", "FAILED"],
  PUBLISHED: ["MONITORING", "FAILED"],
  MONITORING: ["ARCHIVED", "FAILED"],
  ARCHIVED: [],
  FAILED: [],
};

/** Read-only context members the engine may be given. */
export const WORKFLOW_CONTEXT_MEMBERS = [
  "decisionAnalysis",
  "decisionStatus",
  "decisionMetadata",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/** Flat metadata: strings, numbers, booleans, or null. */
export type WorkflowMetadata = Record<string, string | number | boolean | null>;

/** One lifecycle of one candidate. Timestamps are ISO strings. */
export interface Workflow {
  id: string;
  /** The Discovery candidate this workflow follows. A reference only. */
  candidateId: string | null;
  /** The Decision Analysis this workflow reads. A reference only. */
  decisionAnalysisId: string | null;
  state: WorkflowState;
  createdAt: string;
  updatedAt: string;
  /** Null until the workflow is ARCHIVED or FAILED. */
  completedAt: string | null;
  version: number;
  /** Elapsed time in milliseconds as the run reported it; null until ARCHIVED or FAILED. */
  executionTime: number | null;
  metadata: WorkflowMetadata;
}

/** One allowed move from one stage to another. */
export interface WorkflowTransition {
  from: WorkflowState;
  to: WorkflowState;
}

/** One named event waiting to be applied. The architecture does not apply it. */
export interface WorkflowEvent {
  id: string;
  name: string;
  metadata: WorkflowMetadata;
}

/** What one inspect returns. No plan and no numeric result. */
export interface WorkflowSnapshot {
  state: WorkflowState;
  allowedTransitions: WorkflowState[];
  pendingEvents: WorkflowEvent[];
  metadata: WorkflowMetadata;
  executionTime: number;
}
