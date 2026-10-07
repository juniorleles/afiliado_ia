/**
 * Traffic Resolver: the unified Traffic Analysis snapshot.
 *
 * What one run hands back: which signals exist, which ran, which failed, and
 * what they said, aggregated without interpretation. It is also a snapshot of
 * the run. Anything that wants to explain or inspect a run reads this
 * snapshot; nothing needs to execute a signal again. The Resolver is the only
 * place a run is executed.
 *
 * The snapshot is plain data and deeply frozen, so it can be stored or sent as
 * JSON. It is held in memory: nothing here writes anywhere.
 *
 * It has exactly the fields below. There is no score, ranking, weight,
 * formula, or recommendation, and a validator rejects any extra field.
 *
 * Not to be confused with TrafficAnalysis (traffic-types.ts), the earlier
 * engine-contract record of an analysis's lifecycle. This is the resolver's
 * output and is named ResolvedTrafficAnalysis to keep the two apart.
 */
import type { TrafficSignalResult } from "./traffic-signal-contract";
import type { TrafficMetadata } from "./traffic-types";
import type { TrafficAnalysisStatus } from "./traffic-resolver-decision";
import type { PlannedTrafficSignal } from "./traffic-resolver-plan";

export const RESOLVED_TRAFFIC_ANALYSIS_KEYS = [
  "analysisId",
  "candidateId",
  "status",
  "startedAt",
  "completedAt",
  "registeredSignals",
  "executedSignals",
  "failedSignals",
  "signalResults",
  "warnings",
  "errors",
  "metadata",
  "executionTime",
  "resolvedSignals",
  "executionOrder",
  "executionMetadata",
  "pipelineMetadata",
  "opportunityAnalysisId",
] as const;

/** A registered signal as the Resolver saw it, taken from the Signal Contract members only. */
export type ResolvedTrafficSignal = PlannedTrafficSignal;

export interface ResolvedTrafficAnalysis {
  analysisId: string;
  /** The Discovery candidate analyzed; null only when a run was refused for lacking one. */
  candidateId: string | null;
  status: TrafficAnalysisStatus;
  /** ISO timestamp. */
  startedAt: string;
  /** ISO timestamp. */
  completedAt: string;
  /** Every registered signal, enabled or not. */
  registeredSignals: string[];
  /** Signals that ran to a result: those that completed and those that failed. Skipped signals are not included. */
  executedSignals: string[];
  /** The executed signals that failed, or whose result was rejected as invalid. */
  failedSignals: string[];
  /** The results the signals returned, as they were accepted. A result that was rejected as invalid is not here. */
  signalResults: TrafficSignalResult[];
  warnings: string[];
  errors: string[];
  /** Flat. Per-signal status, confidence, timing, and metadata are carried here under `signal.<id>.`. */
  metadata: TrafficMetadata;
  /** Milliseconds for the whole run. */
  executionTime: number;

  // ---------- the snapshot ----------

  /** Every registered signal, in registry order, with its name, version, category, and dependencies. */
  resolvedSignals: ResolvedTrafficSignal[];
  /** The order the Signal Pipeline was asked to run the enabled signals in. Empty when nothing ran. */
  executionOrder: string[];
  /** The execution metadata the run was given. Flat. */
  executionMetadata: TrafficMetadata;
  /** What the pipeline recorded about itself: stage outcomes, the decision, and counts. Flat. */
  pipelineMetadata: TrafficMetadata;
  /** The Opportunity analysis this run followed; null only when a run was refused for lacking one. */
  opportunityAnalysisId: string | null;
}
