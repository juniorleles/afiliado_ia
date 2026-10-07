/**
 * Decision Intelligence Engine: engine contract.
 *
 * Interface only. The engine composes the rule registry and the validator to
 * record operational decisions from platform evidence. It does not execute
 * those decisions, create a campaign, publish a page, or call an AI model.
 * No decision, calculation, or analysis ships in this step.
 */
import type { DecisionAnalysisRequest, DecisionResult } from "./decision-analysis";
import type { DecisionRuleRegistry } from "./decision-registry";
import type { DecisionAnalysis } from "./decision-types";
import type { DecisionValidator } from "./decision-validator";

export interface DecisionEngineDependencies {
  registry: DecisionRuleRegistry;
  validator: DecisionValidator;
}

export interface DecisionEngine {
  /** Records one analysis from references only and returns the recorded analysis. */
  analyze(request: DecisionAnalysisRequest): Promise<DecisionAnalysis>;
  getAnalysis(id: string): DecisionAnalysis | null;
  /** The result of a COMPLETED analysis; null otherwise. */
  getResult(analysisId: string): DecisionResult | null;
}
