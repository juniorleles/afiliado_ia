/**
 * Execution Planner: read-only planning context.
 *
 * Interface only. The planner is given a Decision Analysis, a workflow
 * snapshot, execution metadata, runtime metadata, and configuration. Each
 * named record is an id holder only. The planner does not read fields beyond
 * the id, does not copy the analysis or the snapshot, and does not change
 * them.
 */
import type { ExecutionMetadata } from "./execution-types";

/** Read-only context members the planner may be given. */
export const EXECUTION_CONTEXT_MEMBERS = [
  "decisionAnalysis",
  "workflowSnapshot",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/**
 * Read-only bundle the planner may be given. Nothing here is written back
 * to a Decision Analysis, a workflow snapshot, or any other engine.
 */
export interface ExecutionContext {
  /** The Decision Analysis this plan reads. An id holder only. */
  decisionAnalysis: { id: string } | null;
  /** The workflow snapshot this plan reads. An id holder only. */
  workflowSnapshot: { id: string } | null;
  executionMetadata: ExecutionMetadata;
  runtimeMetadata: ExecutionMetadata;
  configuration: ExecutionMetadata;
}
