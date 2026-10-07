/**
 * Decision Intelligence Engine: domain model.
 *
 * Architecture only. This engine reads platform evidence and records
 * operational decisions. It does not execute those decisions, create a
 * campaign, or publish a page. This module names the shapes the engine will
 * exchange and defines no scale, weight, formula, or rule. Other engines are
 * referred to by id only; a decision analysis never copies or changes them.
 */

/** Lifecycle of an analysis. */
export const DECISION_STATUSES = ["PENDING", "ANALYZING", "COMPLETED", "FAILED"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

/**
 * The only moves between statuses. COMPLETED and FAILED are final: a finished
 * analysis is never reopened, so a closed decision cannot be brought back.
 */
export const DECISION_STATUS_TRANSITIONS: Readonly<Record<DecisionStatus, readonly DecisionStatus[]>> = {
  PENDING: ["ANALYZING", "FAILED"],
  ANALYZING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
};

/** Read-only context members the resolver may be given. */
export const DECISION_CONTEXT_MEMBERS = [
  "candidate",
  "opportunityAnalysis",
  "trafficAnalysis",
  "pageAnalysis",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;
export type DecisionMetadata = Record<string, string | number | boolean | null>;

/** One analysis of operational decisions for one set of platform references. Timestamps are ISO strings. */
export interface DecisionAnalysis {
  id: string;
  /** The Discovery candidate under analysis. A reference only. */
  candidateId: string | null;
  /** The Opportunity analysis this one follows. A reference only. */
  opportunityAnalysisId: string | null;
  /** The Traffic analysis this one follows. A reference only. */
  trafficAnalysisId: string | null;
  /** The page analysis this one follows. A reference only. */
  pageAnalysisId: string | null;
  status: DecisionStatus;
  createdAt: string;
  /** Null until the analysis is COMPLETED or FAILED. */
  completedAt: string | null;
  version: number;
  /** Elapsed time in milliseconds as the analysis reported it; null until COMPLETED or FAILED. */
  executionTime: number | null;
}

/** A single named rule the engine may apply. Changed only through the registry. */
export interface DecisionRule {
  id: string;
  enabled: boolean;
  metadata: DecisionMetadata;
}

/** One piece of evidence the analysis restated, named by id only. */
export interface DecisionEvidence {
  id: string;
  /** The source record this evidence was restated from, as an id. */
  sourceId: string;
  summary: string;
  metadata: DecisionMetadata;
}
