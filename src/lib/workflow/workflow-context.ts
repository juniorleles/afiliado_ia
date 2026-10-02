/**
 * Workflow Engine: read-only execution context.
 *
 * Interface only. The engine is given a Decision Analysis, a Decision Status,
 * Decision Metadata, execution metadata, runtime metadata, and configuration.
 * Each named analysis is an id holder only. The engine does not read fields
 * beyond the id, does not copy the analysis, and does not change it.
 */
import type { WorkflowMetadata } from "./workflow-types";

/**
 * Read-only bundle the engine may be given. Nothing here is written back
 * to a Decision Analysis or to any other engine.
 */
export interface WorkflowContext {
  /** The Decision Analysis this workflow reads. An id holder only. */
  decisionAnalysis: { id: string } | null;
  /** The Decision Status as text. Restated, never judged. */
  decisionStatus: string | null;
  decisionMetadata: WorkflowMetadata;
  executionMetadata: WorkflowMetadata;
  runtimeMetadata: WorkflowMetadata;
  configuration: WorkflowMetadata;
}
