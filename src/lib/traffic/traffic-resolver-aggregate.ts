/**
 * Traffic Resolver: aggregation.
 *
 * Collects what the signals reported into one place and interprets none of it.
 * It carries each signal's status, confidence, warnings, errors, metadata, and
 * execution time, and it lists which signals are available and which are
 * missing. There are no weights, no formulas, no ranking, and no combined
 * confidence: a confidence stays the signal's own, under the signal's id.
 *
 * It works only from the Signal Contract's result shape. It never looks at what
 * a signal measures, so it cannot treat one signal differently from another.
 */
import type { TrafficMetadata } from "./traffic-types";
import type { TrafficSignalResult, TrafficSignalResultStatus } from "./traffic-signal-contract";
import type { TrafficExecutionPlan } from "./traffic-resolver-plan";
import type { RejectedTrafficSignalResult } from "./traffic-resolver-validator";

/** One signal's contribution, as it reported itself. */
export interface AggregatedTrafficSignal {
  signalId: string;
  status: TrafficSignalResultStatus;
  /** The signal's own, not interpreted. Null for a signal whose result was rejected. */
  confidence: number | null;
  warningCount: number;
  errorCount: number;
  executionTime: number;
}

export interface TrafficAggregate {
  /** Signals that returned or were rejected, in run order. */
  signals: AggregatedTrafficSignal[];
  /** Signals with a COMPLETED result, in run order. */
  availableSignals: string[];
  /** Registered signals without a COMPLETED result: failed, skipped, never run, or disabled. */
  missingSignals: string[];
  /** Signals that ran to a result: completed or failed. */
  executedSignals: string[];
  failedSignals: string[];
  skippedSignals: string[];
  /** Each prefixed with the signal id. */
  warnings: string[];
  errors: string[];
  /** Flat. Everything per signal sits under `signal.<id>.`. */
  metadata: TrafficMetadata;
  /** Milliseconds the signals took, summed. They ran one after another. */
  executionTime: number;
}

export function aggregateTrafficSignalResults(
  plan: TrafficExecutionPlan,
  results: readonly TrafficSignalResult[],
  rejected: readonly RejectedTrafficSignalResult[] = [],
): TrafficAggregate {
  const byId = new Map(results.map((result) => [result.signalId, result]));
  const rejectedById = new Map(rejected.map((entry) => [entry.signalId, entry.errors]));

  const signals: AggregatedTrafficSignal[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const metadata: TrafficMetadata = {};

  for (const id of plan.order) {
    const result = byId.get(id);
    const rejectedErrors = rejectedById.get(id);
    if (rejectedErrors !== undefined) {
      signals.push({ signalId: id, status: "FAILED", confidence: null, warningCount: 0, errorCount: rejectedErrors.length, executionTime: 0 });
      for (const error of rejectedErrors) errors.push(`${id}: ${error}`);
      metadata[`signal.${id}.status`] = "FAILED";
      metadata[`signal.${id}.confidence`] = null;
      metadata[`signal.${id}.executionTime`] = 0;
      metadata[`signal.${id}.warnings`] = 0;
      metadata[`signal.${id}.errors`] = rejectedErrors.length;
      continue;
    }
    if (result === undefined) continue;
    signals.push({
      signalId: id,
      status: result.status,
      confidence: result.confidence,
      warningCount: result.warnings.length,
      errorCount: result.errors.length,
      executionTime: result.executionTime,
    });
    for (const warning of result.warnings) warnings.push(`${id}: ${warning}`);
    for (const error of result.errors) errors.push(`${id}: ${error}`);
    metadata[`signal.${id}.status`] = result.status;
    metadata[`signal.${id}.confidence`] = result.confidence;
    metadata[`signal.${id}.executionTime`] = result.executionTime;
    metadata[`signal.${id}.warnings`] = result.warnings.length;
    metadata[`signal.${id}.errors`] = result.errors.length;
    for (const [key, value] of Object.entries(result.metadata)) metadata[`signal.${id}.metadata.${key}`] = value;
  }

  for (const entry of rejected) {
    if (!plan.order.includes(entry.signalId)) for (const error of entry.errors) errors.push(`${entry.signalId}: ${error}`);
  }

  const idsWith = (status: TrafficSignalResultStatus) => signals.filter((signal) => signal.status === status).map((signal) => signal.signalId);
  const availableSignals = idsWith("COMPLETED");
  const failedSignals = idsWith("FAILED");
  const skippedSignals = idsWith("SKIPPED");
  const executedSignals = signals.filter((signal) => signal.status !== "SKIPPED").map((signal) => signal.signalId);
  const missingSignals = plan.signals.map((signal) => signal.signalId).filter((id) => !availableSignals.includes(id));
  const executionTime = signals.reduce((total, signal) => total + signal.executionTime, 0);

  metadata.availableSignals = availableSignals.join(",");
  metadata.missingSignals = missingSignals.join(",");
  metadata.failedSignals = failedSignals.join(",");
  metadata.skippedSignals = skippedSignals.join(",");
  metadata.disabledSignals = plan.disabled.join(",");
  metadata.completedCount = availableSignals.length;
  metadata.failedCount = failedSignals.length;
  metadata.skippedCount = skippedSignals.length;
  metadata.signalsExecutionTime = executionTime;

  return { signals, availableSignals, missingSignals, executedSignals, failedSignals, skippedSignals, warnings, errors, metadata, executionTime };
}
