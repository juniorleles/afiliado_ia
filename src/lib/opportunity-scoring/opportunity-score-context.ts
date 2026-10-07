/**
 * Host record domain: read-only opportunity scoring context.
 *
 * Interface only. One evaluation is given a market report, its evidence
 * graph, and its statistics. It does not request a page.
 */
export type OpportunityScoreMetadata = Record<string, string | number | boolean | null>;

export const OPPORTUNITY_SCORE_CONTEXT_MEMBERS = [
  "report",
  "graph",
  "statistics",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

export const OPPORTUNITY_SCORE_ENVELOPE_MEMBERS = [
  "metadata",
  "reportId",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "status",
  "issues",
  "snapshot",
  "executionTime",
] as const;

/**
 * Read-only bundle one evaluation may be given.
 * A market report result or snapshot may also carry the envelope members.
 * Nothing here is written back.
 */
export interface OpportunityScoreContext {
  report?: unknown;
  graph?: unknown;
  statistics?: unknown;
  executionMetadata?: OpportunityScoreMetadata;
  runtimeMetadata?: OpportunityScoreMetadata;
  configuration?: OpportunityScoreMetadata;
}
