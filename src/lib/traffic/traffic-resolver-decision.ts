/**
 * Traffic Resolver: decision model.
 *
 * A decision describes how the analysis run ended, from the counts of what
 * ran. It is not a judgement of how the product should be promoted: it rates
 * nothing and recommends nothing. There are no weights and no formula, only
 * these cases, tested in order:
 *
 *   REFUSED    the run was refused before any signal ran
 *   FAILED     the signals could not be run, or none of the enabled ones completed
 *   COMPLETED  every enabled signal completed
 *   PARTIAL    some enabled signals completed and the rest failed or were skipped
 *
 * A skipped signal did not complete, so it keeps an analysis from COMPLETED.
 */

export const TRAFFIC_ANALYSIS_STATUSES = ["COMPLETED", "PARTIAL", "FAILED", "REFUSED"] as const;
export type TrafficAnalysisStatus = (typeof TRAFFIC_ANALYSIS_STATUSES)[number];

export const TRAFFIC_DECISION_SCOPE_NOTE =
  "The decision describes how the analysis run ended. It is not a score, a ranking, or a recommendation.";

/** What a decision is made from. */
export interface TrafficDecisionBasis {
  /** Reasons the run was refused; empty when it was not. */
  refusals: readonly string[];
  /** Why the signals could not be run at all; null when they ran. */
  runError: string | null;
  /** Enabled signals in the plan. */
  enabled: number;
  completed: number;
  failed: number;
  skipped: number;
}

export interface TrafficDecision {
  status: TrafficAnalysisStatus;
  /** Plain statements of the facts behind the status. */
  reasons: string[];
  enabledCount: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
}

export function decideTraffic(basis: TrafficDecisionBasis): TrafficDecision {
  const counts = {
    enabledCount: basis.enabled,
    completedCount: basis.completed,
    failedCount: basis.failed,
    skippedCount: basis.skipped,
  };
  if (basis.refusals.length > 0) return { status: "REFUSED", reasons: basis.refusals.map((r) => `Refused: ${r}`), ...counts };
  if (basis.runError !== null) return { status: "FAILED", reasons: [`The signals could not be run: ${basis.runError}`], ...counts };
  if (basis.enabled === 0) return { status: "REFUSED", reasons: ["Refused: no signal is enabled."], ...counts };
  if (basis.completed === basis.enabled) return { status: "COMPLETED", reasons: ["Every enabled signal completed."], ...counts };
  if (basis.completed === 0) return { status: "FAILED", reasons: ["No enabled signal completed."], ...counts };
  return {
    status: "PARTIAL",
    reasons: [`${basis.completed} of ${basis.enabled} enabled signals completed; ${basis.failed} failed and ${basis.skipped} were skipped.`],
    ...counts,
  };
}
