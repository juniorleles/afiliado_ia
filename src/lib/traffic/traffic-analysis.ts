/**
 * Traffic Intelligence Engine: analysis request and result.
 *
 * Interface only. A traffic analysis ends in a result that says how the
 * product should be promoted. This module defines the shape of that result and
 * of the request that starts an analysis. It decides nothing and calculates
 * nothing: how a strategy is chosen and how a confidence is reached belong to
 * later steps.
 *
 * A COMPLETED analysis has a result; an analysis in any other status has none.
 * The validator holds that rule.
 */
import type { TrafficMetadata, TrafficSignal } from "./traffic-types";

/** What starts an analysis: two references, and nothing copied from what they point at. */
export interface TrafficAnalysisRequest {
  /** The Discovery candidate to analyze. */
  candidateId: string;
  /** The Opportunity analysis to follow. */
  opportunityAnalysisId: string;
}

/** The outcome of a COMPLETED analysis. */
export interface TrafficResult {
  /**
   * How the product should be promoted, as an identifier a later step defines.
   * Null when no strategy could be decided.
   */
  strategy: string | null;
  /**
   * How sure the analysis is of the strategy, as the analysis reported it.
   * Carried data with no scale defined here; null when none was reported.
   */
  confidence: number | null;
  warnings: string[];
  /** The signals the result was reached from, as they were registered. */
  signals: TrafficSignal[];
  metadata: TrafficMetadata;
}
