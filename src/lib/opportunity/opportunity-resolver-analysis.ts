/**
 * Opportunity Resolver: the unified Opportunity Analysis.
 *
 * What one run hands back: which signals exist, which ran, which failed, and
 * what they said, aggregated without interpretation. It is also a snapshot of
 * the run. It holds the resolved signals, the order they ran in, the results
 * the signals returned, the results the evidence providers returned while they
 * ran, and the execution and pipeline metadata. Anything that wants to explain
 * or inspect a run reads this snapshot; nothing needs to execute a signal or a
 * provider again. The Resolver is the only place a run is executed.
 *
 * The snapshot is plain data and deeply frozen, so it can be stored or sent as
 * JSON. It is held in memory: nothing here writes anywhere.
 *
 * It has exactly the fields below. There is no score, ranking, weight,
 * formula, or recommendation, and a validator rejects any extra field.
 *
 * Not to be confused with OpportunityAnalysis (opportunity-types.ts), the
 * earlier engine-contract record of an analysis's lifecycle. This is the
 * resolver's output and is named ResolvedOpportunityAnalysis to keep the two
 * apart.
 */
import type { OpportunityMetadata } from "./opportunity-types";
import type { SignalResult } from "./opportunity-signal-contract";
import type { EvidenceCollectionResult } from "./providers/evidence-provider-contract";
import type { OpportunityAnalysisStatus } from "./opportunity-resolver-decision";
import type { PlannedSignal } from "./opportunity-resolver-plan";

export const RESOLVED_ANALYSIS_KEYS = [
  "analysisId",
  "candidateId",
  "startedAt",
  "completedAt",
  "status",
  "registeredSignals",
  "executedSignals",
  "failedSignals",
  "warnings",
  "errors",
  "metadata",
  "executionTime",
  "resolvedSignals",
  "executionOrder",
  "signalResults",
  "providerResults",
  "executionMetadata",
  "pipelineMetadata",
] as const;

/** A registered signal as the Resolver saw it, taken from the Signal Contract members only. */
export type ResolvedSignal = PlannedSignal;

export interface ResolvedOpportunityAnalysis {
  analysisId: string;
  /** The Discovery candidate analyzed; null only when a run was refused for lacking one. */
  candidateId: string | null;
  /** ISO timestamp. */
  startedAt: string;
  /** ISO timestamp. */
  completedAt: string;
  status: OpportunityAnalysisStatus;
  /** Every registered signal, enabled or not. */
  registeredSignals: string[];
  /** Signals that ran to a result: those that completed and those that failed. Skipped signals are not included. */
  executedSignals: string[];
  /** The executed signals that failed, or whose result was rejected as invalid. */
  failedSignals: string[];
  warnings: string[];
  errors: string[];
  /** Flat. Per-signal status, confidence, timing, and metadata are carried here under `signal.<id>.`. */
  metadata: OpportunityMetadata;
  /** Milliseconds for the whole run. */
  executionTime: number;

  // ---------- the snapshot ----------

  /** Every registered signal, in registry order, with its name, version, category, and dependencies. */
  resolvedSignals: ResolvedSignal[];
  /** The order the Signal Pipeline was asked to run the enabled signals in. Empty when nothing ran. */
  executionOrder: string[];
  /** The results the signals returned, as they were accepted. A result that was rejected as invalid is not here; its signal is in failedSignals and its errors are in errors. */
  signalResults: SignalResult[];
  /** What the evidence providers returned while the signals ran, in the order they ran. Empty when no recorder was supplied or no provider ran. */
  providerResults: EvidenceCollectionResult[];
  /** The execution metadata the run was given. Flat. */
  executionMetadata: OpportunityMetadata;
  /** What the pipeline recorded about itself: stage outcomes, the decision, counts, and the evidence providers it inspected. Flat. */
  pipelineMetadata: OpportunityMetadata;
}
