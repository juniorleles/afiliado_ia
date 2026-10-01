/**
 * Opportunity Engine: engine contract.
 *
 * Interface only. The engine composes the signal registry and the validator to
 * decide whether a discovered candidate is an opportunity. No scoring,
 * calculation, analysis, or AI ships in this step.
 */
import type { OpportunityResult } from "./opportunity-result";
import type { OpportunitySignalRegistry } from "./opportunity-registry";
import type { OpportunityAnalysis } from "./opportunity-types";
import type { OpportunityValidator } from "./opportunity-validator";

export interface OpportunityEngineDependencies {
  registry: OpportunitySignalRegistry;
  validator: OpportunityValidator;
}

export interface OpportunityEngine {
  /** Analyzes one candidate and returns the recorded analysis. */
  analyze(candidateId: string): Promise<OpportunityAnalysis>;
  getAnalysis(id: string): OpportunityAnalysis | null;
  /** The result of a COMPLETED analysis; null otherwise. */
  getResult(analysisId: string): OpportunityResult | null;
}
