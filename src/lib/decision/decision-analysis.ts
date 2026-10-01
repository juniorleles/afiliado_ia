/**
 * Decision Intelligence Engine: analysis request, context, and result.
 *
 * Interface only. A decision analysis ends in a result that restates evidence
 * and rules. This module defines the shape of that result and of the request
 * that starts an analysis. It decides nothing and calculates nothing. It
 * never names an action, an execution plan, or a campaign.
 *
 * A COMPLETED analysis has a result; an analysis in any other status has none.
 * The validator holds that rule.
 */
import type { DecisionEvidence, DecisionMetadata, DecisionRule } from "./decision-types";

/**
 * What starts an analysis: references and flat metadata, and nothing copied
 * from what the references point at.
 */
export interface DecisionAnalysisRequest {
  candidateId: string | null;
  opportunityAnalysisId: string | null;
  trafficAnalysisId: string | null;
  pageAnalysisId: string | null;
  executionMetadata: DecisionMetadata;
  runtimeMetadata: DecisionMetadata;
  configuration: DecisionMetadata;
}

/**
 * Read-only bundle the resolver may be given. Each named analysis is an id
 * holder only. The engine does not read fields beyond the id.
 */
export interface DecisionContext {
  candidate: { id: string } | null;
  opportunityAnalysis: { id: string } | null;
  trafficAnalysis: { id: string } | null;
  pageAnalysis: { id: string } | null;
  executionMetadata: DecisionMetadata;
  runtimeMetadata: DecisionMetadata;
  configuration: DecisionMetadata;
}

/** The outcome of a COMPLETED analysis. No actions and no execution plan. */
export interface DecisionResult {
  evidenceSummary: string[];
  ruleSummary: string[];
  evidence: DecisionEvidence[];
  rules: DecisionRule[];
  warnings: string[];
  metadata: DecisionMetadata;
}
